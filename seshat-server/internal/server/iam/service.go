package iam

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"

	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/apperr"
	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
)

// Principal is the authenticated server-side identity resolved from a session.
type Principal struct {
	User        User         `json:"user"`
	Memberships []Membership `json:"memberships"`
	Session     Session      `json:"session"`
}

type User struct {
	ID          string    `json:"id"`
	Email       string    `json:"email"`
	DisplayName string    `json:"display_name"`
	IsAdmin     bool      `json:"is_admin"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type Organization struct {
	ID           string    `json:"id"`
	Name         string    `json:"name"`
	Slug         string    `json:"slug"`
	Description  string    `json:"description"`
	WebsiteURL   string    `json:"website_url"`
	SupportEmail string    `json:"support_email"`
	IsDefault    bool      `json:"is_default"`
	IsActive     bool      `json:"is_active"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

type Membership struct {
	ID              string    `json:"id"`
	UserID          string    `json:"user_id"`
	OrganizationID  string    `json:"organization_id"`
	Role            string    `json:"role"`
	CreatedAt       time.Time `json:"created_at"`
	UserEmail       string    `json:"user_email,omitempty"`
	UserDisplayName string    `json:"user_display_name,omitempty"`
	UserIsAdmin     bool      `json:"user_is_admin,omitempty"`
}

type Session struct {
	ID        string    `json:"id"`
	Token     string    `json:"token,omitempty"`
	UserID    string    `json:"user_id"`
	CreatedAt time.Time `json:"created_at"`
	ExpiresAt time.Time `json:"expires_at"`
}

// Application models a client application managed by the control plane.
type Application struct {
	ID                     string            `json:"id"`
	OrganizationID         string            `json:"organization_id"`
	Name                   string            `json:"name"`
	Slug                   string            `json:"slug"`
	DisplayName            string            `json:"display_name"`
	Description            string            `json:"description"`
	Protocol               string            `json:"protocol"`
	Enabled                bool              `json:"enabled"`
	HomepageURL            string            `json:"homepage_url"`
	CallbackURL            string            `json:"callback_url"`
	RedirectURLs           []string          `json:"redirect_urls"`
	PostLogoutRedirectURLs []string          `json:"post_logout_redirect_urls"`
	AllowedOrigins         []string          `json:"allowed_origins"`
	GrantTypes             []string          `json:"grant_types"`
	ResponseTypes          []string          `json:"response_types"`
	Scopes                 []string          `json:"scopes"`
	ClientID               string            `json:"client_id"`
	ClientSecret           string            `json:"client_secret"`
	ProviderIDs            []string          `json:"provider_ids"`
	SigninURL              string            `json:"signin_url"`
	SignupURL              string            `json:"signup_url"`
	AllowSignup            bool              `json:"allow_signup"`
	AllowPasswordLogin     bool              `json:"allow_password_login"`
	PKCERequired           bool              `json:"pkce_required"`
	SkipConsent            bool              `json:"skip_consent"`
	IssueRefreshToken      bool              `json:"issue_refresh_token"`
	Configuration          map[string]string `json:"configuration"`
	CreatedAt              time.Time         `json:"created_at"`
	UpdatedAt              time.Time         `json:"updated_at"`
}

// Provider models an upstream identity provider configuration.
type Provider struct {
	ID               string            `json:"id"`
	OrganizationID   string            `json:"organization_id"`
	Name             string            `json:"name"`
	Slug             string            `json:"slug"`
	Kind             string            `json:"kind"`
	Enabled          bool              `json:"enabled"`
	ClientID         string            `json:"client_id"`
	ClientSecret     string            `json:"client_secret"`
	IssuerURL        string            `json:"issuer_url"`
	DiscoveryURL     string            `json:"discovery_url"`
	AuthorizationURL string            `json:"authorization_url"`
	TokenURL         string            `json:"token_url"`
	UserInfoURL      string            `json:"userinfo_url"`
	JWKSURL          string            `json:"jwks_url"`
	LogoutURL        string            `json:"logout_url"`
	MetadataURL      string            `json:"metadata_url"`
	EntityID         string            `json:"entity_id"`
	SSOURL           string            `json:"sso_url"`
	X509Certificate  string            `json:"x509_certificate"`
	Scopes           []string          `json:"scopes"`
	AllowedDomains   []string          `json:"allowed_domains"`
	ClaimMappings    map[string]string `json:"claim_mappings"`
	AllowAutoLink    bool              `json:"allow_auto_link"`
	AllowSignup      bool              `json:"allow_signup"`
	PKCERequired     bool              `json:"pkce_required"`
	Configuration    map[string]string `json:"configuration"`
	CreatedAt        time.Time         `json:"created_at"`
	UpdatedAt        time.Time         `json:"updated_at"`
}

type BootstrapParams struct {
	Email            string
	Password         string
	DisplayName      string
	OrganizationName string
	OrganizationSlug string
}

type CreateOrganizationParams struct {
	Name         string `json:"name"`
	Slug         string `json:"slug"`
	Description  string `json:"description"`
	WebsiteURL   string `json:"website_url"`
	SupportEmail string `json:"support_email"`
}

type CreateUserParams struct {
	Email          string `json:"email"`
	Password       string `json:"password"`
	DisplayName    string `json:"display_name"`
	OrganizationID string `json:"organization_id"`
	Role           string `json:"role"`
	IsAdmin        bool   `json:"is_admin"`
}

type CreateApplicationParams struct {
	OrganizationID         string            `json:"organization_id"`
	Name                   string            `json:"name"`
	Slug                   string            `json:"slug"`
	DisplayName            string            `json:"display_name"`
	Description            string            `json:"description"`
	Protocol               string            `json:"protocol"`
	Enabled                *bool             `json:"enabled"`
	HomepageURL            string            `json:"homepage_url"`
	CallbackURL            string            `json:"callback_url"`
	RedirectURLs           []string          `json:"redirect_urls"`
	PostLogoutRedirectURLs []string          `json:"post_logout_redirect_urls"`
	AllowedOrigins         []string          `json:"allowed_origins"`
	GrantTypes             []string          `json:"grant_types"`
	ResponseTypes          []string          `json:"response_types"`
	Scopes                 []string          `json:"scopes"`
	ProviderIDs            []string          `json:"provider_ids"`
	SigninURL              string            `json:"signin_url"`
	SignupURL              string            `json:"signup_url"`
	AllowSignup            bool              `json:"allow_signup"`
	AllowPasswordLogin     bool              `json:"allow_password_login"`
	PKCERequired           bool              `json:"pkce_required"`
	SkipConsent            bool              `json:"skip_consent"`
	IssueRefreshToken      bool              `json:"issue_refresh_token"`
	Configuration          map[string]string `json:"configuration"`
}

type CreateProviderParams struct {
	OrganizationID   string            `json:"organization_id"`
	Name             string            `json:"name"`
	Slug             string            `json:"slug"`
	Kind             string            `json:"kind"`
	Enabled          *bool             `json:"enabled"`
	ClientID         string            `json:"client_id"`
	ClientSecret     string            `json:"client_secret"`
	IssuerURL        string            `json:"issuer_url"`
	DiscoveryURL     string            `json:"discovery_url"`
	AuthorizationURL string            `json:"authorization_url"`
	TokenURL         string            `json:"token_url"`
	UserInfoURL      string            `json:"userinfo_url"`
	JWKSURL          string            `json:"jwks_url"`
	LogoutURL        string            `json:"logout_url"`
	MetadataURL      string            `json:"metadata_url"`
	EntityID         string            `json:"entity_id"`
	SSOURL           string            `json:"sso_url"`
	X509Certificate  string            `json:"x509_certificate"`
	Scopes           []string          `json:"scopes"`
	AllowedDomains   []string          `json:"allowed_domains"`
	ClaimMappings    map[string]string `json:"claim_mappings"`
	AllowAutoLink    bool              `json:"allow_auto_link"`
	AllowSignup      bool              `json:"allow_signup"`
	PKCERequired     bool              `json:"pkce_required"`
	Configuration    map[string]string `json:"configuration"`
}

type AuthResult struct {
	Token         string         `json:"token"`
	User          User           `json:"user"`
	Organizations []Organization `json:"organizations"`
	Memberships   []Membership   `json:"memberships"`
}

// Service owns the server IAM and control-plane operations, backed by a real
// SQL database (see internal/server/db) rather than an in-memory snapshot.
type Service struct {
	db         *sdb.DB
	sessionTTL time.Duration
}

func New(database *sdb.DB, sessionTTL time.Duration) *Service {
	return &Service{db: database, sessionTTL: sessionTTL}
}

func (s *Service) BootstrapStatus(ctx context.Context) (bool, error) {
	var count int64
	if err := s.db.Gorm().WithContext(ctx).Model(&sdb.User{}).Count(&count).Error; err != nil {
		return false, err
	}
	return count > 0, nil
}

func (s *Service) Bootstrap(ctx context.Context, params BootstrapParams) (*AuthResult, error) {
	if err := validateBootstrapParams(params); err != nil {
		return nil, err
	}

	var result *AuthResult
	err := s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		var count int64
		if err := tx.Model(&sdb.User{}).Count(&count).Error; err != nil {
			return err
		}
		if count > 0 {
			return ErrConflict("server already initialized")
		}
		now := time.Now().UTC()
		passwordHash, err := hashPassword(params.Password)
		if err != nil {
			return fmt.Errorf("hash password: %w", err)
		}

		orgID, err := newID("org")
		if err != nil {
			return err
		}
		org := sdb.Organization{
			ID:        orgID,
			Name:      strings.TrimSpace(params.OrganizationName),
			Slug:      normalizeSlug(params.OrganizationSlug),
			CreatedAt: now,
			UpdatedAt: now,
		}
		if err := tx.Create(&org).Error; err != nil {
			return err
		}
		userID, err := newID("usr")
		if err != nil {
			return err
		}
		user := sdb.User{
			ID:           userID,
			Email:        normalizeEmail(params.Email),
			DisplayName:  strings.TrimSpace(params.DisplayName),
			PasswordHash: passwordHash,
			IsAdmin:      true,
			CreatedAt:    now,
			UpdatedAt:    now,
		}
		if err := tx.Create(&user).Error; err != nil {
			return err
		}
		membershipID, err := newID("mem")
		if err != nil {
			return err
		}
		membership := sdb.Membership{
			ID:             membershipID,
			UserID:         user.ID,
			OrganizationID: org.ID,
			Role:           "owner",
			CreatedAt:      now,
		}
		if err := tx.Create(&membership).Error; err != nil {
			return err
		}
		session, rawToken, err := s.newSession(user.ID, now)
		if err != nil {
			return err
		}
		if err := tx.Create(&session).Error; err != nil {
			return err
		}
		if err := appendAuditEvent(tx, nil, org.ID, "organization.bootstrap", "organization", org.ID, map[string]string{"slug": org.Slug}); err != nil {
			return err
		}

		result = &AuthResult{
			Token:         rawToken,
			User:          toUser(user),
			Organizations: []Organization{toOrganization(org)},
			Memberships:   []Membership{toMembership(membership)},
		}
		return nil
	})
	return result, err
}

