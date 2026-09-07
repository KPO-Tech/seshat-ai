package api

import (
	"net/http"
	"strings"

	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/dataflowvariables"
)

func writeVariableError(w http.ResponseWriter, err error) { writeControlPlaneError(w, err) }

type createVariableRequest struct {
	OrganizationID string `json:"organization_id"`
	Name           string `json:"name"`
	Value          string `json:"value"`
}

type updateVariableRequest struct {
	Name  string `json:"name"`
	Value string `json:"value"`
}

// handleVariables — GET/POST /api/v1/variables.
func (app *App) handleVariables(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}
	switch r.Method {
	case http.MethodGet:
		organizationID := strings.TrimSpace(r.URL.Query().Get("organization_id"))
		variables, err := app.backend.Variables.List(r.Context(), principal, organizationID)
		if err != nil {
			writeVariableError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"variables": variables, "count": len(variables)})
	case http.MethodPost:
		var req createVariableRequest
		if !decodeJSONBody(w, r, &req) {
			return
		}
		variable, err := app.backend.Variables.Set(r.Context(), principal, dataflowvariables.SetParams{
			OrganizationID: req.OrganizationID, Name: req.Name, Value: req.Value,
		})
		if err != nil {
			writeVariableError(w, err)
			return
		}
		writeJSON(w, http.StatusCreated, variable)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

// handleVariableByID — PUT/DELETE /api/v1/variables/{variableID}.
func (app *App) handleVariableByID(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}
	id := strings.TrimSpace(r.PathValue("variableID"))
	if id == "" {
		writeJSONError(w, http.StatusBadRequest, "missing variable id")
		return
	}
	switch r.Method {
	case http.MethodPut:
		var req updateVariableRequest
		if !decodeJSONBody(w, r, &req) {
			return
		}
		variable, err := app.backend.Variables.Update(r.Context(), principal, id, dataflowvariables.UpdateParams{
			Name: req.Name, Value: req.Value,
		})
		if err != nil {
			writeVariableError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, variable)
	case http.MethodDelete:
		if err := app.backend.Variables.Delete(r.Context(), principal, id); err != nil {
			writeVariableError(w, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}
