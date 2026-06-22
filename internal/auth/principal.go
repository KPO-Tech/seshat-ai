package auth

import (
	"strings"
	"time"

	"github.com/EngineerProjects/seshat-ai/internal/bkerr"
	"github.com/EngineerProjects/seshat-ai/internal/db"
)

type User struct {
	ID          string `json:"id"`
	Email       string `json:"email"`
	DisplayName string `json:"display_name"`
	Status      string `json:"status"`
}

type AuthSession struct {
	ID        string    `json:"id"`
	ExpiresAt time.Time `json:"expires_at"`
}

type WorkspaceMembership struct {
	WorkspaceID      string `json:"workspace_id"`
	WorkspaceSlug    string `json:"workspace_slug"`
	OrganizationID   string `json:"organization_id"`
	OrganizationSlug string `json:"organization_slug"`
	Role             string `json:"role"`
}

type LoginResult struct {
	Token     string
	ExpiresAt time.Time
	User      User
	Roles     []string
}

type Principal struct {
	User                 User                  `json:"user"`
	AuthSession          AuthSession           `json:"auth_session"`
	Roles                []string              `json:"roles"`
	WorkspaceMemberships []WorkspaceMembership `json:"workspace_memberships"`
}

func (p *Principal) HasRole(roleName string) bool {
	if p == nil {
		return false
	}
	normalized := strings.TrimSpace(strings.ToLower(roleName))
	for _, role := range p.Roles {
		if strings.TrimSpace(strings.ToLower(role)) == normalized {
			return true
		}
	}
	return false
}

func (p *Principal) CanViewOrganization(organizationID string) bool {
	if p.HasRole("admin") {
		return true
	}
	for _, m := range p.WorkspaceMemberships {
		if m.OrganizationID == organizationID {
			return true
		}
	}
	return false
}

func (p *Principal) CanViewWorkspace(workspaceID string) bool {
	if p.HasRole("admin") {
		return true
	}
	for _, m := range p.WorkspaceMemberships {
		if m.WorkspaceID == workspaceID {
			return true
		}
	}
	return false
}

func PrincipalFromDB(principal *db.AuthPrincipal) *Principal {
	if principal == nil || principal.User == nil || principal.AuthSession == nil {
		return nil
	}
	out := &Principal{
		User: User{
			ID:          principal.User.ID,
			Email:       principal.User.Email,
			DisplayName: principal.User.DisplayName,
			Status:      principal.User.Status,
		},
		AuthSession: AuthSession{
			ID:        principal.AuthSession.ID,
			ExpiresAt: principal.AuthSession.ExpiresAt,
		},
		Roles:                make([]string, 0, len(principal.Roles)),
		WorkspaceMemberships: make([]WorkspaceMembership, 0, len(principal.WorkspaceMemberships)),
	}
	for _, role := range principal.Roles {
		out.Roles = append(out.Roles, role.Name)
	}
	for _, m := range principal.WorkspaceMemberships {
		out.WorkspaceMemberships = append(out.WorkspaceMemberships, WorkspaceMembership{
			WorkspaceID:      m.WorkspaceID,
			WorkspaceSlug:    m.WorkspaceSlug,
			OrganizationID:   m.OrganizationID,
			OrganizationSlug: m.OrganizationSlug,
			Role:             m.RoleName,
		})
	}
	return out
}

func EnsureAuthenticated(principal *Principal) error {
	if principal == nil {
		return bkerr.Unauthorized("authentication required", nil)
	}
	return nil
}

func EnsureAdmin(principal *Principal) error {
	if err := EnsureAuthenticated(principal); err != nil {
		return err
	}
	if !principal.HasRole("admin") {
		return bkerr.Forbidden(`role "admin" required`, nil)
	}
	return nil
}
