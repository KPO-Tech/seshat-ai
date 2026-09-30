package scim

import (
	"context"
	"regexp"
	"strings"
	"sync/atomic"
	"time"

	"gorm.io/gorm"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
)

// scimSyncEventSeqNum is a process-wide, strictly-increasing counter for
// ScimSyncEvent.SeqNum - see that field's doc comment for why CreatedAt
// alone isn't a safe "most recent" sort key. Seeded from the current wall
// clock (nanoseconds) so it starts higher than any row from a previous
// process run in the overwhelming common case (wall-clock time only moves
// backward on an actual clock adjustment), then only ever incremented -
// perfectly monotonic for the lifetime of this process regardless of clock
// resolution.
var scimSyncEventSeqNum = time.Now().UnixNano()

func nextSyncEventSeqNum() int64 { return atomic.AddInt64(&scimSyncEventSeqNum, 1) }

const userSchema = "urn:ietf:params:scim:schemas:core:2.0:User"

// UserResource is the SCIM 2.0 wire shape for one user (RFC 7643 §4.1),
// deliberately the "realistic subset" declared by scimUserSchema in the API
// package's discovery endpoint, not every optional attribute the spec
// allows: userName/emails both map to our single User.Email column (see
// membershipToUserResource), so this server treats them as equivalent
// rather than tracking a separate username.
type UserResource struct {
	Schemas     []string    `json:"schemas"`
	ID          string      `json:"id"`
	ExternalID  string      `json:"externalId,omitempty"`
	UserName    string      `json:"userName"`
	DisplayName string      `json:"displayName,omitempty"`
	Name        *ScimName   `json:"name,omitempty"`
	Emails      []ScimEmail `json:"emails,omitempty"`
	Active      bool        `json:"active"`
	Meta        ScimMeta    `json:"meta"`
}

type ScimName struct {
	Formatted string `json:"formatted,omitempty"`
}

type ScimEmail struct {
	Value   string `json:"value"`
	Primary bool   `json:"primary,omitempty"`
}

type ScimMeta struct {
	ResourceType string `json:"resourceType"`
}

func membershipToUserResource(m iam.Membership) UserResource {
	externalID := ""
	if m.ScimExternalID != nil {
		externalID = *m.ScimExternalID
	}
	return UserResource{
		Schemas:     []string{userSchema},
		ID:          m.UserID,
		ExternalID:  externalID,
		UserName:    m.UserEmail,
		DisplayName: m.UserDisplayName,
		Name:        &ScimName{Formatted: m.UserDisplayName},
		Emails:      []ScimEmail{{Value: m.UserEmail, Primary: true}},
		Active:      m.Status != "blocked",
		Meta:        ScimMeta{ResourceType: "User"},
	}
}

// CreateUserRequest is the subset of RFC 7643 §4.1's User attributes this
// server reads from a POST/PUT body. userName is the primary source of the
// account's email; emails[] is only consulted when userName is empty (some
// IdPs, atypically, only populate emails[]).
type CreateUserRequest struct {
	UserName    string      `json:"userName"`
	ExternalID  string      `json:"externalId"`
	DisplayName string      `json:"displayName"`
	Name        *ScimName   `json:"name"`
	Emails      []ScimEmail `json:"emails"`
	// Active has no JSON omitempty and defaults to Go's zero value (false)
	// when absent - matching most real IdPs, which always send it
	// explicitly on create. A caller that truly never sends it gets a
	// user provisioned already blocked, which is the safe default for an
	// ambiguous "I don't know" over silently granting access.
	Active bool `json:"active"`
}

func (r CreateUserRequest) resolveEmail() string {
	if email := strings.TrimSpace(r.UserName); email != "" {
		return email
	}
	for _, e := range r.Emails {
		if e.Primary && strings.TrimSpace(e.Value) != "" {
			return strings.TrimSpace(e.Value)
		}
	}
	if len(r.Emails) > 0 {
		return strings.TrimSpace(r.Emails[0].Value)
	}
	return ""
}

func (r CreateUserRequest) resolveDisplayName() string {
	if name := strings.TrimSpace(r.DisplayName); name != "" {
		return name
	}
	if r.Name != nil {
		if formatted := strings.TrimSpace(r.Name.Formatted); formatted != "" {
			return formatted
		}
	}
	return r.resolveEmail()
}

// CreateScimUser provisions a new user for connection.OrganizationID
// (POST /scim/v2/Users). Recorded in ScimSyncEvent whether it succeeds or
// fails.
func (s *Service) CreateScimUser(ctx context.Context, connection *Connection, req CreateUserRequest) (*UserResource, error) {
	email := req.resolveEmail()
	displayName := req.resolveDisplayName()
	member, err := s.iam.ProvisionScimMember(ctx, iam.ProvisionScimMemberParams{
		OrganizationID: connection.OrganizationID, Email: email, DisplayName: displayName,
		Active: req.Active, ExternalID: req.ExternalID,
	})
	s.recordSyncEvent(ctx, connection, "user.create", "User", req.ExternalID, err)
	if err != nil {
		return nil, err
	}
	resource := membershipToUserResource(*member)
	return &resource, nil
}

