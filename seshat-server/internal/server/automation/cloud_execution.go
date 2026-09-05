package automation

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"gorm.io/gorm"

	sdkautomation "github.com/KPO-Tech/seshat/pkg/automation"
	sdkconfig "github.com/KPO-Tech/seshat/pkg/config"
	"github.com/KPO-Tech/seshat/pkg/dataflow"
	sdkproviders "github.com/KPO-Tech/seshat/pkg/providers"
	sdkrag "github.com/KPO-Tech/seshat/pkg/rag"
	"github.com/KPO-Tech/seshat/pkg/sdk"
	sdktypes "github.com/KPO-Tech/seshat/pkg/types"
	"github.com/KPO-Tech/seshat/pkg/workflow"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
)

// cloudMaxTokens caps a single cloud job's response. Not yet exposed as a
// per-job setting — a reasonable fixed default until there's a concrete
// need to tune it per job.
const cloudMaxTokens = 4096

// jobWorkflow adapts a queued cloud run to the automation.Workflow interface
// the absorbed Runner/Executor expects. It only ever calls SubmitMessage —
// the model itself decides whether to call a tool during that turn.
//
// Bash IS reachable here: the SDK's sdk.NewClient registers the bash tool
// unconditionally on every client (there is no tool allowlist in
// ClientConfig), and the default "mono_run" surface profile includes it —
// verified by reading the SDK directly, not assumed from an older comment
// that used to claim otherwise here and was wrong. executeCloudRun sets
// RequireSandbox: true on the RunnerConfig below (same posture
// workspacechat.Service.getOrCreateSession already has, see its own
// comment) so a model-issued shell command either runs Landlock-confined
// (Linux hosts where the kernel supports it) or is refused outright — never
// unconfined on this shared multi-tenant host. rag_search/rag_ingest are
// available whenever a RAGService is resolved for the job's organization,
// and read_document_url whenever docling is configured server-wide.
type jobWorkflow struct {
	id          string
	description string
	prompt      string
	// graph, when non-nil (job.GraphJSON was set), runs instead of prompt —
	// see runGraph below. registry/secrets are threaded from Service so a
	// graph node can resolve org-scoped dataflow secrets and reach the node
	// types this deployment registered (see Service.nodeRegistry).
	graph        *dataflow.Definition
	registry     *dataflow.Registry
	organization string
	ownerID      string
	secrets      DataflowSecretResolver
	// triggerPayload is JSON-encoded external data (currently only set for
	// webhook-triggered runs - see JobRun.TriggerPayload) merged into the
	// graph's seed under a "webhook" key by runGraph below. Empty for every
	// other trigger, which changes nothing about their existing seed.
	triggerPayload string
	// nodeTrace is populated by runGraph as a side effect (dataflow.Run's
	// own Result is otherwise discarded once success/failure is checked) -
	// executeCloudRun reads it directly off this struct after Run returns,
	// regardless of outcome, rather than threading it through Run's fixed
	// (ctx, session) error signature.
	nodeTrace []sdb.NodeTraceEntry
}

func (w *jobWorkflow) Name() string        { return w.id }
func (w *jobWorkflow) Description() string { return w.description }
func (w *jobWorkflow) Run(ctx context.Context, session *sdk.Session) error {
	if w.graph != nil {
		return w.runGraph(ctx, session)
	}
	_, err := session.SubmitMessage(ctx, w.prompt)
	return err
}

