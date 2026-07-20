package api

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"time"

	sdkproviders "github.com/KPO-Tech/seshat/pkg/providers"
)

type detectModelsRequest struct {
	Provider string `json:"provider"`
	BaseURL  string `json:"base_url"`
}

// handleProviderSettingsDetectModels probes a live Ollama instance for its
// installed LLM models — every other provider already has a static catalog
// in the console (cloud providers don't have a variable, per-install model
// set), so this only does anything for provider == "ollama". Mirrors
// seshat-backend's POST /settings/providers/{id}/models/sync, reusing the
// same SDK fetch/classification logic (embedding models are already
// filtered out by pkg/providers.FetchModels for Ollama).
// POST /api/v1/provider-settings/detect-models
func (app *App) handleProviderSettingsDetectModels(w http.ResponseWriter, r *http.Request) {
	if _, ok := authPrincipalFromContext(r.Context()); !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}
	var req detectModelsRequest
	if !decodeJSONBody(w, r, &req) {
		return
	}
	if strings.ToLower(strings.TrimSpace(req.Provider)) != "ollama" {
		writeJSON(w, http.StatusOK, map[string]any{"models": []string{}})
		return
	}
	baseURL := strings.TrimRight(strings.TrimSpace(req.BaseURL), "/")
	if baseURL == "" {
		baseURL = sdkproviders.DefaultBaseURL("ollama")
	}
	fetched, err := sdkproviders.FetchModels(r.Context(), "ollama", baseURL, "")
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]any{"models": []string{}, "error": err.Error()})
		return
	}
	models := make([]string, 0, len(fetched))
	for _, m := range fetched {
		models = append(models, m.ModelID)
	}
	writeJSON(w, http.StatusOK, map[string]any{"models": models})
}

// handleEmbedderSettingsDetectModels returns embedding-capable models: a
// static curated list for OpenAI-compatible providers (their catalogs don't
// vary per install), or a live Ollama probe otherwise — a self-hosted
// Ollama's installed models are unknowable ahead of time. Mirrors
// seshat-backend's POST /settings/embedder/detect-models exactly, including
// its embedding-vs-LLM name/family classification heuristic (kept
// independent from pkg/providers.FetchModels, which does the opposite
// filtering — it excludes embedding models to build an LLM catalog).
// POST /api/v1/embedder-settings/detect-models
func (app *App) handleEmbedderSettingsDetectModels(w http.ResponseWriter, r *http.Request) {
	if _, ok := authPrincipalFromContext(r.Context()); !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}
	var req detectModelsRequest
	if !decodeJSONBody(w, r, &req) {
		return
	}
	if strings.ToLower(strings.TrimSpace(req.Provider)) != "ollama" {
		writeJSON(w, http.StatusOK, map[string]any{
			"embedding_models": []string{
				"text-embedding-3-small",
				"text-embedding-3-large",
				"text-embedding-ada-002",
				"mistral-embed",
			},
		})
		return
	}

	baseURL := strings.TrimRight(strings.TrimSpace(req.BaseURL), "/")
	if baseURL == "" {
		baseURL = "http://localhost:11434"
	}

	client := &http.Client{Timeout: 8 * time.Second}
	httpReq, err := http.NewRequestWithContext(r.Context(), http.MethodGet, baseURL+"/api/tags", nil)
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid base_url")
		return
	}
	resp, err := client.Do(httpReq)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]any{"embedding_models": []string{}, "error": err.Error()})
		return
	}
	defer resp.Body.Close()

	data, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "failed to read ollama response")
		return
	}
	var result struct {
		Models []struct {
			Name    string `json:"name"`
			Details struct {
				Family   string   `json:"family"`
				Families []string `json:"families"`
			} `json:"details"`
		} `json:"models"`
	}
	if err := json.Unmarshal(data, &result); err != nil {
		writeJSONError(w, http.StatusInternalServerError, "failed to parse ollama response")
		return
	}

	embeddingModels := make([]string, 0, len(result.Models))
	for _, m := range result.Models {
		if isOllamaEmbeddingModel(m.Name, m.Details.Family, m.Details.Families) {
			embeddingModels = append(embeddingModels, m.Name)
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"embedding_models": embeddingModels})
}

var embeddingModelNamePatterns = []string{
	"embed", "minilm", "mxbai", "snowflake", "arctic", "bge-", "e5-", "gte-", "nomic-bert",
}

func isOllamaEmbeddingModel(name, family string, families []string) bool {
	lower := strings.ToLower(name)
	for _, pattern := range embeddingModelNamePatterns {
		if strings.Contains(lower, pattern) {
			return true
		}
	}
	if ollamaFamilyLooksLikeEmbedding(family) {
		return true
	}
	for _, f := range families {
		if ollamaFamilyLooksLikeEmbedding(f) {
			return true
		}
	}
	return false
}

func ollamaFamilyLooksLikeEmbedding(family string) bool {
	f := strings.ToLower(family)
	return strings.Contains(f, "bert") || strings.Contains(f, "embed")
}
