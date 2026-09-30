package api

import (
	"net/http"
	"strings"

	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/dataflowsecrets"
)

func writeDataflowSecretError(w http.ResponseWriter, err error) { writeControlPlaneError(w, err) }

type createDataflowSecretRequest struct {
	OrganizationID string `json:"organization_id"`
	Name           string `json:"name"`
	Value          string `json:"value"`
}

// handleDataflowSecrets — GET/POST /api/v1/dataflow-secrets. No PUT: a
// secret's value is delete+recreate only, same v1 posture as inbox
// workflows — see dataflowsecrets.Service's doc comment.
func (app *App) handleDataflowSecrets(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}
	switch r.Method {
	case http.MethodGet:
		organizationID := strings.TrimSpace(r.URL.Query().Get("organization_id"))
		secrets, err := app.backend.DataflowSecrets.List(r.Context(), principal, organizationID)
		if err != nil {
			writeDataflowSecretError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"dataflow_secrets": secrets, "count": len(secrets)})
	case http.MethodPost:
		var req createDataflowSecretRequest
		if !decodeJSONBody(w, r, &req) {
			return
		}
		secret, err := app.backend.DataflowSecrets.Set(r.Context(), principal, dataflowsecrets.SetParams{
			OrganizationID: req.OrganizationID, Name: req.Name, Value: req.Value,
		})
		if err != nil {
			writeDataflowSecretError(w, err)
			return
		}
		writeJSON(w, http.StatusCreated, secret)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

// handleDataflowSecretByID — DELETE /api/v1/dataflow-secrets/{dataflowSecretID}.
func (app *App) handleDataflowSecretByID(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}
	id := strings.TrimSpace(r.PathValue("dataflowSecretID"))
	if id == "" {
		writeJSONError(w, http.StatusBadRequest, "missing dataflow secret id")
		return
	}
	if r.Method != http.MethodDelete {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	if err := app.backend.DataflowSecrets.Delete(r.Context(), principal, id); err != nil {
		writeDataflowSecretError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
