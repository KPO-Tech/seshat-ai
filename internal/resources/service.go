package resources

import (
	"context"

	"github.com/EngineerProjects/seshat-ai/internal/auth"
	"github.com/EngineerProjects/seshat-ai/internal/bkerr"
	"github.com/EngineerProjects/seshat-ai/internal/db"
)

type Service struct {
	identity *db.IdentityStore
}

func NewService(identity *db.IdentityStore) *Service {
	return &Service{identity: identity}
}

// ─── Users ────────────────────────────────────────────────────────────────────

func (s *Service) ListUsers(ctx context.Context, principal *auth.Principal) ([]auth.User, error) {
	if s == nil || s.identity == nil {
		return nil, bkerr.Unavailable("identity store not configured", nil)
	}
	if err := auth.EnsureAdmin(principal); err != nil {
		return nil, err
	}
	users, err := s.identity.ListUsers(ctx)
	if err != nil {
		return nil, bkerr.Internal("failed to list users", err)
	}
	out := make([]auth.User, 0, len(users))
	for _, user := range users {
		copied := user
		out = append(out, userFromDB(&copied))
	}
	return out, nil
}

func (s *Service) CreateUser(ctx context.Context, principal *auth.Principal, params CreateUserParams) (*auth.User, error) {
	if s == nil || s.identity == nil {
		return nil, bkerr.Unavailable("identity store not configured", nil)
	}
	if err := auth.EnsureAdmin(principal); err != nil {
		return nil, err
	}
	passwordHash, err := db.HashPassword(params.Password)
	if err != nil {
		return nil, bkerr.InvalidInput(err.Error(), err)
	}
	user, err := s.identity.CreateUser(ctx, db.CreateUserParams{
		Email:        params.Email,
		DisplayName:  params.DisplayName,
		PasswordHash: passwordHash,
		Status:       params.Status,
	})
	if err != nil {
		return nil, bkerr.InvalidInput("failed to create user", err)
	}
	for _, roleName := range params.Roles {
		if err := s.identity.AssignRoleToUser(ctx, user.ID, roleName); err != nil {
			return nil, bkerr.InvalidInput("failed to assign role", err)
		}
	}
	result := userFromDB(user)
	return &result, nil
}

func (s *Service) GetUser(ctx context.Context, principal *auth.Principal, userID string) (*auth.User, error) {
	if s == nil || s.identity == nil {
		return nil, bkerr.Unavailable("identity store not configured", nil)
	}
	if err := auth.EnsureAdmin(principal); err != nil {
		return nil, err
	}
	user, err := s.identity.GetUserByID(ctx, userID)
	if err != nil {
		return nil, bkerr.NotFound("user not found", err)
	}
	result := userFromDB(user)
	return &result, nil
}

func (s *Service) UpdateUser(ctx context.Context, principal *auth.Principal, userID string, params UpdateUserParams) (*auth.User, error) {
	if s == nil || s.identity == nil {
		return nil, bkerr.Unavailable("identity store not configured", nil)
	}
	if err := auth.EnsureAdmin(principal); err != nil {
		return nil, err
	}
	var passwordHash *string
	if params.Password != nil {
		hashed, err := db.HashPassword(*params.Password)
		if err != nil {
			return nil, bkerr.InvalidInput(err.Error(), err)
		}
		passwordHash = &hashed
	}
	user, err := s.identity.UpdateUser(ctx, db.UpdateUserParams{
		ID:           userID,
		DisplayName:  params.DisplayName,
		PasswordHash: passwordHash,
		Status:       params.Status,
	})
	if err != nil {
		return nil, bkerr.InvalidInput("failed to update user", err)
	}
	result := userFromDB(user)
	return &result, nil
}

func (s *Service) DeleteUser(ctx context.Context, principal *auth.Principal, userID string) error {
	if s == nil || s.identity == nil {
		return bkerr.Unavailable("identity store not configured", nil)
	}
	if err := auth.EnsureAdmin(principal); err != nil {
		return err
	}
	if err := s.identity.DeleteUser(ctx, userID); err != nil {
		return bkerr.InvalidInput("failed to delete user", err)
	}
	return nil
}