func (s *Service) Login(ctx context.Context, email, password string) (*AuthResult, error) {
	email = normalizeEmail(email)
	password = strings.TrimSpace(password)
	if email == "" || password == "" {
		return nil, ErrInvalidInput("email and password are required")
	}

	// loginErr is returned separately from the store transaction itself:
	// GORM only commits when the callback returns nil, so a failed-login
	// audit event has to be recorded via a nil return, with the actual auth
	// failure reported to the caller afterwards.
	var result *AuthResult
	var loginErr error
	err := s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		userRecord, ok, err := findUserByEmail(tx, email)
		if err != nil {
			return err
		}
		if !ok {
			if err := appendAuditEvent(tx, nil, "", "login.failed", "user", "", map[string]string{"email": email}); err != nil {
				return err
			}
			loginErr = ErrUnauthorized("invalid email or password")
			return nil
		}
		if err := bcrypt.CompareHashAndPassword([]byte(userRecord.PasswordHash), []byte(password)); err != nil {
			orgID, oerr := primaryOrganizationIDForUser(tx, userRecord.ID)
			if oerr != nil {
				return oerr
			}
			if err := appendAuditEvent(tx, nil, orgID, "login.failed", "user", userRecord.ID, map[string]string{"email": email}); err != nil {
				return err
			}
			loginErr = ErrUnauthorized("invalid email or password")
			return nil
		}
		now := time.Now().UTC()
		session, rawToken, err := s.newSession(userRecord.ID, now)
		if err != nil {
			return err
		}
		if err := tx.Create(&session).Error; err != nil {
			return err
		}

		memberships, err := membershipsByUser(tx, userRecord.ID)
		if err != nil {
			return err
		}
		orgs, err := organizationsForMemberships(tx, memberships)
		if err != nil {
			return err
		}
		orgID, err := primaryOrganizationIDForUser(tx, userRecord.ID)
		if err != nil {
			return err
		}
		if err := appendAuditEvent(tx, &Principal{User: toUser(userRecord)}, orgID, "login.succeeded", "user", userRecord.ID, map[string]string{"email": email}); err != nil {
			return err
		}
		result = &AuthResult{
			Token:         rawToken,
			User:          toUser(userRecord),
			Organizations: orgs,
			Memberships:   memberships,
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	if loginErr != nil {
		return nil, loginErr
	}
	return result, nil
}

// Logout revokes the session that authenticated the current request, so a
// caller can end their own session without needing admin session-management
// permissions.
func (s *Service) Logout(ctx context.Context, principal *Principal) error {
	if principal == nil {
		return ErrUnauthorized("authentication required")
	}
	return s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		result := tx.Where("id = ?", principal.Session.ID).Delete(&sdb.Session{})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected == 0 {
			return ErrNotFound("session not found")
		}
		orgID, err := primaryOrganizationIDForUser(tx, principal.User.ID)
		if err != nil {
			return err
		}
		return appendAuditEvent(tx, principal, orgID, "session.logout", "session", principal.Session.ID, map[string]string{"user_id": principal.User.ID})
	})
}

