package auth

import (
	"context"
	"strings"
	"time"

	"github.com/EngineerProjects/nexus_ai/internal/bkerr"
	"github.com/EngineerProjects/nexus_ai/internal/db"
)

// ServiceConfig holds configuration for the auth service.
type ServiceConfig struct {
	EnableSignup    bool
	DefaultUserRole string
	EnableAPIKeys   bool
}

// ProfileUpdateParams is used to update a user's profile.
type ProfileUpdateParams struct {
	DisplayName *string
	Username    *string
	Bio         *string
	AvatarURL   *string
}

type DeleteOwnAccountParams struct {
	ConfirmEmail string
}

type Service struct {
	identity *db.IdentityStore
	apiKeys  *db.APIKeyStore
	groups   *db.GroupStore
	config   ServiceConfig
}

func NewService(identity *db.IdentityStore, apiKeys *db.APIKeyStore, groups *db.GroupStore, cfg ServiceConfig) *Service {
	return &Service{
		identity: identity,
		apiKeys:  apiKeys,
		groups:   groups,
		config:   cfg,
	}
}

func (s *Service) Login(ctx context.Context, email string, password string) (*LoginResult, error) {
	if s == nil || s.identity == nil {
		return nil, bkerr.Unavailable("auth not configured", nil)
	}
	if strings.TrimSpace(email) == "" || password == "" {
		return nil, bkerr.InvalidInput("email and password are required", nil)
	}

	user, err := s.identity.AuthenticateUser(ctx, email, password)
	if err != nil {
		return nil, bkerr.Unauthorized("invalid credentials", err)
	}

	authSession, token, err := s.identity.CreateLoginSession(ctx, user.ID, 24*time.Hour, map[string]any{
		"source": "api_login",
	})
	if err != nil {
		return nil, bkerr.Internal("failed to create auth session", err)
	}

	roles, err := s.identity.ListUserRoles(ctx, user.ID)
	if err != nil {
		return nil, bkerr.Internal("failed to load user roles", err)
	}

	result := &LoginResult{
		Token:     token,
		ExpiresAt: authSession.ExpiresAt,
		User: User{
			ID:          user.ID,
			Email:       user.Email,
			DisplayName: user.DisplayName,
			Status:      user.Status,
		},
		Roles: make([]string, 0, len(roles)),
	}
	for _, role := range roles {
		result.Roles = append(result.Roles, role.Name)
	}
	return result, nil
}

func (s *Service) ResolvePrincipal(ctx context.Context, token string) (*Principal, error) {
	if s == nil || s.identity == nil {
		return nil, bkerr.Unavailable("auth not configured", nil)
	}
	if strings.TrimSpace(token) == "" {
		return nil, bkerr.Unauthorized("missing bearer token", nil)
	}

	principal, err := s.identity.ResolvePrincipalFromToken(ctx, token)
	if err != nil {
		return nil, bkerr.Unauthorized("invalid auth token", err)
	}
	if err := s.identity.TouchAuthSession(ctx, principal.AuthSession.ID); err != nil {
		return nil, bkerr.Internal("failed to update auth session", err)
	}

	return PrincipalFromDB(principal), nil
}

func (s *Service) Register(ctx context.Context, email, password, displayName string) (*LoginResult, error) {
	if s == nil || s.identity == nil {
		return nil, bkerr.Unavailable("auth not configured", nil)
	}
	email = strings.TrimSpace(strings.ToLower(email))
	if email == "" || password == "" {
		return nil, bkerr.InvalidInput("email and password are required", nil)
	}
	if len(password) < 8 {
		return nil, bkerr.InvalidInput("password must be at least 8 characters", nil)
	}
	if strings.TrimSpace(displayName) == "" {
		displayName = email
	}

	// If signup is disabled, still allow if no users exist (first admin setup)
	if !s.config.EnableSignup {
		count, err := s.identity.CountUsers(ctx)
		if err != nil {
			return nil, bkerr.Internal("failed to check user count", err)
		}
		if count > 0 {
			return nil, bkerr.Forbidden("signup is disabled", nil)
		}
	}

	hash, err := db.HashPassword(password)
	if err != nil {
		return nil, bkerr.Internal("failed to hash password", err)
	}

	user, err := s.identity.CreateUser(ctx, db.CreateUserParams{
		Email:        email,
		DisplayName:  displayName,
		PasswordHash: hash,
		Status:       db.UserStatusActive,
	})
	if err != nil {
		return nil, bkerr.InvalidInput("email already registered or invalid", err)
	}

	// First user becomes admin
	count, err := s.identity.CountUsers(ctx)
	if err != nil {
		return nil, bkerr.Internal("failed to check user count", err)
	}

	role := s.config.DefaultUserRole
	if role == "" {
		role = "member"
	}
	if count == 1 {
		// This is the first user
		role = "admin"
	}

	if err := s.identity.AssignRoleToUser(ctx, user.ID, role); err != nil {
		return nil, bkerr.Internal("failed to assign role", err)
	}

	return s.Login(ctx, email, password)
}

