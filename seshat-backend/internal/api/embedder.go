package api

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/db"
	ragembedder "github.com/EngineerProjects/seshat/pkg/rag/embedder"
)

type embedderConfigResponse struct {
	Provider     string `json:"provider"`
	BaseURL      string `json:"base_url,omitempty"`
	Model        string `json:"model,omitempty"`
	HasAPIKey    bool   `json:"has_api_key"`
	Enabled      bool   `json:"enabled"`
	IsConfigured bool   `json:"is_configured"`
	UpdatedAt    int64  `json:"updated_at,omitempty"`
}

func embedderConfigToResponse(cfg *db.EmbedderConfig) embedderConfigResponse {
	if cfg == nil {
		return embedderConfigResponse{Provider: "openai", Enabled: true}
	}
	isConfigured := cfg.BaseURL != "" && cfg.Model != ""
	var updatedAt int64
	if !cfg.UpdatedAt.IsZero() && cfg.UpdatedAt.Unix() > 0 {
		updatedAt = cfg.UpdatedAt.Unix()
	}
	return embedderConfigResponse{
		Provider:     cfg.Provider,
		BaseURL:      cfg.BaseURL,
		Model:        cfg.Model,
		HasAPIKey:    cfg.HasAPIKey,
		Enabled:      cfg.Enabled,
		IsConfigured: isConfigured,
		UpdatedAt:    updatedAt,
	}
}

