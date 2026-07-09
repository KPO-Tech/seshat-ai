package api

import (
	"net/http"
	"strings"
)

// ─── Response types ───────────────────────────────────────────────────────────

type automationRuntimeProviderConfig struct {
	Name    string `json:"name"`
	APIKey  string `json:"api_key"`
	BaseURL string `json:"base_url"`
	ModelID string `json:"model_id"`
}

type automationRuntimeWebSearch struct {
	Enabled   bool              `json:"enabled"`
	Providers map[string]string `json:"providers"` // provider_name → api_key
}

type automationRuntimeEmbedder struct {
	Enabled  bool   `json:"enabled"`
	Provider string `json:"provider,omitempty"`
	BaseURL  string `json:"base_url,omitempty"`
	Model    string `json:"model,omitempty"`
}

// automationRuntimeAgentConfig carries the resolved definition of a named agent.
// Present only when the request includes ?agent_slug=<slug>.
type automationRuntimeAgentConfig struct {
	Slug         string   `json:"slug"`
	Model        string   `json:"model,omitempty"`
	SystemPrompt string   `json:"system_prompt,omitempty"`
	Tools        []string `json:"tools,omitempty"`
	MaxTurns     int      `json:"max_turns,omitempty"`
}

type automationRuntimeConfig struct {
	Provider  automationRuntimeProviderConfig `json:"provider"`
	WebSearch automationRuntimeWebSearch      `json:"web_search"`
	Embedder  automationRuntimeEmbedder       `json:"embedder"`
	// Agent is non-nil only when ?agent_slug= is provided and the slug resolves.
	Agent *automationRuntimeAgentConfig `json:"agent,omitempty"`
}

// ─── Middleware ───────────────────────────────────────────────────────────────

// automationAPIKeyMiddleware validates the daemon-to-server API key.
// Requests are rejected when no automation client is configured: the endpoint
// returns LLM credentials and must never be publicly reachable.
func (a *App) automationAPIKeyMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if a.automationClient == nil || a.automationClient.apiKey == "" {
			writeJSONError(w, http.StatusServiceUnavailable, "automation service not configured")
			return
		}
		token := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
		if token != a.automationClient.apiKey {
			writeJSONError(w, http.StatusUnauthorized, "invalid automation API key")
			return
		}
		next.ServeHTTP(w, r)
	})
}

// ─── Handler ──────────────────────────────────────────────────────────────────

// handleAutomationRuntimeConfig handles GET /api/v1/automation/runtime-config.
// Called by the seshat-automation daemon before executing each job to get the
// owner's LLM provider credentials, web search keys, and embedder config.
func (a *App) handleAutomationRuntimeConfig(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	userID := strings.TrimSpace(r.Header.Get("X-Seshat-User-ID"))
	if userID == "" {
		writeJSONError(w, http.StatusBadRequest, "X-Seshat-User-ID header required")
		return
	}

	ctx := r.Context()
	resp := automationRuntimeConfig{
		WebSearch: automationRuntimeWebSearch{
			Providers: make(map[string]string),
		},
	}

	// ── LLM provider ────────────────────────────────────────────────────────
	provCfg, err := a.backend.Settings.ResolveDefaultForUserID(ctx, userID)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "resolve provider: "+err.Error())
		return
	}
	if provCfg != nil {
		resp.Provider = automationRuntimeProviderConfig{
			Name:    provCfg.Provider,
			APIKey:  provCfg.Secret,
			BaseURL: provCfg.BaseURL,
			ModelID: provCfg.ModelID,
		}
	}

	// ── Web search keys ──────────────────────────────────────────────────────
	wsEnabled, wsKeys, err := a.backend.WebSearch.ResolveKeysForUserID(ctx, userID)
	if err == nil {
		resp.WebSearch.Enabled = wsEnabled
		for k, v := range wsKeys {
			resp.WebSearch.Providers[k] = v
		}
	}

	// ── Embedder (global, not per-user) ─────────────────────────────────────
	if a.embedderStore != nil {
		if emb, err := a.embedderStore.Get(ctx); err == nil && emb != nil && emb.Provider != "" {
			apiKey, _ := a.embedderStore.GetDecryptedAPIKey(ctx)
			resp.Embedder = automationRuntimeEmbedder{
				Enabled:  emb.Enabled,
				Provider: emb.Provider,
				BaseURL:  emb.BaseURL,
				Model:    emb.Model,
			}
			_ = apiKey // embedder key not forwarded for now — daemon uses its own RAG config
		}
	}

	// ── Named agent definition ────────────────────────────────────────────────
	if agentSlug := strings.TrimSpace(r.URL.Query().Get("agent_slug")); agentSlug != "" {
		if a.backend.Agents != nil {
			if def, ok := a.backend.Agents.GetDefinition(ctx, agentSlug); ok && def != nil {
				agentResp := &automationRuntimeAgentConfig{
					Slug:     agentSlug,
					Model:    def.Model,
					MaxTurns: def.MaxTurns,
					Tools:    def.Tools,
				}
				if def.GetSystemPrompt != nil {
					agentResp.SystemPrompt = def.GetSystemPrompt()
				}
				resp.Agent = agentResp
			}
		}
	}

	writeJSON(w, http.StatusOK, resp)
}
