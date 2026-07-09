package api

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
)

func TestRolesAPIAdminOwnerAndMemberAccess(t *testing.T) {
	handler, backend, _, orgID, bootstrapPrincipal := newTestServerRouter(t)

	orgOwner, err := backend.IAM.CreateUser(context.Background(), bootstrapPrincipal, iam.CreateUserParams{
		Email:          "owner2@example.com",
		Password:       "password123",
		DisplayName:    "Owner Two",
		OrganizationID: orgID,
		Role:           "owner",
	})
	if err != nil {
		t.Fatalf("create owner: %v", err)
	}
	orgAdmin, err := backend.IAM.CreateUser(context.Background(), bootstrapPrincipal, iam.CreateUserParams{
		Email:          "orgadmin@example.com",
		Password:       "password123",
		DisplayName:    "Org Admin",
		OrganizationID: orgID,
		Role:           "admin",
	})
	if err != nil {
		t.Fatalf("create admin: %v", err)
	}
	member, err := backend.IAM.CreateUser(context.Background(), bootstrapPrincipal, iam.CreateUserParams{
		Email:          "member@example.com",
		Password:       "password123",
		DisplayName:    "Member",
		OrganizationID: orgID,
		Role:           "member",
	})
	if err != nil {
		t.Fatalf("create member: %v", err)
	}

	ownerLogin, err := backend.IAM.Login(context.Background(), orgOwner.Email, "password123")
	if err != nil {
		t.Fatalf("login owner: %v", err)
	}
	adminLogin, err := backend.IAM.Login(context.Background(), orgAdmin.Email, "password123")
	if err != nil {
		t.Fatalf("login admin: %v", err)
	}
	memberLogin, err := backend.IAM.Login(context.Background(), member.Email, "password123")
	if err != nil {
		t.Fatalf("login member: %v", err)
	}

	memberBody, _ := json.Marshal(map[string]any{
		"organization_id": orgID,
		"code":            "member_delegate",
		"name":            "Member Delegate",
		"description":     "Should be denied",
		"permissions":     []string{"organization.read"},
	})
	memberReq := httptest.NewRequest(http.MethodPost, "/api/v1/roles", bytes.NewReader(memberBody))
	memberReq.Header.Set("Authorization", "Bearer "+memberLogin.Token)
	memberRec := httptest.NewRecorder()
	handler.ServeHTTP(memberRec, memberReq)
	if memberRec.Code != http.StatusForbidden {
		t.Fatalf("expected member role create forbidden, got %d", memberRec.Code)
	}

	adminBody, _ := json.Marshal(map[string]any{
		"organization_id": orgID,
		"code":            "ops_admin",
		"name":            "Ops Admin",
		"description":     "Admin managed",
		"permissions":     []string{"organization.read"},
	})
	adminReq := httptest.NewRequest(http.MethodPost, "/api/v1/roles", bytes.NewReader(adminBody))
	adminReq.Header.Set("Authorization", "Bearer "+adminLogin.Token)
	adminRec := httptest.NewRecorder()
	handler.ServeHTTP(adminRec, adminReq)
	if adminRec.Code != http.StatusCreated {
		t.Fatalf("expected admin role create success, got %d", adminRec.Code)
	}

	ownerBody, _ := json.Marshal(map[string]any{
		"organization_id": orgID,
		"code":            "ops_owner",
		"name":            "Ops Owner",
		"description":     "Owner managed",
		"permissions":     []string{"organization.read"},
	})
	ownerReq := httptest.NewRequest(http.MethodPost, "/api/v1/roles", bytes.NewReader(ownerBody))
	ownerReq.Header.Set("Authorization", "Bearer "+ownerLogin.Token)
	ownerRec := httptest.NewRecorder()
	handler.ServeHTTP(ownerRec, ownerReq)
	if ownerRec.Code != http.StatusCreated {
		t.Fatalf("expected owner role create success, got %d", ownerRec.Code)
	}
}