// runGraph mirrors internal/automation.runGraph in the seshat SDK (see its
// doc comment) — reimplemented here rather than imported because this
// jobWorkflow adapts a different job model (sdb.ScheduledJob, this
// package's own cloud-execution path) than the SDK's own Job/JobScheduler,
// which seshat-server does not use for cloud-targeted runs.
func (w *jobWorkflow) runGraph(ctx context.Context, session *sdk.Session) error {
	if w.registry == nil {
		return fmt.Errorf("job has a Graph but this deployment has no dataflow node registry configured")
	}
	var secrets dataflow.SecretResolver
	if w.secrets != nil {
		secrets = orgScopedSecretResolver{resolver: w.secrets, organizationID: w.organization}
	}
	rt := &dataflow.Runtime{
		Secrets:     secrets,
		Agent:       dataflowAgentCaller{session: session},
		Subworkflow: dataflowSubworkflowRunner{session: session},
	}
	// Seeds the graph's starting nodes with the run's job/owner/org identity
	// — the same pattern Inbox's event-triggered graphs already use for
	// event_context — so a node like "gmail_new_messages" can resolve which
	// mailbox/cursor to poll without that identity being authored into the
	// graph definition itself (see GmailPollNode's doc comment).
	seedItem := dataflow.Item{
		"job_id":          w.id,
		"owner_id":        w.ownerID,
		"organization_id": w.organization,
	}
	if w.triggerPayload != "" {
		var webhookPayload any
		if err := json.Unmarshal([]byte(w.triggerPayload), &webhookPayload); err == nil {
			seedItem["webhook"] = webhookPayload
		}
	}
	seed := []dataflow.Item{seedItem}
	result, err := dataflow.Run(ctx, *w.graph, w.registry, rt, seed, dataflow.Options{})
	if err != nil {
		return fmt.Errorf("run graph: %w", err)
	}
	w.nodeTrace = buildNodeTrace(result)
	if !result.Success {
		for _, id := range result.Order {
			if r := result.Results[id]; !r.Success && r.Error != "" {
				return fmt.Errorf("graph %q failed at node %q: %s", w.graph.Name, id, r.Error)
			}
		}
		return fmt.Errorf("graph %q failed", w.graph.Name)
	}
	return nil
}

// buildNodeTrace converts the dataflow engine's own Result (already
// computed by dataflow.Run, otherwise discarded once success/failure is
// checked) into the DB-persisted shape - iterates Order so the trace
// reflects actual execution order rather than map iteration order.
func buildNodeTrace(result dataflow.Result) []sdb.NodeTraceEntry {
	trace := make([]sdb.NodeTraceEntry, 0, len(result.Order))
	for _, id := range result.Order {
		r, ok := result.Results[id]
		if !ok {
			continue
		}
		var outputByPort map[string][]map[string]any
		if len(r.OutputByPort) > 0 {
			outputByPort = make(map[string][]map[string]any, len(r.OutputByPort))
			for port, items := range r.OutputByPort {
				outputByPort[port] = itemsToMaps(items)
			}
		}
		var inputSource []sdb.NodeItemSource
		if len(r.InputSource) > 0 {
			inputSource = make([]sdb.NodeItemSource, len(r.InputSource))
			for i, s := range r.InputSource {
				inputSource[i] = sdb.NodeItemSource{Node: s.Node, Port: s.Port}
			}
		}
		trace = append(trace, sdb.NodeTraceEntry{
			ID:           r.ID,
			Type:         r.Type,
			Success:      r.Success,
			Skipped:      r.Skipped,
			Error:        r.Error,
			Input:        itemsToMaps(r.Input),
			InputSource:  inputSource,
			Output:       itemsToMaps(r.Output),
			OutputByPort: outputByPort,
			StartedAt:    r.StartedAt,
			EndedAt:      r.EndedAt,
			DurationMS:   r.Duration.Milliseconds(),
		})
	}
	return trace
}

// itemsToMaps converts a dataflow.Item slice ([]map[string]any under the
// hood) to the plain []map[string]any shape sdb.NodeTraceEntry persists -
// nil in, nil out, so an empty/absent field stays omitted (`omitempty`)
// rather than becoming an allocated empty slice.
func itemsToMaps(items []dataflow.Item) []map[string]any {
	if items == nil {
		return nil
	}
	out := make([]map[string]any, len(items))
	for i, item := range items {
		out[i] = map[string]any(item)
	}
	return out
}

// orgScopedSecretResolver binds one organization to Service's
// DataflowSecretResolver, satisfying pkg/dataflow.SecretResolver's
// narrower (organization-free) Resolve signature — see RunnerConfig.Secrets'
// doc comment in the SDK for why this per-execution scoping happens at the
// call site rather than in the interface itself.
type orgScopedSecretResolver struct {
	resolver       DataflowSecretResolver
	organizationID string
}

