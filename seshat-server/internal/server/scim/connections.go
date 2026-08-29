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
	"time"

	"gorm.io/gorm"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
)

// Connection is the caller-facing view of an organization's SCIM
// connection. Never includes the bearer token - see ConnectionWithToken for
// the one-time reveal on create/rotate.
//
// LastSyncAt/LastSyncSuccess/LastError are Étape 6's "health" fields -
// deliberately computed from ScimSyncEvent at read time (see withHealth),
// never stored columns that would need to be kept in sync by hand on every
// write path. LastSyncAt/LastSyncSuccess are both nil until at least one
// protocol operation has ever hit this connection. LastError only reflects
// the MOST RECENT event's error - an older failure followed by a newer
// success clears it, on the theory that a subsequent success means whatever
// was wrong has since resolved.
type Connection struct {
	ID              string     `json:"id"`
	OrganizationID  string     `json:"organization_id"`
	CreatedByUserID string     `json:"created_by_user_id"`
	Name            string     `json:"name"`
	Enabled         bool       `json:"enabled"`
	SyncGroups      bool       `json:"sync_groups"`
	AutoCreateTeams bool       `json:"auto_create_teams"`
	LastSyncAt      *time.Time `json:"last_sync_at,omitempty"`
	LastSyncSuccess *bool      `json:"last_sync_success,omitempty"`
	LastError       string     `json:"last_error,omitempty"`
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

// ResolveConnectionByToken authenticates one incoming SCIM protocol request
// (GET/POST/PUT/PATCH/DELETE on /scim/v2/*) - the caller here is the IdP
// itself, not a human with an iam.Principal, so this follows
// automation.Service.Heartbeat's device-token pattern rather than any of
// this package's other methods: take the raw bearer token, hash it, look up
// the connection it belongs to. Rejects with the same "invalid_token" error
// whether the token is unknown or belongs to a disabled connection - never
// distinguish the two to a caller that doesn't yet have a valid credential.
func (s *Service) ResolveConnectionByToken(ctx context.Context, rawToken string) (*Connection, error) {
	rawToken = strings.TrimSpace(rawToken)
	if rawToken == "" {
		return nil, iam.ErrUnauthorized("missing bearer token")
	}
	var record sdb.ScimConnection
	err := s.db.Gorm().WithContext(ctx).Where("token_hash = ?", sdb.HashOpaqueToken(rawToken)).First(&record).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, iam.ErrUnauthorized("invalid bearer token")
		}
		return nil, err
	}
	if !record.Enabled {
		return nil, iam.ErrUnauthorized("invalid bearer token")
	}
	connection := toConnection(record)
	return &connection, nil
}

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
	if err := s.withHealth(tx, &connection); err != nil {
		return nil, err
	}
	return &connection, nil
}

// withHealth populates connection.LastSyncAt/LastSyncSuccess/LastError from
// the single most recent ScimSyncEvent for it, if any. A missing event
// history (no protocol operation has ever hit this connection) leaves all
// three fields at their zero value, not an error.
func (s *Service) withHealth(tx *gorm.DB, connection *Connection) error {
	var event sdb.ScimSyncEvent
	err := tx.Where("scim_connection_id = ?", connection.ID).Order("seq_num desc").First(&event).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil
		}
		return err
	}
	createdAt := event.CreatedAt
	success := event.Success
	connection.LastSyncAt = &createdAt
	connection.LastSyncSuccess = &success
	if !success {
		connection.LastError = event.ErrorMessage
	}
	return nil
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

// SyncEvent is the caller-facing view of one ScimSyncEvent row - the
// "recent activity" feed Étape 6's admin UI reads instead of a separate
// health-summary table (see the staged plan: health is derived from this
// journal, not stored redundantly).
type SyncEvent struct {
	ID           string    `json:"id"`
	Operation    string    `json:"operation"`
	ResourceType string    `json:"resource_type"`
	ExternalID   string    `json:"external_id,omitempty"`
	Success      bool      `json:"success"`
	ErrorMessage string    `json:"error_message,omitempty"`
	CreatedAt    time.Time `json:"created_at"`
}

func toSyncEvent(record sdb.ScimSyncEvent) SyncEvent {
	return SyncEvent{
		ID: record.ID, Operation: record.Operation, ResourceType: record.ResourceType,
		ExternalID: record.ExternalID, Success: record.Success, ErrorMessage: record.ErrorMessage,
		CreatedAt: record.CreatedAt,
	}
}

// ListSyncEvents returns organizationID's SCIM connection's recent activity,
// most recent first. Requires scim_connections.read/.manage or
// organization.manage, same gate as GetConnection - this is the connection's
// own operational log, not something a plain member needs to see.
func (s *Service) ListSyncEvents(ctx context.Context, principal *iam.Principal, organizationID string, limit, offset int) ([]SyncEvent, int64, error) {
	if principal == nil {
		return nil, 0, iam.ErrUnauthorized("authentication required")
	}
	organizationID = strings.TrimSpace(organizationID)
	if organizationID == "" {
		return nil, 0, iam.ErrInvalidInput("organization_id is required")
	}
	tx := s.db.Gorm().WithContext(ctx)
	if !principal.User.IsAdmin {
		if err := s.iam.CheckOrganizationPermission(tx, principal, organizationID, "scim_connections.read", "scim_connections.manage", "organization.manage"); err != nil {
			return nil, 0, err
		}
	}
	connectionRecord, found, err := s.findConnectionTx(tx, organizationID)
	if err != nil {
		return nil, 0, err
	}
	if !found {
		return []SyncEvent{}, 0, nil
	}
	query := tx.Model(&sdb.ScimSyncEvent{}).Where("scim_connection_id = ?", connectionRecord.ID).Order("seq_num desc")
	records, total, err := sdb.Page[sdb.ScimSyncEvent](query, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	events := make([]SyncEvent, 0, len(records))
	for _, record := range records {
		events = append(events, toSyncEvent(record))
	}
	return events, total, nil
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
