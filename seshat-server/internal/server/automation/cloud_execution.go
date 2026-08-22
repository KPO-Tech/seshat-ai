package automation

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"gorm.io/gorm"

	sdkautomation "github.com/KPO-Tech/seshat/pkg/automation"
	sdkconfig "github.com/KPO-Tech/seshat/pkg/config"
	sdkproviders "github.com/KPO-Tech/seshat/pkg/providers"
	sdkrag "github.com/KPO-Tech/seshat/pkg/rag"
	"github.com/KPO-Tech/seshat/pkg/sdk"
	sdktypes "github.com/KPO-Tech/seshat/pkg/types"

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
}

func (w *jobWorkflow) Name() string        { return w.id }
func (w *jobWorkflow) Description() string { return w.description }
func (w *jobWorkflow) Run(ctx context.Context, session *sdk.Session) error {
	_, err := session.SubmitMessage(ctx, w.prompt)
	return err
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

	workflow := &jobWorkflow{id: job.ID, description: job.Description, prompt: job.Prompt}
	result, execErr := executor.Run(ctx, workflow, sdkautomation.Options{})

	if execErr != nil {
		return s.finishCloudRun(ctx, run.ID, RunStatusFailed, result.Output, execErr.Error())
	}
	return s.finishCloudRun(ctx, run.ID, RunStatusCompleted, result.Output, "")
}

func (s *Service) finishCloudRun(ctx context.Context, runID, status, outputText, errorText string) error {
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
		result := tx.Model(&sdb.JobRun{}).
			Where("id = ? AND status = ?", record.ID, RunStatusRunning).
			Updates(map[string]any{"status": record.Status, "finished_at": record.FinishedAt, "output_text": record.OutputText, "error_text": record.ErrorText, "exit_reason": record.ExitReason})
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
	return s.finishCloudRun(ctx, runID, RunStatusFailed, "", reason)
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