func (r orgScopedSecretResolver) Resolve(ctx context.Context, ref string) (string, error) {
	return r.resolver.ResolveDataflowSecret(ctx, r.organizationID, ref)
}

// dataflowAgentCaller/dataflowSubworkflowRunner mirror
// internal/automation's sessionAgentCaller/sessionSubworkflowRunner in the
// SDK (see its dataflow_adapter.go) — reimplemented here for the same
// reason as runGraph above: this package's session comes from its own
// executeCloudRun, not the SDK's JobScheduler.
type dataflowAgentCaller struct{ session *sdk.Session }

func (a dataflowAgentCaller) Ask(ctx context.Context, _ string, prompt string) (string, error) {
	resp, err := a.session.SubmitMessage(ctx, prompt)
	if err != nil {
		return "", err
	}
	return lastAssistantText(resp.Messages), nil
}

type dataflowSubworkflowRunner struct{ session *sdk.Session }

func (r dataflowSubworkflowRunner) Run(ctx context.Context, def workflow.Definition) (workflow.Result, error) {
	executor := workflow.ExecutorFunc(func(execCtx context.Context, node workflow.Node, inputs map[string]workflow.NodeResult) (string, error) {
		resp, err := r.session.SubmitMessage(execCtx, workflow.BuildNodePrompt(node, inputs))
		if err != nil {
			return "", err
		}
		return lastAssistantText(resp.Messages), nil
	})
	return workflow.Run(ctx, def, executor, workflow.Options{})
}

func lastAssistantText(messages []sdktypes.Message) string {
	for i := len(messages) - 1; i >= 0; i-- {
		if messages[i].Role != sdktypes.RoleAssistant {
			continue
		}
		var text string
		for _, block := range messages[i].Content {
			if tc, ok := block.(sdktypes.TextContent); ok {
				text += tc.Text
			}
		}
		return text
	}
	return ""
}

