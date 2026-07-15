package api

import (
	"context"
	"strings"

	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/automation"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/knowledge"
)

// This file wires LLM provider settings and embedder settings together so
// configuring credentials for one auto-configures the other when the same
// vendor is usable for both — the user shouldn't have to paste the same API
// key into two forms. Deliberately narrow: only mistral/openai are handled,
// since embeddings need a concrete model name and those are the only two
// providers a sensible default model can be picked for without a live
// probe (Ollama's installed models vary per install — see the
// detect-models endpoints for that case instead). Never overwrites an
// existing setting on the other side; this only fills in what's missing.

// embedderDefaultsForLLMProvider returns what an embedder setting derived
// from this LLM provider setting should look like. ok is false when this
// provider has no well-known embedder equivalent.
func embedderDefaultsForLLMProvider(llmProvider, llmBaseURL string) (provider, baseURL, model string, ok bool) {
	switch strings.ToLower(strings.TrimSpace(llmProvider)) {
	case "mistral":
		base := strings.TrimSpace(llmBaseURL)
		if base == "" {
			base = "https://api.mistral.ai/v1"
		}
		return "openai", base, "mistral-embed", true
	case "openai":
		base := strings.TrimSpace(llmBaseURL)
		if base == "" {
			base = "https://api.openai.com/v1"
		}
		return "openai", base, "text-embedding-3-small", true
	default:
		return "", "", "", false
	}
}

// llmProviderForEmbedderSetting maps an embedder setting back to the LLM
// provider it corresponds to (the reverse direction). ok is false when the
// embedder's base_url doesn't match a recognized LLM-capable vendor (e.g.
// a generic/self-hosted OpenAI-compatible endpoint has no known LLM
// provider identity to propagate to).
func llmProviderForEmbedderSetting(embedderProvider, embedderBaseURL string) (provider, baseURL, defaultModel string, ok bool) {
	if strings.ToLower(strings.TrimSpace(embedderProvider)) != "openai" {
		return "", "", "", false
	}
	base := strings.ToLower(embedderBaseURL)
	switch {
	case strings.Contains(base, "api.mistral.ai"):
		return "mistral", embedderBaseURL, "mistral-small-latest", true
	case strings.Contains(base, "api.openai.com"):
		return "openai", embedderBaseURL, "gpt-4o", true
	default:
		return "", "", "", false
	}
}

// autoConfigureEmbedderFromProvider best-effort creates this organization's
// embedder setting from a just-created/updated LLM provider setting, if it
// doesn't already have one of its own. Errors are swallowed — this is a
// convenience on top of an already-successful provider-setting write, not
// something that should fail the caller's request.
func (app *App) autoConfigureEmbedderFromProvider(ctx context.Context, principal *iam.Principal, organizationID, llmProvider, llmBaseURL, apiKey string) {
	if apiKey == "" {
		return
	}
	provider, baseURL, model, ok := embedderDefaultsForLLMProvider(llmProvider, llmBaseURL)
	if !ok {
		return
	}
	if _, err := app.backend.Knowledge.GetEmbedderSetting(ctx, principal, organizationID); err == nil {
		return // already configured - never overwrite an existing choice
	}
	_, _ = app.backend.Knowledge.SetEmbedderSetting(ctx, principal, organizationID, knowledge.SetEmbedderSettingParams{
		Provider: provider,
		Model:    model,
		BaseURL:  baseURL,
		APIKey:   apiKey,
	})
}

// autoConfigureProviderFromEmbedder is the reverse direction: best-effort
// creates an LLM provider setting from a just-configured embedder setting,
// if this organization doesn't already have one for the matching provider.
func (app *App) autoConfigureProviderFromEmbedder(ctx context.Context, principal *iam.Principal, organizationID, embedderProvider, embedderBaseURL, apiKey string) {
	if apiKey == "" {
		return
	}
	provider, baseURL, defaultModel, ok := llmProviderForEmbedderSetting(embedderProvider, embedderBaseURL)
	if !ok {
		return
	}
	existing, err := app.backend.Automation.ListProviderSettings(ctx, principal, organizationID)
	if err != nil {
		return
	}
	for _, setting := range existing {
		if setting.Provider == provider {
			return // already configured - never overwrite an existing choice
		}
	}
	_, _ = app.backend.Automation.CreateProviderSetting(ctx, principal, automation.CreateProviderSettingParams{
		OrganizationID: organizationID,
		Provider:       provider,
		DefaultModel:   defaultModel,
		BaseURL:        baseURL,
		APIKey:         apiKey,
	})
}
