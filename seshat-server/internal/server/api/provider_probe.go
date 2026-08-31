package api

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"

	sdkproviders "github.com/KPO-Tech/seshat/pkg/providers"
)

// providerProbeStatus mirrors mcpregistry.MCPProbeAuthMode's three-way
// classification (item 8 of docs/helps/audit-2026-08-29-openwork-den-comparison.md)
// applied to LLM providers instead of MCP servers - never claims "works" on
// anything but a real 2xx, never claims "bad credential" on anything but a
// real 401/403. Anything else (network error, an unexpected status, a
// probe-endpoint guess that turns out wrong for a given provider) reports
// "unknown" rather than confidently lying in either direction.
type providerProbeStatus string

const (
	providerProbeOK                providerProbeStatus = "ok"
	providerProbeInvalidCredential providerProbeStatus = "invalid_credential"
	providerProbeUnknown           providerProbeStatus = "unknown"
	providerProbeUnsupported       providerProbeStatus = "unsupported"
)

type providerProbeResult struct {
	Status providerProbeStatus `json:"status"`
	Detail string              `json:"detail"`
}

// probeProviderCredential does a minimal live check that apiKey actually
// authenticates against provider's real API - see item 1's "test connection
// before saving" sub-item, closed here.
//
// Deliberately not built on the seshat SDK's pkg/providers.Client.CreateMessage:
// its request type (types.APIRequest) isn't part of the SDK's public
// surface (pkg/types has no APIRequest alias), so it's unconstructable from
// outside the SDK's own module - using it would need an SDK change and
// release cycle for what the audit calls a "simple probe." Instead this
// makes the cheapest real GET request each provider's API actually offers
// (a models-list endpoint, never a chat/completion call - no tokens spent,
// no message content sent anywhere), with the exact same auth header the
// SDK's own internal adapter.go uses for real traffic (verified by reading
// it directly - anthropicAdapter/zAiAdapter/geminiAdapter/openAICompatAdapter
// in the vendored SDK). That per-provider knowledge is necessarily
// duplicated here in a small, explicit form since it isn't exported.
//
// Providers needing more than a static API key (ollama - local, no
// meaningful "credential" to test; codex - OAuth bearer; foundry/bedrock/
// vertex/workers-ai - cloud-account credentials, not a single key) report
// "unsupported" rather than attempting a probe that couldn't mean anything.
// Any other/future provider name falls back to the OpenAI-compatible
// convention (Bearer + GET /v1/models) - the dominant convention for
// "paste an API key" LLM providers - which fails safely into "unknown" for
// a provider that turns out to need something different, never a false
// "ok" or false "invalid_credential".
func probeProviderCredential(ctx context.Context, providerName, baseURL, apiKey string) providerProbeResult {
	name := strings.ToLower(strings.TrimSpace(providerName))
	apiKey = strings.TrimSpace(apiKey)
	if apiKey == "" {
		return providerProbeResult{Status: providerProbeUnknown, Detail: "no API key provided"}
	}

	resolvedBase := strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if resolvedBase == "" {
		if cfg := sdkproviders.GetProviderConfig(sdkproviders.ResolveProviderFromString(name)); cfg != nil {
			resolvedBase = strings.TrimRight(cfg.BaseURL, "/")
		}
	}
	if resolvedBase == "" {
		return providerProbeResult{Status: providerProbeUnsupported, Detail: "no base URL known for this provider"}
	}

	var probeURL string
	var applyAuth func(*http.Request)

	switch name {
	case "anthropic":
		probeURL = resolvedBase + "/v1/models"
		applyAuth = func(r *http.Request) {
			r.Header.Set("x-api-key", apiKey)
			r.Header.Set("anthropic-version", "2023-06-01")
		}
	case "z-ai", "z.ai", "zai":
		probeURL = resolvedBase + "/models"
		applyAuth = func(r *http.Request) { r.Header.Set("x-api-key", apiKey) }
	case "gemini":
		probeURL = resolvedBase + "/models"
		applyAuth = func(r *http.Request) { r.Header.Set("Authorization", "Bearer "+apiKey) }
	case "ollama", "codex", "foundry", "bedrock", "vertex", "workers-ai":
		return providerProbeResult{Status: providerProbeUnsupported, Detail: "this provider isn't supported by the connection test"}
	default:
		probeURL = resolvedBase + "/v1/models"
		applyAuth = func(r *http.Request) { r.Header.Set("Authorization", "Bearer "+apiKey) }
	}

	probeCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	httpReq, err := http.NewRequestWithContext(probeCtx, http.MethodGet, probeURL, nil)
	if err != nil {
		return providerProbeResult{Status: providerProbeUnknown, Detail: err.Error()}
	}
	applyAuth(httpReq)

	resp, err := http.DefaultClient.Do(httpReq)
	if err != nil {
		return providerProbeResult{Status: providerProbeUnknown, Detail: "could not reach the provider: " + err.Error()}
	}
	defer resp.Body.Close()

	switch {
	case resp.StatusCode == http.StatusOK:
		return providerProbeResult{Status: providerProbeOK, Detail: "credential accepted"}
	case resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden:
		return providerProbeResult{Status: providerProbeInvalidCredential, Detail: fmt.Sprintf("the provider rejected this credential (HTTP %d)", resp.StatusCode)}
	default:
		return providerProbeResult{Status: providerProbeUnknown, Detail: fmt.Sprintf("could not confirm - the provider returned HTTP %d", resp.StatusCode)}
	}
}

type providerProbeRequest struct {
	Provider string `json:"provider"`
	BaseURL  string `json:"base_url"`
	APIKey   string `json:"api_key"`
}

// handleProviderSettingsProbe — POST /api/v1/provider-settings/probe.
// Authenticated only, like handleProviderSettingsDetectModels - it never
// touches persisted data (the credential tested here may not be saved
// anywhere yet), so there's no organization-scoped permission to check.
func (app *App) handleProviderSettingsProbe(w http.ResponseWriter, r *http.Request) {
	if _, ok := authPrincipalFromContext(r.Context()); !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}
	var req providerProbeRequest
	if !decodeJSONBody(w, r, &req) {
		return
	}
	if strings.TrimSpace(req.Provider) == "" {
		writeJSONError(w, http.StatusBadRequest, "provider is required")
		return
	}
	writeJSON(w, http.StatusOK, probeProviderCredential(r.Context(), req.Provider, req.BaseURL, req.APIKey))
}
