package api

import (
	"net/http"
	"strings"

	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/skillregistry"
)

func writeSkillRegistryError(w http.ResponseWriter, err error) { writeControlPlaneError(w, err) }

type createSkillRepoRequest struct {
	OrganizationID string `json:"organization_id"`
	Name           string `json:"name"`
	URL            string `json:"url"`
	Description    string `json:"description"`
}

type updateSkillRepoRequest struct {
	Name        string `json:"name"`
	URL         string `json:"url"`
	Description string `json:"description"`
}

func (app *App) handleSkillRepos(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}

	switch r.Method {
	case http.MethodGet:
		organizationID := strings.TrimSpace(r.URL.Query().Get("organization_id"))
		repos, err := app.backend.SkillRegistry.ListSkillRepos(r.Context(), principal, organizationID)
		if err != nil {
			writeSkillRegistryError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"skill_repos": repos, "count": len(repos)})
	case http.MethodPost:
		var req createSkillRepoRequest
		if !decodeJSONBody(w, r, &req) {
			return
		}
		repo, err := app.backend.SkillRegistry.CreateSkillRepo(r.Context(), principal, skillregistry.CreateSkillRepoParams{
			OrganizationID: req.OrganizationID,
			Name:           req.Name,
			URL:            req.URL,
			Description:    req.Description,
		})
		if err != nil {
			writeSkillRegistryError(w, err)
			return
		}
		writeJSON(w, http.StatusCreated, repo)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (app *App) handleSkillRepoByID(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}
	id := strings.TrimSpace(r.PathValue("skillRepoID"))
	if id == "" {
		writeJSONError(w, http.StatusBadRequest, "missing skill repo id")
		return
	}

	switch r.Method {
	case http.MethodPut:
		var req updateSkillRepoRequest
		if !decodeJSONBody(w, r, &req) {
			return
		}
		repo, err := app.backend.SkillRegistry.UpdateSkillRepo(r.Context(), principal, id, skillregistry.UpdateSkillRepoParams{
			Name:        req.Name,
			URL:         req.URL,
			Description: req.Description,
		})
		if err != nil {
			writeSkillRegistryError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, repo)
	case http.MethodDelete:
		if err := app.backend.SkillRegistry.DeleteSkillRepo(r.Context(), principal, id); err != nil {
			writeSkillRegistryError(w, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}