func (s *Service) ResolvePrincipal(ctx context.Context, token string) (*Principal, error) {
	token = strings.TrimSpace(token)
	if token == "" {
		return nil, ErrUnauthorized("missing bearer token")
	}

	hashedToken := sdb.HashOpaqueToken(token)
	var principal *Principal
	err := s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		var session sdb.Session
		if err := tx.Where("token = ?", hashedToken).First(&session).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrUnauthorized("invalid session token")
			}
			return err
		}
		if session.ExpiresAt.Before(time.Now().UTC()) {
			if err := tx.Where("id = ?", session.ID).Delete(&sdb.Session{}).Error; err != nil {
				return err
			}
			return ErrUnauthorized("session expired")
		}
		var user sdb.User
		if err := tx.First(&user, "id = ?", session.UserID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				_ = tx.Where("id = ?", session.ID).Delete(&sdb.Session{}).Error
				return ErrUnauthorized("session user not found")
			}
			return err
		}
		memberships, err := membershipsByUser(tx, user.ID)
		if err != nil {
			return err
		}
		principal = &Principal{
			User:        toUser(user),
			Memberships: memberships,
			Session:     toSession(session),
		}
		return nil
	})
	return principal, err
}

var organizationSortFields = map[string]sdb.SortField{
	"name":       {Column: "name"},
	"slug":       {Column: "slug"},
	"created_at": {Column: "created_at"},
	"updated_at": {Column: "updated_at"},
}