// GET  /api/v1/settings/embedder
// PUT  /api/v1/settings/embedder
// POST /api/v1/settings/embedder/test
func (a *App) handleEmbedderConfig(w http.ResponseWriter, r *http.Request) {
	principal, _ := authPrincipalFromContext(r.Context())
	if principal == nil {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	store := a.embedderStore
	if store == nil {
		writeJSONError(w, http.StatusServiceUnavailable, "embedder config store not available")
		return
	}

	tail := strings.TrimRight(r.URL.Path, "/")

	// POST .../test
	if strings.HasSuffix(tail, "/test") {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		a.handleEmbedderTest(w, r, store)
		return
	}

	// POST .../detect-models
	if strings.HasSuffix(tail, "/detect-models") {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		a.handleEmbedderDetectModels(w, r, store)
		return
	}

	switch r.Method {
	case http.MethodGet:
		cfg, err := store.Get(r.Context())
		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, "failed to get embedder config")
			return
		}
		writeJSON(w, http.StatusOK, embedderConfigToResponse(cfg))

	case http.MethodPut:
		var body struct {
			Provider string  `json:"provider"`
			BaseURL  string  `json:"base_url"`
			APIKey   *string `json:"api_key"`
			Model    string  `json:"model"`
			Enabled  bool    `json:"enabled"`
		}
		if !decodeJSONBody(w, r, &body) {
			return
		}
		cfg, err := store.Upsert(r.Context(), db.UpsertEmbedderConfigParams{
			Provider: body.Provider,
			BaseURL:  body.BaseURL,
			APIKey:   body.APIKey,
			Model:    body.Model,
			Enabled:  body.Enabled,
		})
		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, "failed to save embedder config: "+err.Error())
			return
		}
		writeJSON(w, http.StatusOK, embedderConfigToResponse(cfg))

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func (a *App) handleEmbedderTest(w http.ResponseWriter, r *http.Request, store *db.EmbedderConfigStore) {
	// Accept an optional body to test a not-yet-saved config
	var body struct {
		Provider string `json:"provider"`
		BaseURL  string `json:"base_url"`
		APIKey   string `json:"api_key"`
		Model    string `json:"model"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)

	provider := strings.TrimSpace(body.Provider)
	baseURL := strings.TrimSpace(body.BaseURL)
	model := strings.TrimSpace(body.Model)
	apiKey := strings.TrimSpace(body.APIKey)

	// Fill from DB if fields not provided in request
	if baseURL == "" || model == "" {
		if cfg, err := store.Get(r.Context()); err == nil && cfg != nil {
			if baseURL == "" {
				baseURL = cfg.BaseURL
			}
			if model == "" {
				model = cfg.Model
			}
			if provider == "" {
				provider = cfg.Provider
			}
		}
	}
	if apiKey == "" && baseURL != "" {
		if key, err := store.GetDecryptedAPIKey(r.Context()); err == nil {
			apiKey = key
		}
	}

	if baseURL == "" || model == "" {
		writeJSON(w, http.StatusOK, map[string]any{
			"ok":         false,
			"latency_ms": 0,
			"error":      "base_url and model are required",
		})
		return
	}

	cfg := &ragembedder.Config{
		Provider: ragembedder.Provider(strings.ToLower(provider)),
		BaseURL:  strings.TrimRight(baseURL, "/"),
		APIKey:   apiKey,
		Model:    model,
		Timeout:  10 * time.Second,
	}
	if cfg.Provider == "" {
		cfg.Provider = ragembedder.Provider(ragembedder.DetectProviderPublic(baseURL))
	}

	emb := ragembedder.New(cfg)
	start := time.Now()
	_, err := emb.EmbedTexts(r.Context(), []string{"test"})
	latency := time.Since(start).Milliseconds()

	if err != nil {
		writeJSON(w, http.StatusOK, map[string]any{
			"ok":         false,
			"latency_ms": latency,
			"error":      err.Error(),
		})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":         true,
		"latency_ms": latency,
		"error":      nil,
	})
}

// handleEmbedderDetectModels probes the Ollama instance (or static list for OpenAI)
// and returns models classified as embedding vs LLM.
// POST /api/v1/settings/embedder/detect-models
func (a *App) handleEmbedderDetectModels(w http.ResponseWriter, r *http.Request, store *db.EmbedderConfigStore) {
	var body struct {
		Provider string `json:"provider"`
		BaseURL  string `json:"base_url"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)

	provider := strings.TrimSpace(body.Provider)
	baseURL := strings.TrimRight(strings.TrimSpace(body.BaseURL), "/")

	if baseURL == "" {
		if cfg, err := store.Get(r.Context()); err == nil && cfg != nil {
			baseURL = strings.TrimRight(cfg.BaseURL, "/")
			if provider == "" {
				provider = cfg.Provider
			}
		}
	}

	if provider == "" {
		provider = string(ragembedder.DetectProviderPublic(baseURL))
	}

	if strings.ToLower(provider) != "ollama" {
		// OpenAI-compatible: return static well-known embedding models
		writeJSON(w, http.StatusOK, map[string]any{
			"embedding_models": []string{
				"text-embedding-3-small",
				"text-embedding-3-large",
				"text-embedding-ada-002",
			},
			"llm_models": []string{},
		})
		return
	}

	if baseURL == "" {
		baseURL = "http://localhost:11434"
	}

	client := &http.Client{Timeout: 8 * time.Second}
	req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, baseURL+"/api/tags", nil)
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid base_url")
		return
	}
	resp, err := client.Do(req)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]any{
			"error":            err.Error(),
			"embedding_models": []string{},
			"llm_models":       []string{},
		})
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
				Families []string `json:"families"`
				Family   string   `json:"family"`
			} `json:"details"`
		} `json:"models"`
	}
	if err := json.Unmarshal(data, &result); err != nil {
		writeJSONError(w, http.StatusInternalServerError, "failed to parse ollama response")
		return
	}

	var embeddingModels []string
	var llmModels []string

	for _, m := range result.Models {
		if isEmbeddingModel(m.Name, m.Details.Families, m.Details.Family) {
			embeddingModels = append(embeddingModels, m.Name)
		} else {
			llmModels = append(llmModels, m.Name)
		}
	}

	if embeddingModels == nil {
		embeddingModels = []string{}
	}
	if llmModels == nil {
		llmModels = []string{}
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"embedding_models": embeddingModels,
		"llm_models":       llmModels,
	})
}

var embeddingNamePatterns = []string{
	"embed", "minilm", "mxbai", "snowflake", "arctic",
	"bge-", "e5-", "gte-", "nomic-bert",
}

func isEmbeddingModel(name string, families []string, family string) bool {
	lower := strings.ToLower(name)
	for _, p := range embeddingNamePatterns {
		if strings.Contains(lower, p) {
			return true
		}
	}
	for _, f := range families {
		fl := strings.ToLower(f)
		if strings.Contains(fl, "bert") || strings.Contains(fl, "embed") {
			return true
		}
	}
	if fl := strings.ToLower(family); strings.Contains(fl, "bert") || strings.Contains(fl, "embed") {
		return true
	}
	return false
}
