package api

import "net/http"

type previewExpressionRequest struct {
	Expression string         `json:"expression"`
	Item       map[string]any `json:"item"`
	ItemIndex  int            `json:"item_index"`
}

// handleDataflowPreviewExpression — POST /api/v1/dataflow/preview-expression.
// Lets the graph editor show a real resolved value while a user is still
// authoring a node's expression, instead of only finding out it's wrong once
// the graph actually runs — see automation.Service.PreviewExpression's doc
// comment for the bindings this evaluates against. Any authenticated
// principal can call this, same reasoning as handleDataflowNodeTypes: it's a
// pure JS sandbox evaluation against caller-supplied sample data, nothing
// tenant-scoped or secret is touched. A bad expression is an expected,
// routine outcome while typing, not a server error - reported as 400, not
// 500.
func (app *App) handleDataflowPreviewExpression(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	if _, ok := authPrincipalFromContext(r.Context()); !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}
	var req previewExpressionRequest
	if !decodeJSONBody(w, r, &req) {
		return
	}
	if req.Expression == "" {
		writeJSONError(w, http.StatusBadRequest, "expression is required")
		return
	}
	value, err := app.backend.Automation.PreviewExpression(r.Context(), req.Expression, req.Item, req.ItemIndex)
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"value": value})
}