var organizationSearchColumns = []string{"id", "name", "slug", "description", "website_url", "support_email"}

// ListOrganizations returns a page of organizations visible to the caller,
// with search/sort/pagination applied in SQL.
func (s *Service) ListOrganizations(ctx context.Context, principal *Principal, params sdb.ListParams) ([]Organization, int64, error) {
	if principal == nil {
		return nil, 0, ErrUnauthorized("authentication required")
	}

	tx := s.db.Gorm().WithContext(ctx)
	query := tx.Model(&sdb.Organization{})
	if !principal.User.IsAdmin {
		var orgIDs []string
		if err := tx.Model(&sdb.Membership{}).Where("user_id = ?", principal.User.ID).Pluck("organization_id", &orgIDs).Error; err != nil {
			return nil, 0, err
		}
		if len(orgIDs) == 0 {
			return []Organization{}, 0, nil
		}
		query = query.Where("id IN ?", orgIDs)
	}

	sortField, err := sdb.ResolveSortField(organizationSortFields, params.Sort)
	if err != nil {
		return nil, 0, ErrInvalidInput(err.Error())
	}
	query = sdb.ApplySearch(query, params.Search, organizationSearchColumns...)
	query = sdb.ApplySort(query, sortField, params.Order)

	records, total, err := sdb.Page[sdb.Organization](query, params.Limit, params.Offset)
	if err != nil {
		return nil, 0, err
	}
	organizations := make([]Organization, 0, len(records))
	for _, record := range records {
		organizations = append(organizations, toOrganization(record))
	}
	return organizations, total, nil
}