// executeCloudRun runs one queued cloud-targeted run against the org's
// configured LLM provider. Never called from inside a DB transaction — the
// LLM call itself can take many seconds, and this codebase's SQLite pool is
// capped at one connection (see the automation-package deadlock lesson);
// each DB touch below is its own short-lived transaction/query instead.
func (s *Service) executeCloudRun(ctx context.Context, runID string) error {
	var run sdb.JobRun
	if err := s.db.Gorm().WithContext(ctx).First(&run, "id = ?", runID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil
		}
		return err
	}
	if run.Status != RunStatusQueued || run.ExecutionTarget != ExecutionTargetCloud {
		return nil // already picked up (or reaped, or no longer a queued cloud run)
	}

	now := time.Now().UTC()
	claim := s.db.Gorm().WithContext(ctx).Model(&sdb.JobRun{}).Where("id = ? AND status = ?", run.ID, RunStatusQueued).
		Updates(map[string]any{"status": RunStatusRunning, "started_at": now})
	if claim.Error != nil {
		return claim.Error
	}
	if claim.RowsAffected == 0 {
		return nil // no longer queued (e.g. cancelled) before execution could start
	}

	var job sdb.ScheduledJob
	if err := s.db.Gorm().WithContext(ctx).First(&job, "id = ?", run.JobID).Error; err != nil {
		return s.markCloudRunFailed(ctx, run.ID, "job no longer exists: "+err.Error())
	}

	provider, model, err := parseModelOverride(job.ModelOverride)
	if err != nil {
		return s.markCloudRunFailed(ctx, run.ID, err.Error())
	}

	encryptedAPIKey, baseURL, resolvedOrgID, ok, err := s.resolveProviderCredentials(ctx, job.OrganizationID, provider)
	if err != nil {
		return err
	}
	if !ok {
		return s.markCloudRunFailed(ctx, run.ID, fmt.Sprintf("no provider credentials configured for %q (checked this organization's provider_settings and the platform default)", provider))
	}
	apiKey, err := decryptSecret(s.db.Gorm().WithContext(ctx), resolvedOrgID, encryptedAPIKey)
	if err != nil {
		return s.markCloudRunFailed(ctx, run.ID, "failed to decrypt provider credentials: "+err.Error())
	}

	providerConfig := &sdkproviders.Config{Provider: sdktypes.APIProvider(provider), APIKey: apiKey}
	if baseURL != "" {
		providerConfig.BaseURL = baseURL
	}

	// Best-effort: a job with no embedder configured (org or platform) just
	// runs without rag_search/rag_ingest available, same as a job never
	// referencing them today — not a reason to fail the run outright.
	var ragService *sdkrag.Service
	if s.rag != nil {
		if resolved, ok, ragErr := s.rag.RAGServiceForOrganization(ctx, job.OrganizationID); ragErr == nil && ok {
			ragService = resolved
		}
	}

	// Whose per-employee MCP tokens (Slack/Outlook/Teams/Gmail, ...) a
	// scheduled job bridges is a real design question, not an assumption -
	// unlike workspacechat's interactive session (a live request always has
	// a principal to bridge for), a background ScheduledJob has no "person
	// currently waiting" at all. Resolved to the job's own creator
	// (CreatedByUserID) - the only identity already on the row, and the
	// only sane default given nothing in this codebase has an org-level
	// "service account" concept for these MCP-action kinds at all today
	// (see connectors' own package doc). Best-effort like ragService above:
	// the creator not having connected an account for a given kind, or no
	// longer being a member of this organization, just means this run
	// executes without those MCP tools this time, not a reason to fail it -
	// same "don't let an optional capability's absence break a job"
	// posture used for every other resolved dependency here.
	var mcpServers []sdk.MCPServerConfig
	if s.mcp != nil {
		if resolved, mcpErr := s.mcp.ResolveServerConfigsForUser(ctx, job.OrganizationID, job.CreatedByUserID); mcpErr == nil {
			mcpServers = resolved
		}
	}

	// A job's Graph, when set, needs no LLM tools of its own beyond the
	// "agent"/"subworkflow" node types (see jobWorkflow.runGraph) — RAG/MCP/
	// docling/artifacts are still passed through unconditionally below
	// since a graph's own "agent" nodes reuse this same session and so can
	// still call rag_search/read_document_url/MCP tools mid-turn, same as
	// the plain-Prompt path.
	var graph *dataflow.Definition
	if strings.TrimSpace(job.GraphJSON) != "" {
		var def dataflow.Definition
		if err := json.Unmarshal([]byte(job.GraphJSON), &def); err != nil {
			return s.markCloudRunFailed(ctx, run.ID, "invalid graph definition: "+err.Error())
		}
		graph = &def
	}

	executor, err := sdkautomation.NewExecutor(sdkautomation.ExecutorConfig{
		RunnerConfig: sdkautomation.RunnerConfig{
			Model:          sdkautomation.ModelIdentifier{Provider: sdktypes.APIProvider(provider), Model: model},
			ProviderConfig: providerConfig,
			MaxTokens:      cloudMaxTokens,
			RAGService:     ragService,
			DoclingURL:     s.doclingURL,
			ArtifactStore:  s.artifacts,
			MCPServers:     mcpServers,
			// See jobWorkflow's doc comment above — bash is reachable from
			// this executor, so it must never run unconfined on this shared
			// host.
			RequireSandbox: true,
		},
	})
	if err != nil {
		return s.markCloudRunFailed(ctx, run.ID, "failed to build execution runner: "+err.Error())
	}
	defer executor.Close()

	workflow := &jobWorkflow{
		id: job.ID, description: job.Description, prompt: job.Prompt,
		graph: graph, registry: s.nodeRegistry, organization: job.OrganizationID,
		ownerID: job.CreatedByUserID, secrets: s.secrets,
		triggerPayload: run.TriggerPayload,
	}
	result, execErr := executor.Run(ctx, workflow, sdkautomation.Options{})

	if execErr != nil {
		return s.finishCloudRun(ctx, run.ID, RunStatusFailed, result.Output, execErr.Error(), workflow.nodeTrace)
	}
	return s.finishCloudRun(ctx, run.ID, RunStatusCompleted, result.Output, "", workflow.nodeTrace)
}

