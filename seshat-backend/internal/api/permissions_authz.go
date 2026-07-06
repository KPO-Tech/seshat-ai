package api

import (
	"net/http"

	backendauth "github.com/EngineerProjects/seshat-ai/seshat-backend/internal/auth"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/db"
)

type permissionCheck func(db.GroupPermissions) bool

func (app *App) requireScopedPermission(w http.ResponseWriter, r *http.Request, principal *backendauth.Principal, deniedMessage string, check permissionCheck) bool {
	if principal == nil {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return false
	}
	if principal.HasRole("admin") || app == nil || app.groupStore == nil || check == nil {
		return true
	}

	perms, err := app.backend.Auth.GetEffectivePermissions(r.Context(), principal.User.ID)
	if err != nil {
		writeBackendError(w, err)
		return false
	}
	if check(perms) {
		return true
	}

	writeJSONError(w, http.StatusForbidden, deniedMessage)
	return false
}

func (app *App) requireKnowledgePermission(w http.ResponseWriter, r *http.Request, principal *backendauth.Principal) bool {
	return app.requireScopedPermission(w, r, principal, "knowledge permission required", func(perms db.GroupPermissions) bool {
		return perms.Workspace.Knowledge
	})
}

func (app *App) requireWebSearchPermission(w http.ResponseWriter, r *http.Request, principal *backendauth.Principal) bool {
	return app.requireScopedPermission(w, r, principal, "web search permission required", func(perms db.GroupPermissions) bool {
		return perms.Features.WebSearch
	})
}

func (app *App) requireAPIKeysPermission(w http.ResponseWriter, r *http.Request, principal *backendauth.Principal) bool {
	return app.requireScopedPermission(w, r, principal, "api key permission required", func(perms db.GroupPermissions) bool {
		return perms.Features.APIKeys
	})
}

func (app *App) requireFileUploadPermission(w http.ResponseWriter, r *http.Request, principal *backendauth.Principal) bool {
	return app.requireScopedPermission(w, r, principal, "file upload permission required", func(perms db.GroupPermissions) bool {
		return perms.Chat.FileUpload
	})
}

func (app *App) requireChatDeletePermission(w http.ResponseWriter, r *http.Request, principal *backendauth.Principal) bool {
	return app.requireScopedPermission(w, r, principal, "delete permission required", func(perms db.GroupPermissions) bool {
		return perms.Chat.Delete
	})
}