func (s *Service) Logout(ctx context.Context, principal *Principal) error {
	if s == nil || s.identity == nil {
		return bkerr.Unavailable("auth not configured", nil)
	}
	if err := EnsureAuthenticated(principal); err != nil {
		return err
	}
	if err := s.identity.RevokeAuthSession(ctx, principal.AuthSession.ID); err != nil {
		return bkerr.Internal("failed to revoke auth session", err)
	}
	return nil
}

func (s *Service) DeleteOwnAccount(ctx context.Context, principal *Principal, params DeleteOwnAccountParams) error {
	if s == nil || s.identity == nil {
		return bkerr.Unavailable("auth not configured", nil)
	}
	if err := EnsureAuthenticated(principal); err != nil {
		return err
	}
	if strings.TrimSpace(principal.AuthSession.ID) == "" {
		return bkerr.Forbidden("account deletion requires a signed-in user session", nil)
	}
	if !strings.EqualFold(strings.TrimSpace(params.ConfirmEmail), strings.TrimSpace(principal.User.Email)) {
		return bkerr.InvalidInput("confirm_email must match your account email", nil)
	}
	if principal.HasRole("admin") {
		_, total, err := s.identity.ListUsersPaginated(ctx, db.ListUsersParams{
			RoleFilter: "admin",
			Page:       1,
			PerPage:    2,
		})
		if err != nil {
			return bkerr.Internal("failed to validate admin deletion safety", err)
		}
		if total <= 1 {
			return bkerr.Forbidden("cannot delete the last admin account", nil)
		}
	}

	status := db.UserStatusDisabled
	if _, err := s.identity.UpdateUser(ctx, db.UpdateUserParams{
		ID:     principal.User.ID,
		Status: &status,
	}); err != nil {
		return bkerr.Internal("failed to disable account", err)
	}
	if s.apiKeys != nil {
		if err := s.apiKeys.RevokeAllForUser(ctx, principal.User.ID); err != nil {
			return bkerr.Internal("failed to revoke api keys", err)
		}
	}
	if err := s.identity.RevokeAuthSessionsForUser(ctx, principal.User.ID); err != nil {
		return bkerr.Internal("failed to revoke sessions", err)
	}
	return nil
}

// ─── User query methods ───────────────────────────────────────────────────────

// GetUserByID returns a user by their ID.
func (s *Service) GetUserByID(ctx context.Context, userID string) (*db.User, error) {
	if s == nil || s.identity == nil {
		return nil, bkerr.Unavailable("auth not configured", nil)
	}
	user, err := s.identity.GetUserByID(ctx, userID)
	if err != nil {
		return nil, bkerr.NotFound("user not found", err)
	}
	return user, nil
}

// ListUsersPaginated returns a paginated list of users.
func (s *Service) ListUsersPaginated(ctx context.Context, params db.ListUsersParams) ([]db.User, int64, error) {
	if s == nil || s.identity == nil {
		return nil, 0, bkerr.Unavailable("auth not configured", nil)
	}
	users, total, err := s.identity.ListUsersPaginated(ctx, params)
	if err != nil {
		return nil, 0, bkerr.Internal("failed to list users", err)
	}
	return users, total, nil
}

// ─── API Key methods ──────────────────────────────────────────────────────────

// CreateAPIKey creates a new API key for the given user.
func (s *Service) CreateAPIKey(ctx context.Context, userID, name string, expiresAt *time.Time) (*db.APIKey, error) {
	if s == nil || s.apiKeys == nil {
		return nil, bkerr.Unavailable("api keys not configured", nil)
	}
	if !s.config.EnableAPIKeys {
		return nil, bkerr.Forbidden("api keys are disabled", nil)
	}
	key, err := s.apiKeys.CreateAPIKey(ctx, userID, name, expiresAt)
	if err != nil {
		return nil, bkerr.Internal("failed to create api key", err)
	}
	return key, nil
}