// GetScimUser — GET /scim/v2/Users/{id}. id is this server's own resource
// id (User.ID), not the IdP's externalId - see the staged plan's mapping
// notes for why (externalId is metadata for the IdP's own bookkeeping,
// never how SCIM resources are addressed over the wire).
func (s *Service) GetScimUser(ctx context.Context, connection *Connection, userID string) (*UserResource, error) {
	member, err := s.iam.GetScimMemberByUserID(ctx, connection.OrganizationID, userID)
	if err != nil {
		return nil, err
	}
	resource := membershipToUserResource(*member)
	return &resource, nil
}

// ReplaceScimUser — PUT /scim/v2/Users/{id}, a full replace of
// displayName/active (externalId and email are immutable after creation in
// this server's mapping - see the staged plan).
func (s *Service) ReplaceScimUser(ctx context.Context, connection *Connection, userID string, req CreateUserRequest) (*UserResource, error) {
	member, err := s.iam.UpdateScimMember(ctx, connection.OrganizationID, userID, iam.UpdateScimMemberParams{
		DisplayName: req.resolveDisplayName(), Active: req.Active,
	})
	s.recordSyncEvent(ctx, connection, "user.replace", "User", req.ExternalID, err)
	if err != nil {
		return nil, err
	}
	resource := membershipToUserResource(*member)
	return &resource, nil
}

// DeactivateScimUser — DELETE /scim/v2/Users/{id}. Maps to
// Membership.Status="blocked", never a real deletion - see the staged
// plan's mapping notes (a later PATCH by the same externalId/id must still
// find this row).
func (s *Service) DeactivateScimUser(ctx context.Context, connection *Connection, userID string) error {
	member, err := s.iam.GetScimMemberByUserID(ctx, connection.OrganizationID, userID)
	if err != nil {
		s.recordSyncEvent(ctx, connection, "user.delete", "User", "", err)
		return err
	}
	_, err = s.iam.UpdateScimMember(ctx, connection.OrganizationID, userID, iam.UpdateScimMemberParams{
		DisplayName: member.UserDisplayName, Active: false,
	})
	externalID := ""
	if member.ScimExternalID != nil {
		externalID = *member.ScimExternalID
	}
	s.recordSyncEvent(ctx, connection, "user.delete", "User", externalID, err)
	return err
}

// PatchScimUser — PATCH /scim/v2/Users/{id} (RFC 7644 §3.5.2). Supports
// "replace" on active/displayName only, both the path-addressed form
// ({"op":"replace","path":"active","value":false}) and the object form
// some IdPs send instead ({"op":"replace","value":{"active":false}}) - see
// the staged plan's "add/remove best-effort" note: this is the single most
// common real-world PATCH (Okta/Entra deprovisioning), everything else is a
// no-op rather than an error, since silently ignoring an unsupported
// attribute is safer than refusing the whole request over it.
func (s *Service) PatchScimUser(ctx context.Context, connection *Connection, userID string, ops []PatchOperation) (*UserResource, error) {
	member, err := s.iam.GetScimMemberByUserID(ctx, connection.OrganizationID, userID)
	if err != nil {
		s.recordSyncEvent(ctx, connection, "user.patch", "User", "", err)
		return nil, err
	}

	displayName := member.UserDisplayName
	active := member.Status != "blocked"
	for _, op := range ops {
		if !strings.EqualFold(op.Op, "replace") {
			continue
		}
		applyReplace(op, "active", &active)
		applyReplaceString(op, "displayName", &displayName)
	}

	updated, err := s.iam.UpdateScimMember(ctx, connection.OrganizationID, userID, iam.UpdateScimMemberParams{
		DisplayName: displayName, Active: active,
	})
	externalID := ""
	if member.ScimExternalID != nil {
		externalID = *member.ScimExternalID
	}
	s.recordSyncEvent(ctx, connection, "user.patch", "User", externalID, err)
	if err != nil {
		return nil, err
	}
	resource := membershipToUserResource(*updated)
	return &resource, nil
}

// PatchOperation is one entry of a SCIM PATCH request's "Operations" array.
type PatchOperation struct {
	Op    string `json:"op"`
	Path  string `json:"path"`
	Value any    `json:"value"`
}

// applyReplace handles a "replace" op targeting a boolean attribute, in
// either the path-addressed form (path == attribute, value is the bool
// directly) or the object form (path is empty, value is a map containing
// the attribute).
func applyReplace(op PatchOperation, attribute string, target *bool) {
	if strings.EqualFold(strings.TrimSpace(op.Path), attribute) {
		if b, ok := op.Value.(bool); ok {
			*target = b
		}
		return
	}
	if strings.TrimSpace(op.Path) != "" {
		return
	}
	if values, ok := op.Value.(map[string]any); ok {
		if raw, exists := values[attribute]; exists {
			if b, ok := raw.(bool); ok {
				*target = b
			}
		}
	}
}

