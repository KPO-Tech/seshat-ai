package api

import (
	"net/http"
	"strings"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
)

type createMembershipRequest struct {
	OrganizationID string `json:"organization_id"`
	UserID         string `json:"user_id"`
	Role           string `json:"role"`
}

type updateMembershipRequest struct {
	Role string `json:"role"`
}

func (app *App) handleMemberships(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}

	organizationID := strings.TrimSpace(r.URL.Query().Get("organization_id"))
	userID := strings.TrimSpace(r.URL.Query().Get("user_id"))

	switch r.Method {
	case http.MethodGet:
		query, err := parseListQuery(r, "created_at", "asc")
		if err != nil {
			writeJSONError(w, http.StatusBadRequest, err.Error())
			return
		}

		memberships, total, err := app.backend.IAM.ListMemberships(r.Context(), principal, organizationID, userID, sdb.ListParams{
			Search: query.Search,
			Sort:   query.Sort,
			Order:  query.Order,
			Limit:  query.Limit,
			Offset: query.Offset,
		})
		if err != nil {
			writeIAMError(w, err)
			return
		}
		writeListResponse(w, http.StatusOK, "memberships", memberships, query, int(total))
	case http.MethodPost:
		var req createMembershipRequest
		if !decodeJSONBody(w, r, &req) {
			return
		}
		membership, err := app.backend.IAM.CreateMembership(r.Context(), principal, iam.CreateMembershipParams{
			OrganizationID: req.OrganizationID,
			UserID:         req.UserID,
			Role:           req.Role,
		})
		if err != nil {
			writeIAMError(w, err)
			return
		}
		writeJSON(w, http.StatusCreated, membership)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (app *App) handleMembershipByID(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}

	membershipID := strings.TrimSpace(r.PathValue("membershipID"))
	if membershipID == "" {
		writeJSONError(w, http.StatusBadRequest, "missing membership id")
		return
	}

	switch r.Method {
	case http.MethodGet:
		membership, err := app.backend.IAM.GetMembership(r.Context(), principal, membershipID)
		if err != nil {
			writeIAMError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, membership)
	case http.MethodPut:
		var req updateMembershipRequest
		if !decodeJSONBody(w, r, &req) {
			return
		}

		// Membership updates only mutate the role because user and organization
		// identity must remain stable for auditability.
		membership, err := app.backend.IAM.UpdateMembership(r.Context(), principal, membershipID, iam.UpdateMembershipParams{
			Role: req.Role,
		})
		if err != nil {
			writeIAMError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, membership)
	case http.MethodDelete:
		if err := app.backend.IAM.DeleteMembership(r.Context(), principal, membershipID); err != nil {
			writeIAMError(w, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

// handleMembershipConfirm — POST /api/v1/memberships/{membershipID}/confirm.
// Finalizes a self-registered "pending" membership (see iam.Service.Register)
// before it would otherwise be auto-blocked by BlockExpiredPendingMemberships.
func (app *App) handleMembershipConfirm(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}
	membershipID := strings.TrimSpace(r.PathValue("membershipID"))
	if membershipID == "" {
		writeJSONError(w, http.StatusBadRequest, "missing membership id")
		return
	}
	membership, err := app.backend.IAM.ConfirmMembership(r.Context(), principal, membershipID)
	if err != nil {
		writeIAMError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, membership)
}