// CreateOrganization is self-serve: any authenticated user may create an
// organization and becomes its owner.
// CreateOrganization is self-serve: any authenticated non-admin user
// becomes the owner of the organization they create, so they can actually
// manage what they just made. A platform admin (superadmin) creating an
// organization is a different action — provisioning one on behalf of a
// customer, not founding their own — so no owner membership is attached for
// them: IsAdmin already grants full access to every organization regardless
// of membership (see hasOrganizationPermission), and forcing membership
// here would make every org a platform admin ever creates show up as
// something they "belong to", which is exactly what the superadmin model
// is meant to avoid. An admin who does want to join a specific org they
// created can do so afterward via CreateMembership, same as adding anyone
// else.
func (s *Service) CreateOrganization(ctx context.Context, principal *Principal, params CreateOrganizationParams) (*Organization, error) {
	if principal == nil {
		return nil, ErrUnauthorized("authentication required")
	}
	name := strings.TrimSpace(params.Name)
	slug := normalizeSlug(params.Slug)
	description := strings.TrimSpace(params.Description)
	websiteURL := strings.TrimSpace(params.WebsiteURL)
	supportEmail := normalizeEmail(params.SupportEmail)
	if name == "" || slug == "" {
		return nil, ErrInvalidInput("name and slug are required")
	}

	var organization *Organization
	err := s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		var existing int64
		if err := tx.Model(&sdb.Organization{}).Where("slug = ?", slug).Count(&existing).Error; err != nil {
			return err
		}
		if existing > 0 {
			return ErrConflict("organization slug already exists")
		}

		now := time.Now().UTC()
		organizationIDValue, err := newID("org")
		if err != nil {
			return err
		}
		record := sdb.Organization{ID: organizationIDValue, Name: name, Slug: slug, Description: description, WebsiteURL: websiteURL, SupportEmail: supportEmail, CreatedAt: now, UpdatedAt: now}
		if err := tx.Create(&record).Error; err != nil {
			if isUniqueConstraintError(err) {
				return ErrConflict("organization slug already exists")
			}
			return err
		}
		if err := appendAuditEvent(tx, principal, record.ID, "organization.created", "organization", record.ID, map[string]string{"slug": record.Slug}); err != nil {
			return err
		}

		if !principal.User.IsAdmin {
			membershipID, err := newID("mem")
			if err != nil {
				return err
			}
			membership := sdb.Membership{ID: membershipID, UserID: principal.User.ID, OrganizationID: record.ID, Role: "owner", CreatedAt: now}
			if err := tx.Create(&membership).Error; err != nil {
				return err
			}
			if err := appendAuditEvent(tx, principal, record.ID, "membership.created", "membership", membership.ID, map[string]string{"role": membership.Role, "user_id": membership.UserID}); err != nil {
				return err
			}
		}

		org := toOrganization(record)
		organization = &org
		return nil
	})
	return organization, err
}

var userSortFields = map[string]sdb.SortField{
	"email":        {Column: "email"},
	"display_name": {Column: "display_name"},
	"created_at":   {Column: "created_at"},
	"updated_at":   {Column: "updated_at"},
}

var userSearchColumns = []string{"id", "email", "display_name"}

func (s *Service) ListUsers(ctx context.Context, principal *Principal, params sdb.ListParams) ([]User, int64, error) {
	if principal == nil {
		return nil, 0, ErrUnauthorized("authentication required")
	}
	if err := requireAdmin(principal); err != nil {
		return nil, 0, err
	}
	sortField, err := sdb.ResolveSortField(userSortFields, params.Sort)
	if err != nil {
		return nil, 0, ErrInvalidInput(err.Error())
	}
	query := sdb.ApplySearch(s.db.Gorm().WithContext(ctx).Model(&sdb.User{}), params.Search, userSearchColumns...)
	query = sdb.ApplySort(query, sortField, params.Order)

	records, total, err := sdb.Page[sdb.User](query, params.Limit, params.Offset)
	if err != nil {
		return nil, 0, err
	}
	users := make([]User, 0, len(records))
	for _, record := range records {
		users = append(users, toUser(record))
	}
	return users, total, nil
}

