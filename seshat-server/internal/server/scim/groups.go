package scim

import (
	"context"
	"regexp"
	"strings"

	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
)

const groupSchema = "urn:ietf:params:scim:schemas:core:2.0:Group"

// GroupResource is the SCIM 2.0 wire shape for one group (RFC 7643 §4.2).
// members[].display is deliberately never populated - the IdP already
// knows each member's display name from its own directory, "value" (our
// User.ID) is the only field it actually round-trips on.
type GroupResource struct {
	Schemas     []string          `json:"schemas"`
	ID          string            `json:"id"`
	ExternalID  string            `json:"externalId,omitempty"`
	DisplayName string            `json:"displayName"`
	Members     []ScimGroupMember `json:"members,omitempty"`
	Meta        ScimMeta          `json:"meta"`
}

type ScimGroupMember struct {
	Value string `json:"value"`
}

func groupToResource(g iam.Group) GroupResource {
	externalID := ""
	if g.ScimExternalID != nil {
		externalID = *g.ScimExternalID
	}
	members := make([]ScimGroupMember, 0, len(g.MemberUserIDs))
	for _, userID := range g.MemberUserIDs {
		members = append(members, ScimGroupMember{Value: userID})
	}
	return GroupResource{
		Schemas: []string{groupSchema}, ID: g.ID, ExternalID: externalID,
		DisplayName: g.Name, Members: members, Meta: ScimMeta{ResourceType: "Group"},
	}
}

// CreateGroupRequest is the subset of RFC 7643 §4.2's Group attributes this
// server reads from a POST/PUT body.
type CreateGroupRequest struct {
	DisplayName string            `json:"displayName"`
	ExternalID  string            `json:"externalId"`
	Members     []ScimGroupMember `json:"members"`
}

func (r CreateGroupRequest) memberUserIDs() []string {
	ids := make([]string, 0, len(r.Members))
	for _, m := range r.Members {
		if v := strings.TrimSpace(m.Value); v != "" {
			ids = append(ids, v)
		}
	}
	return ids
}

// ErrGroupSyncDisabled is returned by every /Groups write operation when
// connection.SyncGroups is false - the admin has explicitly opted this
// connection out of group provisioning, so a well-behaved IdP should be
// told clearly rather than getting a silent no-op success.
var ErrGroupSyncDisabled = iam.ErrForbidden("group provisioning is disabled for this SCIM connection")

// CreateScimGroup — POST /scim/v2/Groups. Behavior depends on the
// connection's mode (see the staged plan's three-state model):
//   - SyncGroups=false: rejected with ErrGroupSyncDisabled, nothing recorded
//     as a "sync" since the connection never agreed to accept groups at all.
//   - SyncGroups=true, AutoCreateTeams=false ("metadata only"): recorded in
//     ScimSyncEvent for admin visibility, but no real Group is created - the
//     returned resource's id is not persisted anywhere, so a later GET/PATCH/
//     DELETE by that id will 404. This is a deliberate, documented trade-off
//     (see the staged plan): this mode exists to observe what an IdP WOULD
//     push before trusting it to manage real teams, not to shadow-track state
//     for a group that was never actually materialized.
//   - SyncGroups=true, AutoCreateTeams=true: a real Group + GroupMember set
//     is created, addressable by its own id from then on.
func (s *Service) CreateScimGroup(ctx context.Context, connection *Connection, req CreateGroupRequest) (*GroupResource, error) {
	if !connection.SyncGroups {
		return nil, ErrGroupSyncDisabled
	}
	if !connection.AutoCreateTeams {
		s.recordSyncEvent(ctx, connection, "group.create.metadata_only", "Group", req.ExternalID, nil)
		resource := GroupResource{
			Schemas: []string{groupSchema}, ID: req.ExternalID, ExternalID: req.ExternalID,
			DisplayName: req.DisplayName, Members: req.Members, Meta: ScimMeta{ResourceType: "Group"},
		}
		if resource.ID == "" {
			// No externalId to key off of and nothing persisted - synthesize
			// a random id purely so the response has one; it will never
			// resolve on a later request, by design (see doc comment above).
			id, err := newID("scimgrp")
			if err != nil {
				return nil, err
			}
			resource.ID = id
		}
		return &resource, nil
	}

	group, err := s.iam.SyncScimGroupCreate(ctx, iam.SyncScimGroupCreateParams{
		OrganizationID: connection.OrganizationID, DisplayName: req.DisplayName,
		ExternalID: req.ExternalID, MemberUserIDs: req.memberUserIDs(),
	})
	s.recordSyncEvent(ctx, connection, "group.create", "Group", req.ExternalID, err)
	if err != nil {
		return nil, err
	}
	resource := groupToResource(*group)
	return &resource, nil
}