// ─── Organizations ────────────────────────────────────────────────────────────

func (s *Service) ListOrganizations(ctx context.Context, principal *auth.Principal) ([]Organization, error) {
	if s == nil || s.identity == nil {
		return nil, bkerr.Unavailable("identity store not configured", nil)
	}
	if err := auth.EnsureAuthenticated(principal); err != nil {
		return nil, err
	}
	var (
		orgs []db.Organization
		err  error
	)
	if principal.HasRole("admin") {
		orgs, err = s.identity.ListOrganizations(ctx)
	} else {
		orgs, err = s.identity.ListOrganizationsForUser(ctx, principal.User.ID)
	}
	if err != nil {
		return nil, bkerr.Internal("failed to list organizations", err)
	}
	out := make([]Organization, 0, len(orgs))
	for _, org := range orgs {
		copied := org
		out = append(out, organizationFromDB(&copied))
	}
	return out, nil
}

func (s *Service) CreateOrganization(ctx context.Context, principal *auth.Principal, params CreateOrganizationParams) (*Organization, error) {
	if s == nil || s.identity == nil {
		return nil, bkerr.Unavailable("identity store not configured", nil)
	}
	if err := auth.EnsureAdmin(principal); err != nil {
		return nil, err
	}
	org, err := s.identity.CreateOrganization(ctx, db.CreateOrganizationParams{
		Name:        params.Name,
		Slug:        params.Slug,
		OwnerUserID: principal.User.ID,
	})
	if err != nil {
		return nil, bkerr.InvalidInput("failed to create organization", err)
	}
	result := organizationFromDB(org)
	return &result, nil
}

func (s *Service) GetOrganization(ctx context.Context, principal *auth.Principal, organizationID string) (*Organization, error) {
	if s == nil || s.identity == nil {
		return nil, bkerr.Unavailable("identity store not configured", nil)
	}
	if err := auth.EnsureAuthenticated(principal); err != nil {
		return nil, err
	}
	if !principal.CanViewOrganization(organizationID) {
		return nil, bkerr.Forbidden("organization access denied", nil)
	}
	org, err := s.identity.GetOrganizationByID(ctx, organizationID)
	if err != nil {
		return nil, bkerr.NotFound("organization not found", err)
	}
	result := organizationFromDB(org)
	return &result, nil
}

func (s *Service) UpdateOrganization(ctx context.Context, principal *auth.Principal, organizationID string, params UpdateOrganizationParams) (*Organization, error) {
	if s == nil || s.identity == nil {
		return nil, bkerr.Unavailable("identity store not configured", nil)
	}
	if err := auth.EnsureAdmin(principal); err != nil {
		return nil, err
	}
	org, err := s.identity.UpdateOrganization(ctx, db.UpdateOrganizationParams{
		ID:     organizationID,
		Name:   params.Name,
		Slug:   params.Slug,
		Status: params.Status,
	})
	if err != nil {
		return nil, bkerr.InvalidInput("failed to update organization", err)
	}
	result := organizationFromDB(org)
	return &result, nil
}

func (s *Service) DeleteOrganization(ctx context.Context, principal *auth.Principal, organizationID string) error {
	if s == nil || s.identity == nil {
		return bkerr.Unavailable("identity store not configured", nil)
	}
	if err := auth.EnsureAdmin(principal); err != nil {
		return err
	}
	if err := s.identity.DeleteOrganization(ctx, organizationID); err != nil {
		return bkerr.InvalidInput("failed to delete organization", err)
	}
	return nil
}

// ─── Workspaces ───────────────────────────────────────────────────────────────

func (s *Service) ListWorkspaces(ctx context.Context, principal *auth.Principal) ([]Workspace, error) {
	if s == nil || s.identity == nil {
		return nil, bkerr.Unavailable("identity store not configured", nil)
	}
	if err := auth.EnsureAuthenticated(principal); err != nil {
		return nil, err
	}
	var (
		workspaces []db.Workspace
		err        error
	)
	if principal.HasRole("admin") {
		workspaces, err = s.identity.ListWorkspaces(ctx)
	} else {
		workspaces, err = s.identity.ListWorkspacesForUser(ctx, principal.User.ID)
	}
	if err != nil {
		return nil, bkerr.Internal("failed to list workspaces", err)
	}
	out := make([]Workspace, 0, len(workspaces))
	for _, workspace := range workspaces {
		copied := workspace
		out = append(out, workspaceFromDB(&copied))
	}
	return out, nil
}