func applyReplaceString(op PatchOperation, attribute string, target *string) {
	if strings.EqualFold(strings.TrimSpace(op.Path), attribute) {
		if v, ok := op.Value.(string); ok && strings.TrimSpace(v) != "" {
			*target = v
		}
		return
	}
	if strings.TrimSpace(op.Path) != "" {
		return
	}
	if values, ok := op.Value.(map[string]any); ok {
		if raw, exists := values[attribute]; exists {
			if v, ok := raw.(string); ok && strings.TrimSpace(v) != "" {
				*target = v
			}
		}
	}
}

// scimFilterPattern matches the one filter shape this server supports:
// `userName eq "..."` or `emails.value eq "..."` or `emails eq "..."`
// (case-insensitive on the attribute name and "eq") - both attributes
// resolve to the same underlying email lookup, see ListScimUsers.
var scimFilterPattern = regexp.MustCompile(`(?i)^\s*(userName|emails(?:\.value)?)\s+eq\s+"([^"]*)"\s*$`)

// ErrUnsupportedFilter is returned by ListScimUsers when the filter
// expression isn't the one shape this server understands - callers map
// this to a 400 with SCIM's own "invalidFilter" scimType.
var ErrUnsupportedFilter = iam.ErrInvalidInput("unsupported filter expression; only userName/emails.value eq \"...\" is supported")

// ListScimUsers — GET /scim/v2/Users. startIndex is SCIM's own 1-indexed
// convention (RFC 7644 §3.4.2), converted to a 0-indexed offset before
// reaching iam.Service, consistent with every other list endpoint in this
// codebase.
func (s *Service) ListScimUsers(ctx context.Context, connection *Connection, startIndex, count int, filter string) ([]UserResource, int, error) {
	if strings.TrimSpace(filter) != "" {
		match := scimFilterPattern.FindStringSubmatch(filter)
		if match == nil {
			return nil, 0, ErrUnsupportedFilter
		}
		member, err := s.iam.FindScimMemberByEmail(ctx, connection.OrganizationID, match[2])
		if err != nil {
			return nil, 0, err
		}
		if member == nil {
			return []UserResource{}, 0, nil
		}
		return []UserResource{membershipToUserResource(*member)}, 1, nil
	}

	if startIndex < 1 {
		startIndex = 1
	}
	if count <= 0 {
		count = 100
	}
	members, total, err := s.iam.ListScimMembers(ctx, connection.OrganizationID, startIndex-1, count)
	if err != nil {
		return nil, 0, err
	}
	resources := make([]UserResource, 0, len(members))
	for _, m := range members {
		resources = append(resources, membershipToUserResource(m))
	}
	return resources, int(total), nil
}

// recordSyncEvent is best-effort: a logging failure must never mask or
// override the actual operation's own result, so its own error (if any) is
// silently dropped rather than propagated.
func (s *Service) recordSyncEvent(ctx context.Context, connection *Connection, operation, resourceType, externalID string, opErr error) {
	id, err := newID("sse")
	if err != nil {
		return
	}
	event := sdb.ScimSyncEvent{
		ID: id, ScimConnectionID: connection.ID, OrganizationID: connection.OrganizationID,
		Operation: operation, ResourceType: resourceType, ExternalID: externalID, Success: opErr == nil,
		SeqNum: nextSyncEventSeqNum(),
	}
	if opErr != nil {
		event.ErrorMessage = opErr.Error()
	}
	db := s.db.Gorm().WithContext(ctx)
	if err := db.Create(&event).Error; err != nil {
		return
	}
	trimSyncEventHistory(db, connection.ID)
}

// scimSyncEventRetentionLimit is Étape 1's "simple retention policy" -
// enough history for a real admin investigation, small enough to never
// grow unbounded from a chatty IdP re-syncing constantly.
const scimSyncEventRetentionLimit = 500

// trimSyncEventHistory deletes everything past the most recent
// scimSyncEventRetentionLimit rows for one connection. Best-effort: a
// failure here must never surface as if the actual sync operation (already
// committed above) had failed, so its error is silently dropped.
func trimSyncEventHistory(db *gorm.DB, connectionID string) {
	var count int64
	if err := db.Model(&sdb.ScimSyncEvent{}).Where("scim_connection_id = ?", connectionID).Count(&count).Error; err != nil {
		return
	}
	if count <= scimSyncEventRetentionLimit {
		return
	}
	_ = db.Exec(
		`DELETE FROM scim_sync_events WHERE scim_connection_id = ? AND id NOT IN (
			SELECT id FROM scim_sync_events WHERE scim_connection_id = ? ORDER BY seq_num DESC LIMIT ?
		)`,
		connectionID, connectionID, scimSyncEventRetentionLimit,
	).Error
}