func TestRolesAPIUpdateAndDeleteLifecycle(t *testing.T) {
	handler, backend, token, orgID, principal := newTestServerRouter(t)

	createBody, _ := json.Marshal(map[string]any{
		"organization_id": orgID,
		"code":            "support_ops",
		"name":            "Support Ops",
		"description":     "Delegated support",
		"permissions":     []string{"invitations.manage"},
	})
	createReq := httptest.NewRequest(http.MethodPost, "/api/v1/roles", bytes.NewReader(createBody))
	createReq.Header.Set("Authorization", "Bearer "+token)
	createRec := httptest.NewRecorder()
	handler.ServeHTTP(createRec, createReq)
	if createRec.Code != http.StatusCreated {
		t.Fatalf("expected role creation success, got %d", createRec.Code)
	}

	assignedUser, err := backend.IAM.CreateUser(context.Background(), principal, iam.CreateUserParams{
		Email:          "support@example.com",
		Password:       "password123",
		DisplayName:    "Support",
		OrganizationID: orgID,
		Role:           "support_ops",
	})
	if err != nil {
		t.Fatalf("create assigned user: %v", err)
	}
	invite, err := backend.IAM.CreateInvitation(context.Background(), principal, iam.CreateInvitationParams{
		OrganizationID: orgID,
		Email:          "pending@example.com",
		Role:           "support_ops",
		ExpiresInDays:  7,
	})
	if err != nil {
		t.Fatalf("create pending invitation: %v", err)
	}

	updateBody, _ := json.Marshal(map[string]any{
		"organization_id": orgID,
		"code":            "support_lead",
		"name":            "Support Lead",
		"description":     "Renamed delegated support",
		"permissions":     []string{"invitations.manage"},
	})
	updateReq := httptest.NewRequest(http.MethodPut, "/api/v1/roles/support_ops", bytes.NewReader(updateBody))
	updateReq.Header.Set("Authorization", "Bearer "+token)
	updateRec := httptest.NewRecorder()
	handler.ServeHTTP(updateRec, updateReq)
	if updateRec.Code != http.StatusOK {
		t.Fatalf("expected role update success, got %d", updateRec.Code)
	}

	getReq := httptest.NewRequest(http.MethodGet, "/api/v1/roles/support_lead?organization_id="+orgID, nil)
	getReq.Header.Set("Authorization", "Bearer "+token)
	getRec := httptest.NewRecorder()
	handler.ServeHTTP(getRec, getReq)
	if getRec.Code != http.StatusOK {
		t.Fatalf("expected get updated role success, got %d", getRec.Code)
	}

	deleteReq := httptest.NewRequest(http.MethodDelete, "/api/v1/roles/support_lead?organization_id="+orgID, nil)
	deleteReq.Header.Set("Authorization", "Bearer "+token)
	deleteRec := httptest.NewRecorder()
	handler.ServeHTTP(deleteRec, deleteReq)
	if deleteRec.Code != http.StatusConflict {
		t.Fatalf("expected delete conflict while role assigned, got %d", deleteRec.Code)
	}

	memberships, _, err := backend.IAM.ListMemberships(context.Background(), principal, orgID, assignedUser.ID, sdb.ListParams{Sort: "created_at", Order: "asc", Limit: 50})
	if err != nil {
		t.Fatalf("list assigned memberships: %v", err)
	}
	if len(memberships) != 1 {
		t.Fatalf("expected one assigned membership, got %d", len(memberships))
	}
	membership := memberships[0]
	if _, err := backend.IAM.UpdateMembership(context.Background(), principal, membership.ID, iam.UpdateMembershipParams{Role: "viewer"}); err != nil {
		t.Fatalf("demote assigned membership: %v", err)
	}

	deleteReq = httptest.NewRequest(http.MethodDelete, "/api/v1/roles/support_lead?organization_id="+orgID, nil)
	deleteReq.Header.Set("Authorization", "Bearer "+token)
	deleteRec = httptest.NewRecorder()
	handler.ServeHTTP(deleteRec, deleteReq)
	if deleteRec.Code != http.StatusConflict {
		t.Fatalf("expected delete conflict while invitation active, got %d", deleteRec.Code)
	}
	if _, err := backend.IAM.RevokeInvitation(context.Background(), principal, invite.ID); err != nil {
		t.Fatalf("revoke invitation: %v", err)
	}

	deleteReq = httptest.NewRequest(http.MethodDelete, "/api/v1/roles/support_lead?organization_id="+orgID, nil)
	deleteReq.Header.Set("Authorization", "Bearer "+token)
	deleteRec = httptest.NewRecorder()
	handler.ServeHTTP(deleteRec, deleteReq)
	if deleteRec.Code != http.StatusNoContent {
		t.Fatalf("expected role delete success, got %d", deleteRec.Code)
	}
}
