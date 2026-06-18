package api

import (
	"net/http"
	"strings"
	"time"

	backendauth "github.com/EngineerProjects/nexus_ai/internal/auth"
	"github.com/EngineerProjects/nexus_ai/internal/db"
)

// ─── Request / Response types ──────────────────────────────────────────────────

type groupResponse struct {
	ID          string              `json:"id"`
	Name        string              `json:"name"`
	Description string              `json:"description"`
	Permissions permissionsResponse `json:"permissions"`
	CreatedAt   time.Time           `json:"created_at"`
	UpdatedAt   time.Time           `json:"updated_at"`
}

type createGroupRequest struct {
	Name        string              `json:"name"`
	Description string              `json:"description"`
	Permissions permissionsResponse `json:"permissions"`
}

type updateGroupRequest struct {
	Name        *string              `json:"name,omitempty"`
	Description *string              `json:"description,omitempty"`
	Permissions *permissionsResponse `json:"permissions,omitempty"`
}

type groupMemberRequest struct {
	UserID string `json:"user_id"`
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

// handleGroups handles GET /api/v1/groups and POST /api/v1/groups
func (app *App) handleGroups(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	switch r.Method {
	case http.MethodGet:
		var groups []db.UserGroup
		var err error

		if principal.HasRole("admin") {
			// Admin: list all groups
			groups, err = app.groupStore.ListGroups(r.Context())
		} else {
			// User: list only their groups
			groups, err = app.groupStore.ListGroupsForUser(r.Context(), principal.User.ID)
		}
		if err != nil {
			writeBackendError(w, err)
			return
		}

		out := make([]groupResponse, 0, len(groups))
		for _, g := range groups {
			out = append(out, toGroupResponse(g))
		}
		writeJSON(w, http.StatusOK, map[string]any{"groups": out, "count": len(out)})

	case http.MethodPost:
		if err := backendauth.EnsureAdmin(principal); err != nil {
			writeBackendError(w, err)
			return
		}
		var req createGroupRequest
		if !decodeJSONBody(w, r, &req) {
			return
		}
		if strings.TrimSpace(req.Name) == "" {
			writeJSONError(w, http.StatusBadRequest, "name is required")
			return
		}
		perms := fromPermissionsRequest(req.Permissions)
		group, err := app.groupStore.CreateGroup(r.Context(), req.Name, req.Description, perms)
		if err != nil {
			writeBackendError(w, err)
			return
		}
		writeJSON(w, http.StatusCreated, toGroupResponse(*group))

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// handleGroupByID handles routes under /api/v1/groups/{id}
// It dispatches to detail, update, delete, and member management.
func (app *App) handleGroupByID(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	// Path is e.g. /groups/{id} or /groups/{id}/members or /groups/{id}/members/{userID}
	rawPath := strings.TrimPrefix(r.URL.Path, "/groups/")
	rawPath = strings.Trim(rawPath, "/")

	parts := strings.SplitN(rawPath, "/", 3)
	groupID := parts[0]
	if groupID == "" {
		writeJSONError(w, http.StatusBadRequest, "group id is required")
		return
	}

	// Sub-resource routing
	if len(parts) >= 2 && parts[1] == "members" {
		app.handleGroupMembers(w, r, principal, groupID, parts)
		return
	}

	// Group CRUD
	switch r.Method {
	case http.MethodGet:
		if err := backendauth.EnsureAdmin(principal); err != nil {
			writeBackendError(w, err)
			return
		}
		group, err := app.groupStore.GetGroupByID(r.Context(), groupID)
		if err != nil {
			writeJSONError(w, http.StatusNotFound, "group not found")
			return
		}

		// Include members
		memberIDs, err := app.groupStore.ListGroupMembers(r.Context(), groupID)
		if err != nil {
			writeBackendError(w, err)
			return
		}

		resp := map[string]any{
			"group":   toGroupResponse(*group),
			"members": memberIDs,
		}
		writeJSON(w, http.StatusOK, resp)

	case http.MethodPut:
		if err := backendauth.EnsureAdmin(principal); err != nil {
			writeBackendError(w, err)
			return
		}
		var req updateGroupRequest
		if !decodeJSONBody(w, r, &req) {
			return
		}

		params := db.UpdateGroupParams{
			Name:        req.Name,
			Description: req.Description,
		}
		if req.Permissions != nil {
			perms := fromPermissionsRequest(*req.Permissions)
			params.Permissions = &perms
		}

		group, err := app.groupStore.UpdateGroup(r.Context(), groupID, params)
		if err != nil {
			writeBackendError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, toGroupResponse(*group))

	case http.MethodDelete:
		if err := backendauth.EnsureAdmin(principal); err != nil {
			writeBackendError(w, err)
			return
		}
		if err := app.groupStore.DeleteGroup(r.Context(), groupID); err != nil {
			writeBackendError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"status": "deleted"})

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// handleGroupMembers handles POST /api/v1/groups/{id}/members and
// DELETE /api/v1/groups/{id}/members/{userId}
func (app *App) handleGroupMembers(w http.ResponseWriter, r *http.Request, principal *backendauth.Principal, groupID string, parts []string) {
	if err := backendauth.EnsureAdmin(principal); err != nil {
		writeBackendError(w, err)
		return
	}

	// /groups/{id}/members/{userId}
	if len(parts) >= 3 && parts[2] != "" {
		targetUserID := strings.Trim(parts[2], "/")
		if r.Method != http.MethodDelete {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		if err := app.groupStore.RemoveGroupMember(r.Context(), groupID, targetUserID); err != nil {
			writeJSONError(w, http.StatusNotFound, "membership not found")
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"status": "removed"})
		return
	}

	// /groups/{id}/members
	switch r.Method {
	case http.MethodGet:
		memberIDs, err := app.groupStore.ListGroupMembers(r.Context(), groupID)
		if err != nil {
			writeBackendError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"members": memberIDs, "count": len(memberIDs)})

	case http.MethodPost:
		var req groupMemberRequest
		if !decodeJSONBody(w, r, &req) {
			return
		}
		if strings.TrimSpace(req.UserID) == "" {
			writeJSONError(w, http.StatusBadRequest, "user_id is required")
			return
		}
		if err := app.groupStore.AddGroupMember(r.Context(), groupID, req.UserID); err != nil {
			writeBackendError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"status": "added"})

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// ─── Conversion helpers ────────────────────────────────────────────────────────

func toGroupResponse(g db.UserGroup) groupResponse {
	return groupResponse{
		ID:          g.ID,
		Name:        g.Name,
		Description: g.Description,
		Permissions: toPermissionsResponse(g.Permissions),
		CreatedAt:   g.CreatedAt,
		UpdatedAt:   g.UpdatedAt,
	}
}

func fromPermissionsRequest(p permissionsResponse) db.GroupPermissions {
	return db.GroupPermissions{
		Workspace: db.WorkspacePerms{
			Models:    p.Workspace.Models,
			Knowledge: p.Workspace.Knowledge,
			Prompts:   p.Workspace.Prompts,
		},
		Chat: db.ChatPerms{
			FileUpload: p.Chat.FileUpload,
			Delete:     p.Chat.Delete,
		},
		Features: db.FeaturePerms{
			APIKeys:   p.Features.APIKeys,
			WebSearch: p.Features.WebSearch,
		},
	}
}
