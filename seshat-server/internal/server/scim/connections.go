// Package scim implements SCIM 2.0 provisioning (RFC 7643/7644): an
// enterprise IdP (Okta, Entra ID, ...) pushes user/group changes to one
// organization's connection here instead of an admin managing membership by
// hand. Built in stages - see
// docs/helps/audit-2026-08-29-openwork-den-comparison.md § 3 for the full
// plan. This file is Étape 2: admin-facing CRUD for the connection itself
// (name, enabled flag, sync options, bearer token). The SCIM protocol
// endpoints IdPs actually call (/scim/v2/Users, /scim/v2/Groups, ...) are a
// later stage and live in their own file(s) in this package.
package scim

import (
	"context"
	"errors"
	"strings"

	"gorm.io/gorm"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
)

// Connection is the caller-facing view of an organization's SCIM
// connection. Never includes the bearer token - see ConnectionWithToken for
// the one-time reveal on create/rotate.
type Connection struct {
	ID              string `json:"id"`
	OrganizationID  string `json:"organization_id"`
	CreatedByUserID string `json:"created_by_user_id"`
	Name            string `json:"name"`
	Enabled         bool   `json:"enabled"`
	SyncGroups      bool   `json:"sync_groups"`
	AutoCreateTeams bool   `json:"auto_create_teams"`
}

// ConnectionWithToken is returned only from CreateConnection and
// RotateConnectionToken - the one and only moment the raw bearer token
// exists outside its hash. Same "shown once" contract as an Invitation or
// Device registration token.
type ConnectionWithToken struct {
	Connection
	Token string `json:"token"`
}

type CreateConnectionParams struct {
	OrganizationID  string
	Name            string
	SyncGroups      bool
	AutoCreateTeams bool
}

type UpdateConnectionParams struct {
	Name            string
	Enabled         bool
	SyncGroups      bool
	AutoCreateTeams bool
}

type Service struct {
	db  *sdb.DB
	iam *iam.Service
}

func New(database *sdb.DB, iamService *iam.Service) *Service {
	return &Service{db: database, iam: iamService}
}

func newID(prefix string) (string, error) { return sdb.NewID(prefix) }

// GetConnection returns organizationID's SCIM connection, or (nil, nil) if
// none has been configured yet - "not configured" is an ordinary state for
// this singleton resource, not an error, mirroring
// websearchsettings.GetOrgPolicy's stance on its own org-wide singleton.
// Requires scim_connections.read/.manage or organization.manage.
func (s *Service) GetConnection(ctx context.Context, principal *iam.Principal, organizationID string) (*Connection, error) {
	if principal == nil {
		return nil, iam.ErrUnauthorized("authentication required")
	}
	organizationID = strings.TrimSpace(organizationID)
	if organizationID == "" {
		return nil, iam.ErrInvalidInput("organization_id is required")
	}
	tx := s.db.Gorm().WithContext(ctx)
	if !principal.User.IsAdmin {
		if err := s.iam.CheckOrganizationPermission(tx, principal, organizationID, "scim_connections.read", "scim_connections.manage", "organization.manage"); err != nil {
			return nil, err
		}
	}
	record, found, err := s.findConnection(ctx, organizationID)
	if err != nil {
		return nil, err
	}
	if !found {
		return nil, nil
	}
	connection := toConnection(record)
	return &connection, nil
}

// CreateConnection provisions organizationID's SCIM connection and returns
// its bearer token - the only time that token is ever readable again.
// Requires scim_connections.manage or organization.manage. One connection
// per organization (enforced by a unique index on organization_id); a
// second call for an org that already has one is rejected as a conflict -
// use RotateConnectionToken to replace the token, or DeleteConnection first.
func (s *Service) CreateConnection(ctx context.Context, principal *iam.Principal, params CreateConnectionParams) (*ConnectionWithToken, error) {
	if principal == nil {
		return nil, iam.ErrUnauthorized("authentication required")
	}
	organizationID := strings.TrimSpace(params.OrganizationID)
	name := strings.TrimSpace(params.Name)
	if organizationID == "" || name == "" {
		return nil, iam.ErrInvalidInput("organization_id and name are required")
	}

	rawToken, err := sdb.NewToken()
	if err != nil {
		return nil, err
	}
	connectionID, err := newID("scim")
	if err != nil {
		return nil, err
	}

	var record sdb.ScimConnection
	err = s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		if err := s.iam.CheckOrganizationPermission(tx, principal, organizationID, "scim_connections.manage", "organization.manage"); err != nil {
			return err
		}
		if _, found, err := s.findConnectionTx(tx, organizationID); err != nil {
			return err
		} else if found {
			return iam.ErrConflict("a SCIM connection already exists for this organization; delete it or rotate its token instead")
		}
		record = sdb.ScimConnection{
			ID: connectionID, OrganizationID: organizationID, CreatedByUserID: principal.User.ID,
			Name: name, Enabled: true, TokenHash: sdb.HashOpaqueToken(rawToken),
			SyncGroups: params.SyncGroups, AutoCreateTeams: params.AutoCreateTeams,
		}
		if err := tx.Create(&record).Error; err != nil {
			return err
		}
		return s.iam.AppendAuditEvent(tx, principal, organizationID, "scim_connection.created", "scim_connection", record.ID, nil)
	})
	if err != nil {
		return nil, err
	}
	return &ConnectionWithToken{Connection: toConnection(record), Token: rawToken}, nil
}

