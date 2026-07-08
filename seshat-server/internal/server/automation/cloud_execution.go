package automation

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"gorm.io/gorm"

	sdkautomation "github.com/EngineerProjects/seshat/pkg/automation"
	sdkconfig "github.com/EngineerProjects/seshat/pkg/config"
	sdkproviders "github.com/EngineerProjects/seshat/pkg/providers"
	"github.com/EngineerProjects/seshat/pkg/sdk"
	sdktypes "github.com/EngineerProjects/seshat/pkg/types"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
)

// cloudMaxTokens caps a single cloud job's response. Not yet exposed as a
// per-job setting — a reasonable fixed default until there's a concrete
// need to tune it per job.
const cloudMaxTokens = 4096

// jobWorkflow adapts a queued cloud run to the automation.Workflow interface
// the absorbed Runner/Executor expects. It only ever calls SubmitMessage —
// no tools are registered anywhere in this path, so a cloud job can
// generate text and nothing else: no bash, no filesystem, no local-machine
// access. That's not a restriction bolted on here; it falls straight out of
// automation.Runner.Execute never registering any tools on the client it
// builds (verified against seshat/internal/automation/runner.go).
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

	setting, ok, err := s.findProviderSetting(ctx, job.OrganizationID, provider)
	if err != nil {
		return err
	}
	if !ok {
		return s.markCloudRunFailed(ctx, run.ID, fmt.Sprintf("no provider_settings configured for %q in this organization", provider))
	}
	apiKey, err := decryptSecret(setting.EncryptedAPIKey)
	if err != nil {
		return s.markCloudRunFailed(ctx, run.ID, "failed to decrypt provider credentials: "+err.Error())
	}

	providerConfig := &sdkproviders.Config{Provider: sdktypes.APIProvider(provider), APIKey: apiKey}
	if setting.BaseURL != "" {
		providerConfig.BaseURL = setting.BaseURL
	}

	executor, err := sdkautomation.NewExecutor(sdkautomation.ExecutorConfig{
		RunnerConfig: sdkautomation.RunnerConfig{
			Model:          sdkautomation.ModelIdentifier{Provider: sdktypes.APIProvider(provider), Model: model},
			ProviderConfig: providerConfig,
			MaxTokens:      cloudMaxTokens,
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