// GetScimGroup — GET /scim/v2/Groups/{id}. Only meaningful in
// auto-create-teams mode: a "metadata only" group was never persisted, so
// this always 404s for one of those ids, which is correct (see
// CreateScimGroup's doc comment).
func (s *Service) GetScimGroup(ctx context.Context, connection *Connection, groupID string) (*GroupResource, error) {
	group, err := s.iam.GetScimGroupByID(ctx, connection.OrganizationID, groupID)
	if err != nil {
		return nil, err
	}
	resource := groupToResource(*group)
	return &resource, nil
}

// ReplaceScimGroup — PUT /scim/v2/Groups/{id}, a full replace of
// displayName + membership.
func (s *Service) ReplaceScimGroup(ctx context.Context, connection *Connection, groupID string, req CreateGroupRequest) (*GroupResource, error) {
	if !connection.SyncGroups {
		return nil, ErrGroupSyncDisabled
	}
	if !connection.AutoCreateTeams {
		s.recordSyncEvent(ctx, connection, "group.replace.metadata_only", "Group", req.ExternalID, nil)
		return nil, iam.ErrNotFound("no such group")
	}
	group, err := s.iam.UpdateScimGroup(ctx, connection.OrganizationID, groupID, iam.UpdateScimGroupParams{
		DisplayName: req.DisplayName, MemberUserIDs: req.memberUserIDs(),
	})
	s.recordSyncEvent(ctx, connection, "group.replace", "Group", req.ExternalID, err)
	if err != nil {
		return nil, err
	}
	resource := groupToResource(*group)
	return &resource, nil
}

// DeleteScimGroup — DELETE /scim/v2/Groups/{id}. Really deletes the group
// (see iam.Service.DeleteScimGroup's doc comment for why, unlike Users).
func (s *Service) DeleteScimGroup(ctx context.Context, connection *Connection, groupID string) error {
	if !connection.SyncGroups {
		return ErrGroupSyncDisabled
	}
	if !connection.AutoCreateTeams {
		s.recordSyncEvent(ctx, connection, "group.delete.metadata_only", "Group", "", nil)
		return iam.ErrNotFound("no such group")
	}
	err := s.iam.DeleteScimGroup(ctx, connection.OrganizationID, groupID)
	s.recordSyncEvent(ctx, connection, "group.delete", "Group", "", err)
	return err
}

// ListScimGroups — GET /scim/v2/Groups. Only ever returns real,
// auto-created groups - "metadata only" pushes leave nothing to list, by
// design.
func (s *Service) ListScimGroups(ctx context.Context, connection *Connection, startIndex, count int) ([]GroupResource, int, error) {
	if startIndex < 1 {
		startIndex = 1
	}
	if count <= 0 {
		count = 100
	}
	groups, total, err := s.iam.ListScimGroups(ctx, connection.OrganizationID, startIndex-1, count)
	if err != nil {
		return nil, 0, err
	}
	resources := make([]GroupResource, 0, len(groups))
	for _, g := range groups {
		resources = append(resources, groupToResource(g))
	}
	return resources, int(total), nil
}

