// GET/POST/PUT/PATCH/DELETE /scim/v2/Users - Étape 4 of the staged plan in
// docs/helps/audit-2026-08-29-openwork-den-comparison.md.
package api

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/scim"
)

// decodeScimJSONBody is decodeJSONBody's SCIM-error-format counterpart -
// every /scim/v2/* handler must report a malformed body the same way it
// reports any other error, not via this API's usual {"error":...} envelope.
func decodeScimJSONBody(w http.ResponseWriter, r *http.Request, dst any) bool {
	if err := json.NewDecoder(r.Body).Decode(dst); err != nil {
		writeScimError(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return false
	}
	return true
}

// handleScimUsers — GET/POST /scim/v2/Users.
func (app *App) handleScimUsers(w http.ResponseWriter, r *http.Request) {
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
		filter := r.URL.Query().Get("filter")

		resources, total, err := app.backend.Scim.ListScimUsers(r.Context(), connection, startIndex, count, filter)
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
		var req scim.CreateUserRequest
		if !decodeScimJSONBody(w, r, &req) {
			return
		}
		resource, err := app.backend.Scim.CreateScimUser(r.Context(), connection, req)
		if err != nil {
			writeScimErrorFromErr(w, err)
			return
		}
		writeJSON(w, http.StatusCreated, resource)

	default:
		writeScimError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

// handleScimUserByID — GET/PUT/PATCH/DELETE /scim/v2/Users/{userID}.
func (app *App) handleScimUserByID(w http.ResponseWriter, r *http.Request) {
	connection, ok := app.resolveScimConnectionFromRequest(w, r)
	if !ok {
		return
	}
	userID := strings.TrimSpace(r.PathValue("userID"))
	if userID == "" {
		writeScimError(w, http.StatusBadRequest, "missing user id")
		return
	}

	switch r.Method {
	case http.MethodGet:
		resource, err := app.backend.Scim.GetScimUser(r.Context(), connection, userID)
		if err != nil {
			writeScimErrorFromErr(w, err)
			return
		}
		writeJSON(w, http.StatusOK, resource)

	case http.MethodPut:
		var req scim.CreateUserRequest
		if !decodeScimJSONBody(w, r, &req) {
			return
		}
		resource, err := app.backend.Scim.ReplaceScimUser(r.Context(), connection, userID, req)
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
		resource, err := app.backend.Scim.PatchScimUser(r.Context(), connection, userID, req.Operations)
		if err != nil {
			writeScimErrorFromErr(w, err)
			return
		}
		writeJSON(w, http.StatusOK, resource)

	case http.MethodDelete:
		if err := app.backend.Scim.DeactivateScimUser(r.Context(), connection, userID); err != nil {
			writeScimErrorFromErr(w, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)

	default:
		writeScimError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}