func (s *Service) CreateWorkspace(ctx context.Context, principal *auth.Principal, params CreateWorkspaceParams) (*Workspace, error) {
	if s == nil || s.identity == nil {
		return nil, bkerr.Unavailable("identity store not configured", nil)
	}
	if err := auth.EnsureAdmin(principal); err != nil {
		return nil, err
	}
	workspace, err := s.identity.CreateWorkspace(ctx, db.CreateWorkspaceParams{
		OrganizationID: params.OrganizationID,
		Name:           params.Name,
		Slug:           params.Slug,
	})
	if err != nil {
		return nil, bkerr.InvalidInput("failed to create workspace", err)
	}
	result := workspaceFromDB(workspace)
	return &result, nil
}

func (s *Service) GetWorkspace(ctx context.Context, principal *auth.Principal, workspaceID string) (*Workspace, error) {
	if s == nil || s.identity == nil {
		return nil, bkerr.Unavailable("identity store not configured", nil)
	}
	if err := auth.EnsureAuthenticated(principal); err != nil {
		return nil, err
	}
	if !principal.CanViewWorkspace(workspaceID) {
		return nil, bkerr.Forbidden("workspace access denied", nil)
	}
	workspace, err := s.identity.GetWorkspaceByID(ctx, workspaceID)
	if err != nil {
		return nil, bkerr.NotFound("workspace not found", err)
	}
	result := workspaceFromDB(workspace)
	return &result, nil
}

func (s *Service) UpdateWorkspace(ctx context.Context, principal *auth.Principal, workspaceID string, params UpdateWorkspaceParams) (*Workspace, error) {
	if s == nil || s.identity == nil {
		return nil, bkerr.Unavailable("identity store not configured", nil)
	}
	if err := auth.EnsureAdmin(principal); err != nil {
		return nil, err
	}
	workspace, err := s.identity.UpdateWorkspace(ctx, db.UpdateWorkspaceParams{
		ID:             workspaceID,
		OrganizationID: params.OrganizationID,
		Name:           params.Name,
		Slug:           params.Slug,
		Status:         params.Status,
	})
	if err != nil {
		return nil, bkerr.InvalidInput("failed to update workspace", err)
	}
	result := workspaceFromDB(workspace)
	return &result, nil
}

func (s *Service) DeleteWorkspace(ctx context.Context, principal *auth.Principal, workspaceID string) error {
	if s == nil || s.identity == nil {
		return bkerr.Unavailable("identity store not configured", nil)
	}
	if err := auth.EnsureAdmin(principal); err != nil {
		return err
	}
	if err := s.identity.DeleteWorkspace(ctx, workspaceID); err != nil {
		return bkerr.InvalidInput("failed to delete workspace", err)
	}
	return nil
}

// ─── DB converters ────────────────────────────────────────────────────────────

func userFromDB(user *db.User) auth.User {
	if user == nil {
		return auth.User{}
	}
	return auth.User{
		ID:          user.ID,
		Email:       user.Email,
		DisplayName: user.DisplayName,
		Status:      user.Status,
	}
}

func organizationFromDB(org *db.Organization) Organization {
	if org == nil {
		return Organization{}
	}
	return Organization{
		ID:          org.ID,
		Name:        org.Name,
		Slug:        org.Slug,
		OwnerUserID: org.OwnerUserID,
		Status:      org.Status,
	}
}

func workspaceFromDB(workspace *db.Workspace) Workspace {
	if workspace == nil {
		return Workspace{}
	}
	return Workspace{
		ID:             workspace.ID,
		OrganizationID: workspace.OrganizationID,
		Name:           workspace.Name,
		Slug:           workspace.Slug,
		Status:         workspace.Status,
	}
}
