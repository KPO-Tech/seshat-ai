package api

import "net/http"

func (app *App) handlePermissions(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}

	permissions, err := app.backend.IAM.ListPermissions(r.Context(), principal)
	if err != nil {
		writeIAMError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"permissions": permissions, "count": len(permissions)})
}
