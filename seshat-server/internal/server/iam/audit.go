package iam

import (
	"context"
	"strings"
	"time"

	"gorm.io/gorm"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
)

// AuditEvent is the normalized view exposed by the API layer.
type AuditEvent struct {
	ID             string            `json:"id"`
	OrganizationID string            `json:"organization_id"`
	ActorUserID    string            `json:"actor_user_id"`
	Action         string            `json:"action"`
	ResourceType   string            `json:"resource_type"`
	ResourceID     string            `json:"resource_id"`
	Metadata       map[string]string `json:"metadata"`
	CreatedAt      time.Time         `json:"created_at"`
}

// ListAuditEventsParams allows simple server-side filtering for admin screens.
type ListAuditEventsParams struct {
	OrganizationID string `json:"organization_id"`
	ActorUserID    string `json:"actor_user_id"`
	Action         string `json:"action"`
	ResourceType   string `json:"resource_type"`
}

var auditEventSortFields = map[string]sdb.SortField{
	"created_at":    {Column: "created_at"},
	"action":        {Column: "action"},
	"resource_type": {Column: "resource_type"},
	"actor_user_id": {Column: "actor_user_id"},
}

// auditEventSearchColumns includes the raw metadata JSON text column, so a
// search term matching a key or value inside it is still found — an
// approximation of the old per-entry key/value scan, not a semantic
// key-vs-value distinction, but close enough for a free-text search box.
var auditEventSearchColumns = []string{
	"id", "organization_id", "actor_user_id", "action", "resource_type", "resource_id", "metadata",
}

// ListAuditEvents returns a page of filtered audit entries for platform
// admins or org managers, with search/sort/pagination applied in SQL — the
// audit trail is append-only and never shrinks, so this is the one list
// endpoint where loading every matching row into memory first would hurt
// most as history accumulates.
func (s *Service) ListAuditEvents(ctx context.Context, principal *Principal, params ListAuditEventsParams, listParams sdb.ListParams) ([]AuditEvent, int64, error) {
	if principal == nil {
		return nil, 0, ErrUnauthorized("authentication required")
	}

	organizationID := strings.TrimSpace(params.OrganizationID)
	actorUserID := strings.TrimSpace(params.ActorUserID)
	action := strings.TrimSpace(params.Action)
	resourceType := strings.TrimSpace(params.ResourceType)

	tx := s.db.Gorm().WithContext(ctx)
	if organizationID != "" && !principal.User.IsAdmin {
		ok, err := hasAnyOrganizationPermission(tx, principal, organizationID, "audit.read", "organization.manage", "members.manage")
		if err != nil {
			return nil, 0, err
		}
		if !ok {
			return nil, 0, ErrForbidden("organization management privileges required")
		}
	}

	query := tx.Model(&sdb.AuditEvent{})
	if organizationID != "" {
		query = query.Where("organization_id = ?", organizationID)
	} else if !principal.User.IsAdmin {
		allowedOrganizationIDs, err := organizationIDsWithAnyPermission(tx, principal, "audit.read", "organization.manage", "members.manage")
		if err != nil {
			return nil, 0, err
		}
		if len(allowedOrganizationIDs) == 0 {
			return []AuditEvent{}, 0, nil
		}
		query = query.Where("organization_id IN ?", allowedOrganizationIDs)
	}
	if actorUserID != "" {
		query = query.Where("actor_user_id = ?", actorUserID)
	}
	if action != "" {
		query = query.Where("action = ?", action)
	}
	if resourceType != "" {
		query = query.Where("resource_type = ?", resourceType)
	}

	sortField, err := sdb.ResolveSortField(auditEventSortFields, listParams.Sort)
	if err != nil {
		return nil, 0, ErrInvalidInput(err.Error())
	}
	query = sdb.ApplySearch(query, listParams.Search, auditEventSearchColumns...)
	query = sdb.ApplySort(query, sortField, listParams.Order)

	records, total, err := sdb.Page[sdb.AuditEvent](query, listParams.Limit, listParams.Offset)
	if err != nil {
		return nil, 0, err
	}
	events := make([]AuditEvent, 0, len(records))
	for _, record := range records {
		events = append(events, toAuditEvent(record))
	}
	return events, total, nil
}

// AppendAuditEvent is the exported form of appendAuditEvent, for sibling
// control-plane packages (e.g. automation) that want their mutations in the
// same audit trail. Takes the caller's own *gorm.DB transaction handle (a
// third-party type, not an iam internal) so the audit write commits
// atomically with whatever else that transaction is doing.
func (s *Service) AppendAuditEvent(tx *gorm.DB, principal *Principal, organizationID, action, resourceType, resourceID string, metadata map[string]string) error {
	return appendAuditEvent(tx, principal, organizationID, action, resourceType, resourceID, metadata)
}

func appendAuditEvent(tx *gorm.DB, principal *Principal, organizationID, action, resourceType, resourceID string, metadata map[string]string) error {
	actorUserID := "system"
	if principal != nil && principal.User.ID != "" {
		actorUserID = principal.User.ID
	}

	// Audit metadata is copied so callers can safely reuse their map afterwards.
	copiedMetadata := map[string]string{}
	for k, v := range metadata {
		copiedMetadata[k] = v
	}
	if len(copiedMetadata) == 0 {
		copiedMetadata = nil
	}

	auditEventID, err := newID("evt")
	if err != nil {
		return err
	}
	record := sdb.AuditEvent{
		ID:             auditEventID,
		OrganizationID: strings.TrimSpace(organizationID),
		ActorUserID:    actorUserID,
		Action:         strings.TrimSpace(action),
		ResourceType:   strings.TrimSpace(resourceType),
		ResourceID:     strings.TrimSpace(resourceID),
		Metadata:       copiedMetadata,
		CreatedAt:      time.Now().UTC(),
	}
	return tx.Create(&record).Error
}

func toAuditEvent(record sdb.AuditEvent) AuditEvent {
	metadata := map[string]string{}
	for k, v := range record.Metadata {
		metadata[k] = v
	}
	if len(metadata) == 0 {
		metadata = nil
	}
	return AuditEvent{
		ID:             record.ID,
		OrganizationID: record.OrganizationID,
		ActorUserID:    record.ActorUserID,
		Action:         record.Action,
		ResourceType:   record.ResourceType,
		ResourceID:     record.ResourceID,
		Metadata:       metadata,
		CreatedAt:      record.CreatedAt,
	}
}
