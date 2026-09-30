// GET/POST/PUT/PATCH/DELETE /scim/v2/Groups - Étape 5 of the staged plan in
// docs/helps/audit-2026-08-29-openwork-den-comparison.md.
package api

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/scim"
)

// handleScimGroups — GET/POST /scim/v2/Groups.
func (app *App) handleScimGroups(w http.ResponseWriter, r *http.Request) {
	connection, ok := app.resolveScimConnectionFromRequest(w, r)
	if !ok {
		return
	}
	switch r.Method {
	case http.MethodGet:
		startIndex := 1
		if raw := strings.TrimSpace(r.URL.Query().Get("startIndex")); raw != "" {
			if parsed, err := strconv.Atoi(raw); err == nil {
				startIndex = parsed
			}
		}
		count := 100
		if raw := strings.TrimSpace(r.URL.Query().Get("count")); raw != "" {
			if parsed, err := strconv.Atoi(raw); err == nil {
				count = parsed
			}
		}
		resources, total, err := app.backend.Scim.ListScimGroups(r.Context(), connection, startIndex, count)
		if err != nil {
			writeScimErrorFromErr(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"schemas":      []string{scimListSchema},
			"totalResults": total,
			"startIndex":   startIndex,
			"itemsPerPage": len(resources),
			"Resources":    resources,
		})

	case http.MethodPost:
		var req scim.CreateGroupRequest
		if !decodeScimJSONBody(w, r, &req) {
			return
		}
		resource, err := app.backend.Scim.CreateScimGroup(r.Context(), connection, req)
		if err != nil {
			writeScimErrorFromErr(w, err)
			return
		}
		writeJSON(w, http.StatusCreated, resource)

	default:
		writeScimError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

// handleScimGroupByID — GET/PUT/PATCH/DELETE /scim/v2/Groups/{groupID}.
func (app *App) handleScimGroupByID(w http.ResponseWriter, r *http.Request) {
	connection, ok := app.resolveScimConnectionFromRequest(w, r)
	if !ok {
		return
	}
	groupID := strings.TrimSpace(r.PathValue("groupID"))
	if groupID == "" {
		writeScimError(w, http.StatusBadRequest, "missing group id")
		return
	}

	switch r.Method {
	case http.MethodGet:
		resource, err := app.backend.Scim.GetScimGroup(r.Context(), connection, groupID)
		if err != nil {
			writeScimErrorFromErr(w, err)
			return
		}
		writeJSON(w, http.StatusOK, resource)

	case http.MethodPut:
		var req scim.CreateGroupRequest
		if !decodeScimJSONBody(w, r, &req) {
			return
		}
		resource, err := app.backend.Scim.ReplaceScimGroup(r.Context(), connection, groupID, req)
		if err != nil {
			writeScimErrorFromErr(w, err)
			return
		}
		writeJSON(w, http.StatusOK, resource)

	case http.MethodPatch:
		var req struct {
			Operations []scim.PatchOperation `json:"Operations"`
		}
		if !decodeScimJSONBody(w, r, &req) {
			return
		}
		resource, err := app.backend.Scim.PatchScimGroup(r.Context(), connection, groupID, req.Operations)
		if err != nil {
			writeScimErrorFromErr(w, err)
			return
		}
		writeJSON(w, http.StatusOK, resource)

	case http.MethodDelete:
		if err := app.backend.Scim.DeleteScimGroup(r.Context(), connection, groupID); err != nil {
			writeScimErrorFromErr(w, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)

	default:
		writeScimError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}