// UpdateConnection edits name/enabled/sync options. Never touches the
// token - use RotateConnectionToken for that. Requires
// scim_connections.manage or organization.manage.
func (s *Service) UpdateConnection(ctx context.Context, principal *iam.Principal, organizationID string, params UpdateConnectionParams) (*Connection, error) {
	if principal == nil {
		return nil, iam.ErrUnauthorized("authentication required")
	}
	organizationID = strings.TrimSpace(organizationID)
	name := strings.TrimSpace(params.Name)
	if organizationID == "" || name == "" {
		return nil, iam.ErrInvalidInput("organization_id and name are required")
	}

	var record sdb.ScimConnection
	err := s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		if err := s.iam.CheckOrganizationPermission(tx, principal, organizationID, "scim_connections.manage", "organization.manage"); err != nil {
			return err
		}
		found, err := s.mustFindConnectionTx(tx, organizationID, &record)
		if err != nil || !found {
			return err
		}
		wasEnabled := record.Enabled
		record.Name = name
		record.Enabled = params.Enabled
		record.SyncGroups = params.SyncGroups
		record.AutoCreateTeams = params.AutoCreateTeams
		if err := tx.Save(&record).Error; err != nil {
			return err
		}
		action := "scim_connection.updated"
		if wasEnabled && !params.Enabled {
			action = "scim_connection.disabled"
		} else if !wasEnabled && params.Enabled {
			action = "scim_connection.enabled"
		}
		return s.iam.AppendAuditEvent(tx, principal, organizationID, action, "scim_connection", record.ID, nil)
	})
	if err != nil {
		return nil, err
	}
	connection := toConnection(record)
	return &connection, nil
}

// RotateConnectionToken replaces organizationID's SCIM bearer token and
// returns the new raw value - the previous token stops working immediately
// (the IdP's configured secret must be updated to match). Requires
// scim_connections.manage or organization.manage.
func (s *Service) RotateConnectionToken(ctx context.Context, principal *iam.Principal, organizationID string) (*ConnectionWithToken, error) {
	if principal == nil {
		return nil, iam.ErrUnauthorized("authentication required")
	}
	organizationID = strings.TrimSpace(organizationID)
	if organizationID == "" {
		return nil, iam.ErrInvalidInput("organization_id is required")
	}

	rawToken, err := sdb.NewToken()
	if err != nil {
		return nil, err
	}

	var record sdb.ScimConnection
	err = s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		if err := s.iam.CheckOrganizationPermission(tx, principal, organizationID, "scim_connections.manage", "organization.manage"); err != nil {
			return err
		}
		found, err := s.mustFindConnectionTx(tx, organizationID, &record)
		if err != nil || !found {
			return err
		}
		record.TokenHash = sdb.HashOpaqueToken(rawToken)
		if err := tx.Save(&record).Error; err != nil {
			return err
		}
		return s.iam.AppendAuditEvent(tx, principal, organizationID, "scim_connection.token_rotated", "scim_connection", record.ID, nil)
	})
	if err != nil {
		return nil, err
	}
	return &ConnectionWithToken{Connection: toConnection(record), Token: rawToken}, nil
}

// DeleteConnection removes organizationID's SCIM connection outright. Any
// IdP still configured with the old token starts getting 401s immediately.
// Does not touch previously provisioned Users/Memberships/Groups - it only
// stops future pushes from being accepted. Requires scim_connections.manage
// or organization.manage.
func (s *Service) DeleteConnection(ctx context.Context, principal *iam.Principal, organizationID string) error {
	if principal == nil {
		return iam.ErrUnauthorized("authentication required")
	}
	organizationID = strings.TrimSpace(organizationID)
	if organizationID == "" {
		return iam.ErrInvalidInput("organization_id is required")
	}
	return s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		if err := s.iam.CheckOrganizationPermission(tx, principal, organizationID, "scim_connections.manage", "organization.manage"); err != nil {
			return err
		}
		var record sdb.ScimConnection
		found, err := s.mustFindConnectionTx(tx, organizationID, &record)
		if err != nil || !found {
			return err
		}
		if err := tx.Delete(&sdb.ScimConnection{}, "id = ?", record.ID).Error; err != nil {
			return err
		}
		return s.iam.AppendAuditEvent(tx, principal, organizationID, "scim_connection.deleted", "scim_connection", record.ID, nil)
	})
}

func (s *Service) findConnection(ctx context.Context, organizationID string) (sdb.ScimConnection, bool, error) {
	return s.findConnectionTx(s.db.Gorm().WithContext(ctx), organizationID)
}

func (s *Service) findConnectionTx(tx *gorm.DB, organizationID string) (sdb.ScimConnection, bool, error) {
	var record sdb.ScimConnection
	err := tx.Where("organization_id = ?", organizationID).First(&record).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return sdb.ScimConnection{}, false, nil
		}
		return sdb.ScimConnection{}, false, err
	}
	return record, true, nil
}

// mustFindConnectionTx loads organizationID's connection into out, returning
// (false, iam.ErrNotFound(...)) - not (false, nil) - when absent, since
// every caller of this helper is an update-style operation where "no
// connection configured yet" is the caller's mistake, unlike GetConnection's
// "not configured" being a normal read-side state.
func (s *Service) mustFindConnectionTx(tx *gorm.DB, organizationID string, out *sdb.ScimConnection) (bool, error) {
	record, found, err := s.findConnectionTx(tx, organizationID)
	if err != nil {
		return false, err
	}
	if !found {
		return false, iam.ErrNotFound("no SCIM connection configured for this organization")
	}
	*out = record
	return true, nil
}

func toConnection(record sdb.ScimConnection) Connection {
	return Connection{
		ID:              record.ID,
		OrganizationID:  record.OrganizationID,
		CreatedByUserID: record.CreatedByUserID,
		Name:            record.Name,
		Enabled:         record.Enabled,
		SyncGroups:      record.SyncGroups,
		AutoCreateTeams: record.AutoCreateTeams,
	}
}