func (s *Service) CreateUser(ctx context.Context, principal *Principal, params CreateUserParams) (*User, error) {
	if principal == nil {
		return nil, ErrUnauthorized("authentication required")
	}
	if err := requireAdmin(principal); err != nil {
		return nil, err
	}
	email := normalizeEmail(params.Email)
	password := strings.TrimSpace(params.Password)
	displayName := strings.TrimSpace(params.DisplayName)
	role := strings.TrimSpace(params.Role)
	if email == "" || password == "" || displayName == "" {
		return nil, ErrInvalidInput("email, password and display_name are required")
	}
	if role == "" {
		role = "member"
	}
	if params.OrganizationID == "" {
		validatedRole, err := canonicalRoleCode(role)
		if err != nil {
			return nil, err
		}
		role = validatedRole
	}

	var user *User
	err := s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		if _, ok, ferr := findUserByEmail(tx, email); ferr != nil {
			return ferr
		} else if ok {
			return ErrConflict("user email already exists")
		}
		if params.OrganizationID != "" {
			var count int64
			if err := tx.Model(&sdb.Organization{}).Where("id = ?", params.OrganizationID).Count(&count).Error; err != nil {
				return err
			}
			if count == 0 {
				return ErrNotFound("organization not found")
			}
			validatedRole, err := validateRoleCodeForOrganization(tx, params.OrganizationID, role)
			if err != nil {
				return err
			}
			role = validatedRole
		}
		now := time.Now().UTC()
		passwordHash, err := hashPassword(password)
		if err != nil {
			return fmt.Errorf("hash password: %w", err)
		}
		userID, err := newID("usr")
		if err != nil {
			return err
		}
		record := sdb.User{
			ID:           userID,
			Email:        email,
			DisplayName:  displayName,
			PasswordHash: passwordHash,
			IsAdmin:      params.IsAdmin,
			CreatedAt:    now,
			UpdatedAt:    now,
		}
		if err := tx.Create(&record).Error; err != nil {
			if isUniqueConstraintError(err) {
				return ErrConflict("user email already exists")
			}
			return err
		}
		if params.OrganizationID != "" {
			membershipID, err := newID("mem")
			if err != nil {
				return err
			}
			membership := sdb.Membership{
				ID:             membershipID,
				UserID:         record.ID,
				OrganizationID: params.OrganizationID,
				Role:           role,
				CreatedAt:      now,
			}
			if err := tx.Create(&membership).Error; err != nil {
				return err
			}
			if err := appendAuditEvent(tx, principal, membership.OrganizationID, "membership.created_via_user", "membership", membership.ID, map[string]string{"role": membership.Role, "user_id": membership.UserID}); err != nil {
				return err
			}
		}
		if err := appendAuditEvent(tx, principal, params.OrganizationID, "user.created", "user", record.ID, map[string]string{"email": record.Email}); err != nil {
			return err
		}
		converted := toUser(record)
		user = &converted
		return nil
	})
	return user, err
}

func (s *Service) newSession(userID string, now time.Time) (sdb.Session, string, error) {
	rawToken, err := newToken()
	if err != nil {
		return sdb.Session{}, "", err
	}
	sessionID, err := newID("ses")
	if err != nil {
		return sdb.Session{}, "", err
	}
	return sdb.Session{
		Token:     sdb.HashOpaqueToken(rawToken),
		ID:        sessionID,
		UserID:    userID,
		CreatedAt: now,
		ExpiresAt: now.Add(s.sessionTTL),
	}, rawToken, nil
}

func validateBootstrapParams(params BootstrapParams) error {
	if normalizeEmail(params.Email) == "" || strings.TrimSpace(params.Password) == "" {
		return ErrInvalidInput("email and password are required")
	}
	if strings.TrimSpace(params.DisplayName) == "" {
		return ErrInvalidInput("display_name is required")
	}
	if strings.TrimSpace(params.OrganizationName) == "" {
		return ErrInvalidInput("organization_name is required")
	}
	if normalizeSlug(params.OrganizationSlug) == "" {
		return ErrInvalidInput("organization_slug is required")
	}
	return nil
}

