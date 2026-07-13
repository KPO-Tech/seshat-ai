package api

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/longtermmemory"
)

func writeLongTermMemoryError(w http.ResponseWriter, err error) { writeControlPlaneError(w, err) }

type upsertEntitiesRequest struct {
	Entities []longtermmemory.EntityInput `json:"entities"`
}

// handleMemoryGraphEntities — POST /api/v1/users/me/memory-graph/entities.
func (app *App) handleMemoryGraphEntities(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	var req upsertEntitiesRequest
	if !decodeJSONBody(w, r, &req) {
		return
	}
	created, err := app.backend.LongTermMemory.UpsertEntities(r.Context(), principal, req.Entities)
	if err != nil {
		writeLongTermMemoryError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"entities": created, "count": len(created)})
}

type addObservationsRequest struct {
	Observations []longtermmemory.ObservationInput `json:"observations"`
}

// handleMemoryGraphObservations — POST /api/v1/users/me/memory-graph/observations.
func (app *App) handleMemoryGraphObservations(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	var req addObservationsRequest
	if !decodeJSONBody(w, r, &req) {
		return
	}
	results, err := app.backend.LongTermMemory.AddObservations(r.Context(), principal, req.Observations)
	if err != nil {
		writeLongTermMemoryError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"results": results})
}

// handleMemoryGraphSearch — GET /api/v1/users/me/memory-graph/search?query=.
func (app *App) handleMemoryGraphSearch(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	query := r.URL.Query().Get("query")
	graph, err := app.backend.LongTermMemory.SearchNodes(r.Context(), principal, query)
	if err != nil {
		writeLongTermMemoryError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, graph)
}

type openNodesRequest struct {
	Names []string `json:"names"`
}

// handleMemoryGraphOpen — POST /api/v1/users/me/memory-graph/open.
func (app *App) handleMemoryGraphOpen(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	var req openNodesRequest
	if !decodeJSONBody(w, r, &req) {
		return
	}
	graph, err := app.backend.LongTermMemory.OpenNodes(r.Context(), principal, req.Names)
	if err != nil {
		writeLongTermMemoryError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, graph)
}

// handleMemoryGraphContext — GET /api/v1/users/me/memory-graph/context?query=&max_tokens=.
func (app *App) handleMemoryGraphContext(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	query := r.URL.Query().Get("query")
	maxTokens := 500
	if raw := strings.TrimSpace(r.URL.Query().Get("max_tokens")); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil && parsed > 0 {
			maxTokens = parsed
		}
	}
	block, err := app.backend.LongTermMemory.RetrieveForContext(r.Context(), principal, query, maxTokens)
	if err != nil {
		writeLongTermMemoryError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"context": block})
}
