package api

import (
	"net/http"
	"strings"

	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/memories"
)

func writeMemoriesError(w http.ResponseWriter, err error) { writeControlPlaneError(w, err) }

type createMemoryRequest struct {
	Type       string  `json:"type"`
	Key        string  `json:"key"`
	Value      string  `json:"value"`
	Importance float64 `json:"importance"`
	Source     string  `json:"source"`
}

type updateMemoryRequest struct {
	Type       *string  `json:"type"`
	Key        *string  `json:"key"`
	Value      *string  `json:"value"`
	Importance *float64 `json:"importance"`
	Source     *string  `json:"source"`
}

// handleUserMemories — GET/POST/DELETE /api/v1/users/me/memories. Self-service
// only, same trust level as preferences: a memory only ever means "mine."
// DELETE with no id path segment deletes ALL of the caller's memories.
func (app *App) handleUserMemories(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}
	switch r.Method {
	case http.MethodGet:
		rows, err := app.backend.Memories.List(r.Context(), principal)
		if err != nil {
			writeMemoriesError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"memories": rows, "count": len(rows)})
	case http.MethodPost:
		var req createMemoryRequest
		if !decodeJSONBody(w, r, &req) {
			return
		}
		created, err := app.backend.Memories.Create(r.Context(), principal, memories.CreateParams{
			Type: req.Type, Key: req.Key, Value: req.Value, Importance: req.Importance, Source: req.Source,
		})
		if err != nil {
			writeMemoriesError(w, err)
			return
		}
		writeJSON(w, http.StatusCreated, created)
	case http.MethodDelete:
		n, err := app.backend.Memories.DeleteAll(r.Context(), principal)
		if err != nil {
			writeMemoriesError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"deleted": n})
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

// handleUserMemoryByID — PUT/DELETE /api/v1/users/me/memories/{memoryID}.
func (app *App) handleUserMemoryByID(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}
	id := strings.TrimSpace(r.PathValue("memoryID"))
	if id == "" {
		writeJSONError(w, http.StatusBadRequest, "missing memory id")
		return
	}
	switch r.Method {
	case http.MethodPut:
		var req updateMemoryRequest
		if !decodeJSONBody(w, r, &req) {
			return
		}
		updated, err := app.backend.Memories.Update(r.Context(), principal, id, memories.UpdateParams{
			Type: req.Type, Key: req.Key, Value: req.Value, Importance: req.Importance, Source: req.Source,
		})
		if err != nil {
			writeMemoriesError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, updated)
	case http.MethodDelete:
		if err := app.backend.Memories.Delete(r.Context(), principal, id); err != nil {
			writeMemoriesError(w, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}