func requireAdmin(principal *Principal) error {
	if principal == nil {
		return ErrUnauthorized("authentication required")
	}
	if !principal.User.IsAdmin {
		return ErrForbidden("admin privileges required")
	}
	return nil
}

// membershipsByUser loads every membership for one user, ordered the same
// way the old in-memory scan did (oldest first).
func membershipsByUser(tx *gorm.DB, userID string) ([]Membership, error) {
	var records []sdb.Membership
	if err := tx.Where("user_id = ?", userID).Order("created_at asc").Find(&records).Error; err != nil {
		return nil, err
	}
	memberships := make([]Membership, 0, len(records))
	for _, record := range records {
		memberships = append(memberships, toMembership(record))
	}
	return memberships, nil
}

func organizationsForMemberships(tx *gorm.DB, memberships []Membership) ([]Organization, error) {
	if len(memberships) == 0 {
		return []Organization{}, nil
	}
	ids := make([]string, 0, len(memberships))
	seen := make(map[string]struct{}, len(memberships))
	for _, membership := range memberships {
		if _, ok := seen[membership.OrganizationID]; ok {
			continue
		}
		seen[membership.OrganizationID] = struct{}{}
		ids = append(ids, membership.OrganizationID)
	}
	var records []sdb.Organization
	if err := tx.Where("id IN ?", ids).Order("name asc").Find(&records).Error; err != nil {
		return nil, err
	}
	orgs := make([]Organization, 0, len(records))
	for _, record := range records {
		orgs = append(orgs, toOrganization(record))
	}
	return orgs, nil
}

func findUserByEmail(tx *gorm.DB, email string) (sdb.User, bool, error) {
	var user sdb.User
	err := tx.Where("email = ?", normalizeEmail(email)).First(&user).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return sdb.User{}, false, nil
		}
		return sdb.User{}, false, err
	}
	return user, true, nil
}

// primaryOrganizationIDForUser picks one organization to attribute an audit
// event to when the event isn't itself organization-scoped (e.g. logins).
func primaryOrganizationIDForUser(tx *gorm.DB, userID string) (string, error) {
	var membership sdb.Membership
	err := tx.Where("user_id = ?", userID).Order("created_at asc").First(&membership).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return "", nil
		}
		return "", err
	}
	return membership.OrganizationID, nil
}

func toUser(record sdb.User) User {
	return User{ID: record.ID, Email: record.Email, DisplayName: record.DisplayName, IsAdmin: record.IsAdmin, CreatedAt: record.CreatedAt, UpdatedAt: record.UpdatedAt}
}

func toOrganization(record sdb.Organization) Organization {
	return Organization{
		ID:           record.ID,
		Name:         record.Name,
		Slug:         record.Slug,
		Description:  record.Description,
		WebsiteURL:   record.WebsiteURL,
		SupportEmail: record.SupportEmail,
		IsDefault:    record.IsDefault,
		IsActive:     record.IsActive,
		CreatedAt:    record.CreatedAt,
		UpdatedAt:    record.UpdatedAt,
	}
}

func toMembership(record sdb.Membership) Membership {
	return Membership{ID: record.ID, UserID: record.UserID, OrganizationID: record.OrganizationID, Role: record.Role, CreatedAt: record.CreatedAt}
}

func toSession(record sdb.Session) Session {
	return Session{ID: record.ID, UserID: record.UserID, CreatedAt: record.CreatedAt, ExpiresAt: record.ExpiresAt}
}

