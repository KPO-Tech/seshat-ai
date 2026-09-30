package iam

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"net"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"

	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/apperr"
	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/mailer"
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
	ID                           string  `json:"id"`
	Name                         string  `json:"name"`
	Slug                         string  `json:"slug"`
	Description                  string  `json:"description"`
	WebsiteURL                   string  `json:"website_url"`
	SupportEmail                 string  `json:"support_email"`
	IsDefault                    bool    `json:"is_default"`
	IsActive                     bool    `json:"is_active"`
	ShareProviderSettings        bool    `json:"share_provider_settings"`
	ShareEmbedderSettings        bool    `json:"share_embedder_settings"`
	ShareWebSearchSettings       bool    `json:"share_web_search_settings"`
	ShareMCPServers              bool    `json:"share_mcp_servers"`
	ShareSkillRepos              bool    `json:"share_skill_repos"`
	ShareOrganizationPreferences bool    `json:"share_organization_preferences"`
	ShareConnectorApps           bool    `json:"share_connector_apps"`
	Domain                       *string `json:"domain,omitempty"`
	// DomainVerificationToken is the TXT record value to publish - only
	// meaningful (and only ever seen) by callers who can already read this
	// organization's own settings (organization.read/.manage), same trust
	// level as every other field here. Empty once Domain is verified or
	// unset - nothing left to prove.
	DomainVerificationToken *string    `json:"domain_verification_token,omitempty"`
	DomainVerifiedAt        *time.Time `json:"domain_verified_at,omitempty"`
	// MinAppVersion is a plain "major.minor.patch" string (see
	// compareAppVersions) enforced as a warning, not a block, at device
	// heartbeat - see automation.Heartbeat and db.Organization.MinAppVersion.
	MinAppVersion *string   `json:"min_app_version,omitempty"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

type Membership struct {
	ID             string     `json:"id"`
	UserID         string     `json:"user_id"`
	OrganizationID string     `json:"organization_id"`
	Role           string     `json:"role"`
	Status         string     `json:"status"`
	PendingSince   *time.Time `json:"pending_since,omitempty"`
	CreatedAt      time.Time  `json:"created_at"`
	// Permissions is the resolved effective permission set (role + custom
	// role + policy bindings + group membership - see
	// effectivePermissionsForPrincipal) for this specific membership's role
	// in this organization, at the time it was fetched. Populated wherever a
	// Membership reaches a client (login/register/bootstrap/auth-me) so the
	// frontend can gate UI on real permissions instead of hardcoding role
	// names, which would silently miss custom roles.
	Permissions     []string `json:"permissions"`
	UserEmail       string   `json:"user_email,omitempty"`
	UserDisplayName string   `json:"user_display_name,omitempty"`
	UserIsAdmin     bool     `json:"user_is_admin,omitempty"`
	// ScimExternalID is set only for a membership created by a SCIM
	// connection (see the scim package) - the IdP's own id for this member,
	// echoed back so the IdP can correlate its own records with ours.
	ScimExternalID *string `json:"scim_external_id,omitempty"`
}

type Session struct {
	ID                string    `json:"id"`
	Token             string    `json:"token,omitempty"`
	UserID            string    `json:"user_id"`
	CreatedAt         time.Time `json:"created_at"`
	ExpiresAt         time.Time `json:"expires_at"`
	ReauthenticatedAt time.Time `json:"reauthenticated_at"`
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

	LastLoginAt      *time.Time `json:"last_login_at"`
	LastLoginSuccess *bool      `json:"last_login_success"`
	LastError        string     `json:"last_error"`
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
	Domain       string `json:"domain"`
}

// CreateUserParams deliberately has no IsAdmin field - see UpdateUserParams'
// doc comment. Every user created through this path is a regular
// (non-platform-admin) account, full stop.
type CreateUserParams struct {
	Email          string `json:"email"`
	Password       string `json:"password"`
	DisplayName    string `json:"display_name"`
	OrganizationID string `json:"organization_id"`
	Role           string `json:"role"`
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
	// mailer/publicAppURL are set post-construction via SetMailer, not
	// through New() - see SetMailer's doc comment for why.
	mailer       mailer.Sender
	publicAppURL string
	// publicAPIURL is set post-construction via SetPublicAPIURL, same
	// New()-signature-stability reasoning as SetMailer above. Used to build
	// the redirect_uri this server presents to an OIDC identity provider
	// (see oidc.go's BeginOIDCLogin) - distinct from publicAppURL, which
	// points at the console frontend, not an API route.
	publicAPIURL string
	// orgMode is set post-construction via SetOrgMode, same New()-signature-
	// stability reasoning as publicAPIURL. Zero value "" is treated as
	// orgModeMulti (today's unlimited-org behavior), so every existing
	// caller/test that never calls SetOrgMode is unaffected.
	orgMode string
	// lookupTXT resolves DNS TXT records for VerifyOrganizationDomain.
	// Defaulted in New() to the real resolver, not left nil - unlike
	// mailer/publicAPIURL/orgMode, there is no meaningful "unset" behavior
	// for a DNS lookup, so every caller gets working domain verification
	// without an extra setup step. Swappable via SetDomainLookupTXT so
	// tests can fake a DNS answer instead of depending on real DNS/network
	// access.
	lookupTXT func(ctx context.Context, host string) ([]string, error)
}

// orgModeMulti/orgModeSingle mirror config.OrgModeMulti/config.OrgModeSingle
// as plain strings - see SetOrgMode's doc comment for why iam takes a
// string here instead of importing the config package's type.
const (
	orgModeMulti  = "multi"
	orgModeSingle = "single"
)

func New(database *sdb.DB, sessionTTL time.Duration) *Service {
	return &Service{db: database, sessionTTL: sessionTTL, lookupTXT: net.DefaultResolver.LookupTXT}
}

// SetDomainLookupTXT overrides the DNS TXT resolver VerifyOrganizationDomain
// uses - production code never needs this (New already wires up the real
// resolver), it exists purely so tests can fake a DNS answer instead of
// depending on real DNS/network access.
func (s *Service) SetDomainLookupTXT(lookup func(ctx context.Context, host string) ([]string, error)) {
	s.lookupTXT = lookup
}

// SetMailer wires up outbound email (invitation accept links, password
// reset links). Deliberately not a New() parameter: iam.New is called from
// 11 places across the repo, nearly all of them unrelated test-env
// helpers in other packages that have no reason to care about email -
// changing New's signature would ripple everywhere for a dependency most
// callers don't need. A nil sender (the zero value, i.e. never calling
// SetMailer) is a fully supported, permanent state: every flow that sends
// mail treats it as best-effort and still succeeds without it (see
// CreateInvitation, ForgotPassword).
func (s *Service) SetMailer(sender mailer.Sender, publicAppURL string) {
	s.mailer = sender
	s.publicAppURL = strings.TrimRight(publicAppURL, "/")
}

// SetPublicAPIURL wires up this server's own public API base URL, used to
// build the redirect_uri sent to an OIDC identity provider during login
// (see oidc.go). Not a New() parameter for the same reason as SetMailer -
// most of iam.New's many callers (mostly unrelated test-env helpers) have no
// reason to care. An empty value (never calling this) means OIDC login
// can't be started - BeginOIDCLogin returns a clear error rather than
// silently building a broken redirect_uri.
func (s *Service) SetPublicAPIURL(publicAPIURL string) {
	s.publicAPIURL = strings.TrimRight(publicAPIURL, "/")
}

// SetOrgMode wires up whether this deployment allows more than one
// Organization to ever exist ("single") or not ("multi" - also the zero
// value, i.e. never calling this, which preserves today's behavior for the
// many test-env callers that don't care). Not a New() parameter for the
// same reason as SetMailer/SetPublicAPIURL. Unlike those setters this one
// validates: an unrecognized value returns an error so a misconfigured
// deployment fails at startup (see app.New) instead of silently running
// with the wrong org-count policy - see CreateOrganization for enforcement.
func (s *Service) SetOrgMode(mode string) error {
	switch mode {
	case "", orgModeMulti:
		s.orgMode = orgModeMulti
	case orgModeSingle:
		s.orgMode = orgModeSingle
	default:
		return fmt.Errorf("invalid org mode %q: must be %q or %q", mode, orgModeSingle, orgModeMulti)
	}
	return nil
}

// OrgMode reports the deployment's org mode ("single" or "multi"), for
// surfacing to the frontend via GET /api/v1/bootstrap/status (see
// api.handleBootstrapStatus) so it can proactively hide/disable
// organization-creation UI before the user hits a 409 from CreateOrganization.
func (s *Service) OrgMode() string {
	if s.orgMode == "" {
		return orgModeMulti
	}
	return s.orgMode
}

func (s *Service) BootstrapStatus(ctx context.Context) (bool, error) {
	var count int64
	if err := s.db.Gorm().WithContext(ctx).Model(&sdb.User{}).Count(&count).Error; err != nil {
		return false, err
	}
	return count > 0, nil
}

// HasAnyOrganization reports whether at least one Organization has ever
// been created in this deployment - the correct signal for single-org-mode
// gating (see CreateOrganization), distinct from BootstrapStatus's "at
// least one User exists": Register can create a User with zero
// Organizations (someone registers before ever creating/joining one), so
// the two can diverge - BootstrapStatus's count must not be reused here.
func (s *Service) HasAnyOrganization(ctx context.Context) (bool, error) {
	var count int64
	if err := s.db.Gorm().WithContext(ctx).Model(&sdb.Organization{}).Count(&count).Error; err != nil {
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

		bootstrapMembership, err := toMembershipWithPermissions(tx, user.ID, membership)
		if err != nil {
			return err
		}
		result = &AuthResult{
			Token:         rawToken,
			User:          toUser(user),
			Organizations: []Organization{toOrganization(org)},
			Memberships:   []Membership{bootstrapMembership},
		}
		return nil
	})
	return result, err
}

type RegisterParams struct {
	Email       string `json:"email"`
	Password    string `json:"password"`
	DisplayName string `json:"display_name"`
}

// Register is the platform's self-service account creation path - unlike
// Bootstrap (single-shot, first account only) or CreateUser (admin-only),
// anyone can call this. If the email's domain matches an organization's own
// Domain, the new user is immediately auto-joined to that organization as a
// "pending" member: full access already (see the membership Status
// enforcement in access.go), just flagged for admin attention until
// confirmed or until BlockExpiredPendingMemberships blocks it unconfirmed.
// No domain match just creates the account with no memberships -
// CreateOrganization (already self-serve) covers "I'm the first person
// from a brand-new company."
func (s *Service) Register(ctx context.Context, params RegisterParams) (*AuthResult, error) {
	email := normalizeEmail(params.Email)
	password := strings.TrimSpace(params.Password)
	displayName := strings.TrimSpace(params.DisplayName)
	if email == "" || password == "" {
		return nil, ErrInvalidInput("email and password are required")
	}
	if displayName == "" {
		return nil, ErrInvalidInput("display_name is required")
	}

	var result *AuthResult
	err := s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		var existing int64
		if err := tx.Model(&sdb.User{}).Where("email = ?", email).Count(&existing).Error; err != nil {
			return err
		}
		if existing > 0 {
			return ErrConflict("an account with this email already exists")
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
		user := sdb.User{
			ID: userID, Email: email, DisplayName: displayName, PasswordHash: passwordHash,
			CreatedAt: now, UpdatedAt: now,
		}
		if err := tx.Create(&user).Error; err != nil {
			if isUniqueConstraintError(err) {
				return ErrConflict("an account with this email already exists")
			}
			return err
		}

		organizations := []Organization{}
		memberships := []Membership{}
		if domain := emailDomain(email); domain != "" {
			var org sdb.Organization
			// domain_verified_at IS NOT NULL: a Domain claim alone proves
			// nothing (see Organization.Domain's doc comment) - only a
			// verified domain may auto-join self-registering users.
			err := tx.Where("domain = ? AND domain_verified_at IS NOT NULL", domain).First(&org).Error
			switch {
			case err == nil:
				membershipID, err := newID("mem")
				if err != nil {
					return err
				}
				membership := sdb.Membership{
					ID: membershipID, UserID: user.ID, OrganizationID: org.ID, Role: "member",
					Status: "pending", PendingSince: &now, CreatedAt: now,
				}
				if err := tx.Create(&membership).Error; err != nil {
					return err
				}
				if err := appendAuditEvent(tx, nil, org.ID, "membership.self_registered", "membership", membership.ID, map[string]string{"user_id": user.ID, "email": email}); err != nil {
					return err
				}
				registeredMembership, err := toMembershipWithPermissions(tx, user.ID, membership)
				if err != nil {
					return err
				}
				organizations = append(organizations, toOrganization(org))
				memberships = append(memberships, registeredMembership)
			case errors.Is(err, gorm.ErrRecordNotFound):
				// No organization claims this email domain - the account is
				// still created, just with no memberships yet.
			default:
				return err
			}
		}

		session, rawToken, err := s.newSession(user.ID, now)
		if err != nil {
			return err
		}
		if err := tx.Create(&session).Error; err != nil {
			return err
		}

		result = &AuthResult{
			Token: rawToken, User: toUser(user),
			Organizations: organizations, Memberships: memberships,
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
	domain := normalizeDomain(params.Domain)
	if name == "" || slug == "" {
		return nil, ErrInvalidInput("name and slug are required")
	}

	var organization *Organization
	err := s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		if s.orgMode == orgModeSingle {
			var orgCount int64
			if err := tx.Model(&sdb.Organization{}).Count(&orgCount).Error; err != nil {
				return err
			}
			if orgCount > 0 {
				return ErrConflict("this deployment is restricted to a single organization")
			}
		}
		var existing int64
		if err := tx.Model(&sdb.Organization{}).Where("slug = ?", slug).Count(&existing).Error; err != nil {
			return err
		}
		if existing > 0 {
			return ErrConflict("organization slug already exists")
		}
		if domain != nil {
			var conflictingDomain int64
			if err := tx.Model(&sdb.Organization{}).Where("domain = ?", *domain).Count(&conflictingDomain).Error; err != nil {
				return err
			}
			if conflictingDomain > 0 {
				return ErrConflict("an organization with this email domain already exists")
			}
		}

		now := time.Now().UTC()
		organizationIDValue, err := newID("org")
		if err != nil {
			return err
		}
		record := sdb.Organization{
			ID: organizationIDValue, Name: name, Slug: slug, Description: description,
			WebsiteURL: websiteURL, SupportEmail: supportEmail, Domain: domain, CreatedAt: now, UpdatedAt: now,
		}
		if domain != nil {
			token, err := newDomainVerificationToken()
			if err != nil {
				return err
			}
			record.DomainVerificationToken = &token
		}
		if err := tx.Create(&record).Error; err != nil {
			if isUniqueConstraintError(err) {
				return ErrConflict("organization slug or email domain already exists")
			}
			return err
		}
		if err := appendAuditEvent(tx, principal, record.ID, "organization.created", "organization", record.ID, map[string]string{"slug": record.Slug}); err != nil {
			return err
		}

		if !principal.User.IsAdmin {
			if hasAny, err := userHasAnyMembership(tx, principal.User.ID); err != nil {
				return err
			} else if hasAny {
				return ErrConflict("user already belongs to an organization")
			}
			membershipID, err := newID("mem")
			if err != nil {
				return err
			}
			membership := sdb.Membership{ID: membershipID, UserID: principal.User.ID, OrganizationID: record.ID, Role: "owner", CreatedAt: now}
			if err := tx.Create(&membership).Error; err != nil {
				if isUniqueConstraintError(err) {
					return ErrConflict("user already belongs to an organization")
				}
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
		Token:             sdb.HashOpaqueToken(rawToken),
		ID:                sessionID,
		UserID:            userID,
		CreatedAt:         now,
		ExpiresAt:         now.Add(s.sessionTTL),
		ReauthenticatedAt: now,
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
// membershipsByUser is used only for session/auth resolution (Login,
// ResolvePrincipal) - excludes "blocked" memberships so a blocked org
// disappears from a user's session context entirely, same as never having
// been a member. Admin-facing membership listings (ListMemberships et al.)
// are unaffected - a "blocked" row still exists and should stay visible so
// an admin can un-block it.
func membershipsByUser(tx *gorm.DB, userID string) ([]Membership, error) {
	var records []sdb.Membership
	if err := tx.Where("user_id = ? AND status <> ?", userID, "blocked").Order("created_at asc").Find(&records).Error; err != nil {
		return nil, err
	}
	memberships := make([]Membership, 0, len(records))
	for _, record := range records {
		membership, err := toMembershipWithPermissions(tx, userID, record)
		if err != nil {
			return nil, err
		}
		memberships = append(memberships, membership)
	}
	return memberships, nil
}

// toMembershipWithPermissions attaches the resolved effective permission set
// for one membership's role, in its organization - a minimal *Principal is
// enough since effectivePermissionsForPrincipal re-queries memberships/groups/
// policy bindings from tx itself, it never reads back the passed-in struct.
func toMembershipWithPermissions(tx *gorm.DB, userID string, record sdb.Membership) (Membership, error) {
	m := toMembership(record)
	permissions, err := effectivePermissionsForPrincipal(tx, &Principal{User: User{ID: userID}}, record.OrganizationID)
	if err != nil {
		return Membership{}, err
	}
	m.Permissions = sortedPermissionCodes(permissions)
	return m, nil
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

// userHasAnyMembership reports whether userID already belongs to any
// organization - the application-level check backing the one-org-per-user
// invariant, checked before every membership-creating INSERT that targets an
// *existing* user (not one just created in the same transaction, which can't
// have a prior membership by construction) so callers get a clean ErrConflict
// instead of a raw DB constraint error on the happy path. The DB-level
// uniqueIndex on Membership.UserID (see db/models.go) is the enforcement of
// last resort for races between this check and the INSERT.
func userHasAnyMembership(tx *gorm.DB, userID string) (bool, error) {
	var count int64
	err := tx.Model(&sdb.Membership{}).Where("user_id = ?", userID).Count(&count).Error
	return count > 0, err
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
		ID:                           record.ID,
		Name:                         record.Name,
		Slug:                         record.Slug,
		Description:                  record.Description,
		WebsiteURL:                   record.WebsiteURL,
		SupportEmail:                 record.SupportEmail,
		IsDefault:                    record.IsDefault,
		IsActive:                     record.IsActive,
		ShareProviderSettings:        record.ShareProviderSettings,
		ShareEmbedderSettings:        record.ShareEmbedderSettings,
		ShareWebSearchSettings:       record.ShareWebSearchSettings,
		ShareMCPServers:              record.ShareMCPServers,
		ShareSkillRepos:              record.ShareSkillRepos,
		ShareOrganizationPreferences: record.ShareOrganizationPreferences,
		ShareConnectorApps:           record.ShareConnectorApps,
		Domain:                       record.Domain,
		DomainVerificationToken:      record.DomainVerificationToken,
		DomainVerifiedAt:             record.DomainVerifiedAt,
		MinAppVersion:                record.MinAppVersion,
		CreatedAt:                    record.CreatedAt,
		UpdatedAt:                    record.UpdatedAt,
	}
}

func toMembership(record sdb.Membership) Membership {
	return Membership{
		ID: record.ID, UserID: record.UserID, OrganizationID: record.OrganizationID, Role: record.Role,
		Status: record.Status, PendingSince: record.PendingSince, CreatedAt: record.CreatedAt,
		ScimExternalID: record.ScimExternalID,
	}
}

func toSession(record sdb.Session) Session {
	return Session{
		ID: record.ID, UserID: record.UserID, CreatedAt: record.CreatedAt, ExpiresAt: record.ExpiresAt,
		ReauthenticatedAt: record.ReauthenticatedAt,
	}
}

func toApplication(gormDB *gorm.DB, record sdb.Application) Application {
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
		ClientSecret:           maskedStoredSecret(gormDB, record.OrganizationID, record.ClientSecret),
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

func toProvider(gormDB *gorm.DB, record sdb.Provider) Provider {
	return Provider{
		ID:               record.ID,
		OrganizationID:   record.OrganizationID,
		Name:             record.Name,
		Slug:             record.Slug,
		Kind:             record.Kind,
		Enabled:          record.Enabled,
		ClientID:         record.ClientID,
		ClientSecret:     maskedStoredSecret(gormDB, record.OrganizationID, record.ClientSecret),
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
		LastLoginAt:      record.LastLoginAt,
		LastLoginSuccess: record.LastLoginSuccess,
		LastError:        record.LastError,
	}
}

// recordProviderLoginAttempt updates a Provider's connection-health fields
// after a completed OIDC/SAML login round trip - success or failure - so an
// admin can see whether a configured connection actually works, not just
// whether it was configured. Deliberately its own write outside any
// surrounding transaction: a failed login's transaction rolls back, but the
// fact that it failed is exactly the signal this is meant to preserve, so
// it must survive that rollback rather than be undone by it.
//
// Only called from CompleteOIDCLogin/CompleteSAMLLogin, never from either
// protocol's Begin*Login half - a Begin failure is almost always a bad
// redirect_uri or an unknown/disabled provider_id, already caught by
// validation elsewhere, and says nothing about whether the identity
// provider itself is reachable and correctly configured.
func (s *Service) recordProviderLoginAttempt(providerID string, loginErr error) {
	if providerID == "" {
		return
	}
	now := time.Now().UTC()
	success := loginErr == nil
	errMsg := ""
	if loginErr != nil {
		errMsg = loginErr.Error()
	}
	// Best-effort: this must never surface as the login's own failure - by
	// the time this runs, the login has already succeeded or failed
	// regardless of whether this particular write lands.
	s.db.Gorm().Model(&sdb.Provider{}).Where("id = ?", providerID).Updates(map[string]any{
		"last_login_at": now, "last_login_success": success, "last_error": errMsg,
	})
}

// bcryptCost matches the "cost 12 minimum" policy documented in SECURITY.md.
// bcrypt.DefaultCost (10) is bcrypt's own library default, not this project's.
// A var (not const) so SetBcryptCostForTesting can lower it in test binaries -
// production code never calls that setter, so this always stays 12 outside tests.
var bcryptCost = 12

// SetBcryptCostForTesting lowers the cost hashPassword uses to bcrypt.MinCost
// for the lifetime of the calling test binary, and returns a restore func.
// Tests that create many accounts (Bootstrap, CreateUser, invitations, SCIM
// provisioning, ...) each pay a real cost-12 bcrypt hash otherwise - fine
// individually, but the combined cost across this package's test suite is
// what pushed CI's `-race` run of internal/server/iam and internal/server/api
// (which calls into iam.CreateUser) past their 8-minute timeout as the suite
// grew. Never call this outside a test binary.
func SetBcryptCostForTesting(cost int) (restore func()) {
	prev := bcryptCost
	bcryptCost = cost
	return func() { bcryptCost = prev }
}

func hashPassword(password string) (string, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcryptCost)
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

// normalizeDomain returns nil for an empty domain rather than a pointer to
// "" - a *string so the DB column stores NULL (a unique index allows any
// number of NULLs, but would reject two organizations both storing "").
// newDomainVerificationToken generates the value an organization must
// publish as a DNS TXT record to prove control of its claimed Domain - see
// VerifyOrganizationDomain. Same random source as every other token in this
// package (newToken/sdb.NewToken), just under its own name so call sites
// read as "generate a domain challenge," not "generate some generic token."
func newDomainVerificationToken() (string, error) { return newToken() }

func normalizeDomain(domain string) *string {
	domain = strings.ToLower(strings.TrimSpace(domain))
	domain = strings.TrimPrefix(domain, "@")
	if domain == "" {
		return nil
	}
	return &domain
}

// emailDomain returns the lowercased part of an email after "@", or "" if
// the email has no "@" (already validated non-empty by the caller).
func emailDomain(email string) string {
	_, domain, found := strings.Cut(normalizeEmail(email), "@")
	if !found {
		return ""
	}
	return domain
}

// maskedStoredSecret is the single place a client secret's stored (encrypted)
// value gets turned into what List/Get/Update responses actually return.
// Only the create-response path returns the real value once, in full (see
// e.g. CreateApplication) — everything else goes through here.
//
// 2026-08-06: previously showed the decrypted secret's real first 6
// characters in cleartext (secret[:6] + "********"). That's a genuine
// plaintext leak to anyone with read access, not just an obfuscated display —
// each read narrows the real secret's effective entropy, and a masked value
// is exactly the kind of thing an attacker with partial/leaked-elsewhere
// candidates would use to confirm a match. Replaced with a truncated SHA-256
// fingerprint of the decrypted value: still lets an operator visually tell
// two different configured secrets apart (or notice an unchanged one after
// an "update"), but a one-way hash can't be reversed back into secret bytes
// the way a literal prefix can.
//
// This also used to be duplicated near-verbatim in api/helpers.go
// (redactSecret), applied a second time on top of this function's own
// already-masked output by six API handlers — harmless only by coincidence
// (both used prefixLen=6). Removed there; this is now the only masking path.
func maskedStoredSecret(gormDB *gorm.DB, organizationID, secret string) string {
	if secret == "" {
		return ""
	}
	if plaintext, err := sdb.DecryptSecret(gormDB, organizationID, secret); err == nil {
		secret = plaintext
	}
	sum := sha256.Sum256([]byte(secret))
	fingerprint := hex.EncodeToString(sum[:])[:8]
	return fingerprint + strings.Repeat("*", 8)
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

func ErrInvalidInput(message string) error   { return apperr.InvalidInput(message) }
func ErrUnauthorized(message string) error   { return apperr.Unauthorized(message) }
func ErrForbidden(message string) error      { return apperr.Forbidden(message) }
func ErrConflict(message string) error       { return apperr.Conflict(message) }
func ErrNotFound(message string) error       { return apperr.NotFound(message) }
func ErrStepUpRequired(message string) error { return apperr.StepUpRequired(message) }