// groupMemberFilterPattern matches the filter-path form of a single-member
// remove: `members[value eq "usr_123"]`.
var groupMemberFilterPattern = regexp.MustCompile(`(?i)^members\[\s*value\s+eq\s+"([^"]*)"\s*\]$`)

// PatchScimGroup — PATCH /scim/v2/Groups/{id} (RFC 7644 §3.5.2). Supports
// "replace" on displayName, and "add"/"remove" on members in both the
// bulk form (path="members", value=array) and the single-member filter
// form (path=`members[value eq "..."]`) - see the staged plan's
// "read-diff-replace" note: this reads the current membership, applies the
// requested add/remove to a copy, then calls UpdateScimGroup with the
// merged result, since there's no lower-level atomic add/remove primitive
// in iam.Service today.
func (s *Service) PatchScimGroup(ctx context.Context, connection *Connection, groupID string, ops []PatchOperation) (*GroupResource, error) {
	if !connection.SyncGroups {
		return nil, ErrGroupSyncDisabled
	}
	if !connection.AutoCreateTeams {
		s.recordSyncEvent(ctx, connection, "group.patch.metadata_only", "Group", "", nil)
		return nil, iam.ErrNotFound("no such group")
	}

	group, err := s.iam.GetScimGroupByID(ctx, connection.OrganizationID, groupID)
	if err != nil {
		s.recordSyncEvent(ctx, connection, "group.patch", "Group", "", err)
		return nil, err
	}

	displayName := group.Name
	members := map[string]struct{}{}
	for _, id := range group.MemberUserIDs {
		members[id] = struct{}{}
	}

	for _, op := range ops {
		path := strings.TrimSpace(op.Path)
		switch {
		case strings.EqualFold(op.Op, "replace") && strings.EqualFold(path, "displayName"):
			if v, ok := op.Value.(string); ok && strings.TrimSpace(v) != "" {
				displayName = v
			}
		case strings.EqualFold(op.Op, "add") && strings.HasPrefix(strings.ToLower(path), "members"):
			for _, id := range extractMemberIDs(op.Value) {
				members[id] = struct{}{}
			}
		case strings.EqualFold(op.Op, "remove") && strings.HasPrefix(strings.ToLower(path), "members"):
			if match := groupMemberFilterPattern.FindStringSubmatch(path); match != nil {
				delete(members, match[1])
				continue
			}
			for _, id := range extractMemberIDs(op.Value) {
				delete(members, id)
			}
		}
	}

	memberUserIDs := make([]string, 0, len(members))
	for id := range members {
		memberUserIDs = append(memberUserIDs, id)
	}

	updated, err := s.iam.UpdateScimGroup(ctx, connection.OrganizationID, groupID, iam.UpdateScimGroupParams{
		DisplayName: displayName, MemberUserIDs: memberUserIDs,
	})
	externalID := ""
	if group.ScimExternalID != nil {
		externalID = *group.ScimExternalID
	}
	s.recordSyncEvent(ctx, connection, "group.patch", "Group", externalID, err)
	if err != nil {
		return nil, err
	}
	resource := groupToResource(*updated)
	return &resource, nil
}

// extractMemberIDs reads a PATCH op's value as either an array of
// {"value": "usr_..."} objects (the normal form) or, best-effort, an array
// of bare id strings (a form some non-compliant clients send instead).
func extractMemberIDs(value any) []string {
	items, ok := value.([]any)
	if !ok {
		return nil
	}
	ids := make([]string, 0, len(items))
	for _, item := range items {
		switch v := item.(type) {
		case string:
			if trimmed := strings.TrimSpace(v); trimmed != "" {
				ids = append(ids, trimmed)
			}
		case map[string]any:
			if raw, ok := v["value"].(string); ok {
				if trimmed := strings.TrimSpace(raw); trimmed != "" {
					ids = append(ids, trimmed)
				}
			}
		}
	}
	return ids
}