func toApplication(record sdb.Application) Application {
	return Application{
		ID:                     record.ID,
		OrganizationID:         record.OrganizationID,
		Name:                   record.Name,
		Slug:                   record.Slug,
		DisplayName:            record.DisplayName,
		Description:            record.Description,
		Protocol:               record.Protocol,
		Enabled:                record.Enabled,
		HomepageURL:            record.HomepageURL,
		CallbackURL:            record.CallbackURL,
		RedirectURLs:           append([]string(nil), record.RedirectURLs...),
		PostLogoutRedirectURLs: append([]string(nil), record.PostLogoutRedirectURLs...),
		AllowedOrigins:         append([]string(nil), record.AllowedOrigins...),
		GrantTypes:             append([]string(nil), record.GrantTypes...),
		ResponseTypes:          append([]string(nil), record.ResponseTypes...),
		Scopes:                 append([]string(nil), record.Scopes...),
		ClientID:               record.ClientID,
		ClientSecret:           maskedStoredSecret(record.ClientSecret),
		ProviderIDs:            append([]string(nil), record.ProviderIDs...),
		SigninURL:              record.SigninURL,
		SignupURL:              record.SignupURL,
		AllowSignup:            record.AllowSignup,
		AllowPasswordLogin:     record.AllowPasswordLogin,
		PKCERequired:           record.PKCERequired,
		SkipConsent:            record.SkipConsent,
		IssueRefreshToken:      record.IssueRefreshToken,
		Configuration:          normalizeStringMap(record.Configuration),
		CreatedAt:              record.CreatedAt,
		UpdatedAt:              record.UpdatedAt,
	}
}

func toProvider(record sdb.Provider) Provider {
	return Provider{
		ID:               record.ID,
		OrganizationID:   record.OrganizationID,
		Name:             record.Name,
		Slug:             record.Slug,
		Kind:             record.Kind,
		Enabled:          record.Enabled,
		ClientID:         record.ClientID,
		ClientSecret:     maskedStoredSecret(record.ClientSecret),
		IssuerURL:        record.IssuerURL,
		DiscoveryURL:     record.DiscoveryURL,
		AuthorizationURL: record.AuthorizationURL,
		TokenURL:         record.TokenURL,
		UserInfoURL:      record.UserInfoURL,
		JWKSURL:          record.JWKSURL,
		LogoutURL:        record.LogoutURL,
		MetadataURL:      record.MetadataURL,
		EntityID:         record.EntityID,
		SSOURL:           record.SSOURL,
		X509Certificate:  record.X509Certificate,
		Scopes:           append([]string(nil), record.Scopes...),
		AllowedDomains:   append([]string(nil), record.AllowedDomains...),
		ClaimMappings:    normalizeStringMap(record.ClaimMappings),
		AllowAutoLink:    record.AllowAutoLink,
		AllowSignup:      record.AllowSignup,
		PKCERequired:     record.PKCERequired,
		Configuration:    normalizeStringMap(record.Configuration),
		CreatedAt:        record.CreatedAt,
		UpdatedAt:        record.UpdatedAt,
	}
}

func hashPassword(password string) (string, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}
	return string(hash), nil
}

func normalizeEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}

func normalizeSlug(slug string) string {
	slug = strings.ToLower(strings.TrimSpace(slug))
	slug = strings.ReplaceAll(slug, " ", "-")
	return slug
}

func maskedStoredSecret(secret string) string {
	const prefixLen = 6
	if secret == "" {
		return ""
	}
	if plaintext, err := sdb.DecryptSecret(secret); err == nil {
		secret = plaintext
	}
	if len(secret) <= prefixLen {
		return strings.Repeat("*", len(secret))
	}
	return secret[:prefixLen] + strings.Repeat("*", 8)
}

func newID(prefix string) (string, error) { return sdb.NewID(prefix) }

func newToken() (string, error) { return sdb.NewToken() }

// isUniqueConstraintError detects a unique-index violation across both
// supported drivers (sqlite and postgres) without importing driver-specific
// error types, so a genuine race on a pre-checked uniqueness rule still maps
// to a clean conflict instead of a raw 500.
func isUniqueConstraintError(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "unique") || strings.Contains(msg, "duplicate")
}

// Error is a re-export of the shared control-plane error shape (see
// internal/server/apperr), kept under this name so every existing call site
// in this package (ErrInvalidInput(...), etc.) and every errors.As(&typed)
// check in the API layer needs no changes.
type Error = apperr.Error

func ErrInvalidInput(message string) error { return apperr.InvalidInput(message) }
func ErrUnauthorized(message string) error { return apperr.Unauthorized(message) }
func ErrForbidden(message string) error    { return apperr.Forbidden(message) }
func ErrConflict(message string) error     { return apperr.Conflict(message) }
func ErrNotFound(message string) error     { return apperr.NotFound(message) }
