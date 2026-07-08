package api

import (
	"net/http"
	"strings"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
)

type createInvitationRequest struct {
	OrganizationID string `json:"organization_id"`
	Email          string `json:"email"`
	Role           string `json:"role"`
	ExpiresInDays  int    `json:"expires_in_days"`
}

type acceptInvitationRequest struct {
	Token string `json:"token"`
}

func (app *App) handleInvitations(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}

	organizationID := strings.TrimSpace(r.URL.Query().Get("organization_id"))
	status := strings.TrimSpace(r.URL.Query().Get("status"))

	switch r.Method {
	case http.MethodGet:
		query, err := parseListQuery(r, "created_at", "desc")
		if err != nil {
			writeJSONError(w, http.StatusBadRequest, err.Error())
			return
		}

		invitations, total, err := app.backend.IAM.ListInvitations(r.Context(), principal, organizationID, status, sdb.ListParams{
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
		writeListResponse(w, http.StatusOK, "invitations", invitations, query, int(total))
	case http.MethodPost:
		var req createInvitationRequest
		if !decodeJSONBody(w, r, &req) {
			return
		}
		invitation, err := app.backend.IAM.CreateInvitation(r.Context(), principal, iam.CreateInvitationParams{
			OrganizationID: req.OrganizationID,
			Email:          req.Email,
			Role:           req.Role,
			ExpiresInDays:  req.ExpiresInDays,
		})
		if err != nil {
			writeIAMError(w, err)
			return
		}
		writeJSON(w, http.StatusCreated, invitation)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (app *App) handleInvitationByID(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}

	invitationID := strings.TrimSpace(r.PathValue("invitationID"))
	if invitationID == "" {
		writeJSONError(w, http.StatusBadRequest, "missing invitation id")
		return
	}

	invitation, err := app.backend.IAM.GetInvitation(r.Context(), principal, invitationID)
	if err != nil {
		writeIAMError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, invitation)
}

func (app *App) handleInvitationAccept(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}

	var req acceptInvitationRequest
	if !decodeJSONBody(w, r, &req) {
		return
	}

	// Acceptance is token-driven but still authenticated so we can bind the
	// resulting membership to the correct local account.
	membership, err := app.backend.IAM.AcceptInvitation(r.Context(), principal, iam.AcceptInvitationParams{Token: req.Token})
	if err != nil {
		writeIAMError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, membership)
}

func (app *App) handleInvitationRevoke(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}

	invitationID := strings.TrimSpace(r.PathValue("invitationID"))
	if invitationID == "" {
		writeJSONError(w, http.StatusBadRequest, "missing invitation id")
		return
	}

	invitation, err := app.backend.IAM.RevokeInvitation(r.Context(), principal, invitationID)
	if err != nil {
		writeIAMError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, invitation)
}
