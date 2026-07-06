package api

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"path"
	"strings"
	"time"
)

// ─── Automation client ────────────────────────────────────────────────────────

// AutomationClient is a thin HTTP client to the seshat-automation daemon.
// It injects the API key and the calling user's ID on every request.
type AutomationClient struct {
	baseURL    string
	apiKey     string
	httpClient *http.Client
}

// NewAutomationClient returns nil when baseURL is empty (feature disabled).
func NewAutomationClient(baseURL, apiKey string) *AutomationClient {
	if strings.TrimSpace(baseURL) == "" {
		return nil
	}
	return &AutomationClient{
		baseURL: strings.TrimRight(baseURL, "/"),
		apiKey:  apiKey,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

func (c *AutomationClient) do(r *http.Request, userID string) (*http.Response, error) {
	if c.apiKey != "" {
		r.Header.Set("Authorization", "Bearer "+c.apiKey)
	}
	if userID != "" {
		r.Header.Set("X-Seshat-User-ID", userID)
	}
	r.Header.Set("Content-Type", "application/json")
	return c.httpClient.Do(r)
}

func (c *AutomationClient) proxy(w http.ResponseWriter, r *http.Request, userID, targetPath string) {
	targetURL := c.baseURL + targetPath
	if r.URL.RawQuery != "" {
		targetURL += "?" + r.URL.RawQuery
	}

	var bodyReader io.Reader
	if r.Body != nil {
		bodyBytes, err := io.ReadAll(r.Body)
		if err != nil {
			writeJSONError(w, http.StatusBadRequest, "failed to read request body")
			return
		}
		bodyReader = bytes.NewReader(bodyBytes)
	}

	req, err := http.NewRequestWithContext(r.Context(), r.Method, targetURL, bodyReader)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "failed to build upstream request")
		return
	}

	resp, err := c.do(req, userID)
	if err != nil {
		writeJSONError(w, http.StatusServiceUnavailable, fmt.Sprintf("automation service unavailable: %v", err))
		return
	}
	defer resp.Body.Close()

	// Forward status + body verbatim
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(resp.StatusCode)
	_, _ = io.Copy(w, resp.Body)
}

// CreateAPIKey calls the daemon's admin endpoint to generate a sats_ key for
// a user. Returns the raw daemon response as a parsed map (raw_key is included
// once and must be passed back to the caller immediately).
func (c *AutomationClient) CreateAPIKey(ctx context.Context, userID, label string) (map[string]any, error) {
	body, _ := json.Marshal(map[string]string{"owner_id": userID, "label": label})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		c.baseURL+"/v1/admin/keys", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	resp, err := c.do(req, "")
	if err != nil {
		return nil, fmt.Errorf("daemon CreateAPIKey: %w", err)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusCreated {
		return nil, fmt.Errorf("daemon returned %d: %s", resp.StatusCode, string(raw))
	}
	var result map[string]any
	if err := json.Unmarshal(raw, &result); err != nil {
		return nil, fmt.Errorf("parse daemon response: %w", err)
	}
	return result, nil
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

func (a *App) automationAvailable(w http.ResponseWriter) bool {
	if a.automationClient == nil {
		writeJSONError(w, http.StatusServiceUnavailable, "automation service not configured (AUTOMATION_SERVICE_URL not set)")
		return false
	}
	return true
}

// handleAutomationJobs — GET /api/v1/automation/jobs, POST /api/v1/automation/jobs
func (a *App) handleAutomationJobs(w http.ResponseWriter, r *http.Request) {
	if !a.automationAvailable(w) {
		return
	}
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	a.automationClient.proxy(w, r, principal.User.ID, "/jobs")
}

// handleAutomationJobByID — /api/v1/automation/jobs/{id} and sub-paths
func (a *App) handleAutomationJobByID(w http.ResponseWriter, r *http.Request) {
	if !a.automationAvailable(w) {
		return
	}
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	// Extract everything after /automation/jobs/
	trimmed := strings.TrimPrefix(r.URL.Path, "/automation/jobs/")
	trimmed = strings.Trim(trimmed, "/")

	// Reconstruct the daemon path: /jobs/{id}[/sub-action]
	parts := strings.SplitN(trimmed, "/", 2)
	id := path.Base(parts[0])
	if id == "" || id == "." {
		writeJSONError(w, http.StatusBadRequest, "job ID required")
		return
	}

	daemonPath := "/jobs/" + id
	if len(parts) == 2 && parts[1] != "" {
		daemonPath += "/" + parts[1]
	}

	a.automationClient.proxy(w, r, principal.User.ID, daemonPath)
}

// handleAutomationRun — GET /api/v1/automation/runs/{id}
func (a *App) handleAutomationRun(w http.ResponseWriter, r *http.Request) {
	if !a.automationAvailable(w) {
		return
	}
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	trimmed := strings.TrimPrefix(r.URL.Path, "/automation/runs/")
	id := strings.Trim(trimmed, "/")
	if id == "" {
		writeJSONError(w, http.StatusBadRequest, "run ID required")
		return
	}
	a.automationClient.proxy(w, r, principal.User.ID, "/runs/"+id)
}