func (s *Service) finishCloudRun(ctx context.Context, runID, status, outputText, errorText string, nodeTrace []sdb.NodeTraceEntry) error {
	return s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		var record sdb.JobRun
		if err := tx.First(&record, "id = ?", runID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return nil
			}
			return err
		}
		if record.Status != RunStatusRunning {
			return nil // already resolved (e.g. cancelled) while execution was in flight
		}
		now := time.Now().UTC()
		record.Status = status
		record.FinishedAt = &now
		record.OutputText = outputText
		record.ErrorText = errorText
		record.ExitReason = ""
		if errorText != "" {
			record.ExitReason = errorText
		}
		record.NodeTrace = nodeTrace
		result := tx.Model(&sdb.JobRun{}).
			Where("id = ? AND status = ?", record.ID, RunStatusRunning).
			Updates(map[string]any{"status": record.Status, "finished_at": record.FinishedAt, "output_text": record.OutputText, "error_text": record.ErrorText, "exit_reason": record.ExitReason, "node_trace": record.NodeTrace})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected == 0 {
			return nil
		}
		return reflectRunOutcomeOnJob(tx, record)
	})
}

func (s *Service) markCloudRunFailed(ctx context.Context, runID, reason string) error {
	return s.finishCloudRun(ctx, runID, RunStatusFailed, "", reason, nil)
}

// resolveProviderCredentials implements the hybrid BYOK/managed model: an
// organization's own ProviderSetting always wins when it has one; otherwise
// this falls back to the ProviderSetting of whichever organization is
// currently flagged IsDefault (see iam.Service.DefaultOrganizationID) - the
// credentials a paying-subscription org would run on without ever
// configuring its own key. Returns ok=false if neither exists.
// resolveProviderCredentials returns the encrypted API key alongside
// resolvedOrgID, the organization whose DEK actually encrypted it - the
// org-tier and platform-fallback branches don't always agree with the
// requested organizationID, and the caller needs the right one to decrypt
// (see DecryptSecret's doc comment).
func (s *Service) resolveProviderCredentials(ctx context.Context, organizationID, provider string) (encryptedAPIKey, baseURL, resolvedOrgID string, ok bool, err error) {
	orgSetting, found, err := s.findProviderSetting(ctx, organizationID, provider)
	if err != nil {
		return "", "", "", false, err
	}
	if found {
		return orgSetting.EncryptedAPIKey, orgSetting.BaseURL, organizationID, true, nil
	}

	tx := s.db.Gorm().WithContext(ctx)
	defaultOrgID, found, err := s.iam.DefaultOrganizationIDForDomain(tx, iam.SharedDomainProviderSettings)
	if err != nil {
		return "", "", "", false, err
	}
	if !found || defaultOrgID == organizationID {
		return "", "", "", false, nil
	}
	defaultSetting, found, err := s.findProviderSetting(ctx, defaultOrgID, provider)
	if err != nil {
		return "", "", "", false, err
	}
	if found {
		return defaultSetting.EncryptedAPIKey, defaultSetting.BaseURL, defaultOrgID, true, nil
	}
	return "", "", "", false, nil
}

// parseModelOverride splits a job's model_override ("provider:model") into
// its parts, reusing seshat's own model-identifier parser rather than
// hand-rolling string splitting.
func parseModelOverride(raw string) (provider, model string, err error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", "", ErrInvalidInput(`model_override is required for cloud-targeted jobs, format "provider:model" (e.g. "anthropic:claude-sonnet-5")`)
	}
	if !sdkconfig.HasExplicitProviderPrefix(raw) {
		return "", "", ErrInvalidInput(`model_override must include an explicit provider prefix, e.g. "anthropic:claude-sonnet-5"`)
	}
	id := sdkconfig.ParseModelIdentifier(raw)
	return string(id.Provider), id.Model, nil
}