// ListAPIKeys returns all API keys for a user (masked).
func (s *Service) ListAPIKeys(ctx context.Context, userID string) ([]db.APIKey, error) {
	if s == nil || s.apiKeys == nil {
		return nil, bkerr.Unavailable("api keys not configured", nil)
	}
	keys, err := s.apiKeys.ListAPIKeysForUser(ctx, userID)
	if err != nil {
		return nil, bkerr.Internal("failed to list api keys", err)
	}
	return keys, nil
}

// RevokeAPIKey removes an API key.
func (s *Service) RevokeAPIKey(ctx context.Context, keyID, userID string) error {
	if s == nil || s.apiKeys == nil {
		return bkerr.Unavailable("api keys not configured", nil)
	}
	if err := s.apiKeys.RevokeAPIKey(ctx, keyID, userID); err != nil {
		return bkerr.NotFound("api key not found", err)
	}
	return nil
}

// ResolveAPIKeyPrincipal resolves a Principal from an API key token (sk- prefix).
func (s *Service) ResolveAPIKeyPrincipal(ctx context.Context, key string) (*Principal, error) {
	if s == nil || s.apiKeys == nil {
		return nil, bkerr.Unavailable("api keys not configured", nil)
	}
	if !s.config.EnableAPIKeys {
		return nil, bkerr.Forbidden("api keys are disabled", nil)
	}

	user, err := s.apiKeys.GetUserByAPIKey(ctx, key)
	if err != nil {
		return nil, bkerr.Unauthorized("invalid api key", err)
	}
	if user.Status != db.UserStatusActive {
		return nil, bkerr.Unauthorized("user is not active", nil)
	}

	roles, err := s.identity.ListUserRoles(ctx, user.ID)
	if err != nil {
		return nil, bkerr.Internal("failed to load user roles", err)
	}

	memberships, err := s.identity.ListUserWorkspaceMemberships(ctx, user.ID)
	if err != nil {
		return nil, bkerr.Internal("failed to load workspace memberships", err)
	}

	// Touch API key asynchronously
	go func() {
		apiKeyRow, err := s.apiKeys.GetAPIKeyByKey(context.Background(), key)
		if err == nil {
			_ = s.apiKeys.TouchAPIKey(context.Background(), apiKeyRow.ID)
		}
	}()

	principal := PrincipalFromDB(&db.AuthPrincipal{
		User:                 user,
		AuthSession:          &db.AuthSession{}, // zero-value marker — no session for API key auth
		Roles:                roles,
		WorkspaceMemberships: memberships,
	})
	return principal, nil
}

// ─── Profile / Settings methods ───────────────────────────────────────────────

// UpdateUserProfile updates a user's profile fields.
func (s *Service) UpdateUserProfile(ctx context.Context, userID string, params ProfileUpdateParams) (*db.User, error) {
	if s == nil || s.identity == nil {
		return nil, bkerr.Unavailable("auth not configured", nil)
	}
	updated, err := s.identity.UpdateUserProfile(ctx, db.UpdateUserProfileParams{
		ID:          userID,
		DisplayName: params.DisplayName,
		Username:    params.Username,
		Bio:         params.Bio,
		AvatarURL:   params.AvatarURL,
	})
	if err != nil {
		return nil, bkerr.InvalidInput("failed to update profile", err)
	}
	return updated, nil
}

// UpdateUserSettings merges settings into a user's settings JSON.
func (s *Service) UpdateUserSettings(ctx context.Context, userID string, settings map[string]any) (*db.User, error) {
	if s == nil || s.identity == nil {
		return nil, bkerr.Unavailable("auth not configured", nil)
	}
	updated, err := s.identity.UpdateUserSettings(ctx, userID, settings)
	if err != nil {
		return nil, bkerr.Internal("failed to update settings", err)
	}
	return updated, nil
}

// GetEffectivePermissions returns the union of all group permissions for a user.
func (s *Service) GetEffectivePermissions(ctx context.Context, userID string) (db.GroupPermissions, error) {
	if s == nil || s.groups == nil {
		return db.DefaultGroupPermissions(), nil
	}
	perms, err := s.groups.GetEffectivePermissions(ctx, userID, db.DefaultGroupPermissions())
	if err != nil {
		return db.DefaultGroupPermissions(), bkerr.Internal("failed to get permissions", err)
	}
	return perms, nil
}
