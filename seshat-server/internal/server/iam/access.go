package iam

import (
	"context"
	"sort"
	"strings"
	"time"

	"gorm.io/gorm"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
)

// Permission describes one capability understood by the control plane.
type Permission struct {
	Code        string `json:"code"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Category    string `json:"category"`
}

// Group is an organization-local collection of users for policy assignment.
type Group struct {
	ID             string    `json:"id"`
	OrganizationID string    `json:"organization_id"`
	Name           string    `json:"name"`
	Slug           string    `json:"slug"`
	Description    string    `json:"description"`
	MemberUserIDs  []string  `json:"member_user_ids"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

// PolicyBinding grants permissions to a role, user or group.
type PolicyBinding struct {
	ID              string    `json:"id"`
	OrganizationID  string    `json:"organization_id"`
	Name            string    `json:"name"`
	Description     string    `json:"description"`
	SubjectType     string    `json:"subject_type"`
	SubjectID       string    `json:"subject_id"`
	PermissionCodes []string  `json:"permission_codes"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}

const (
	policySubjectUser  = "user"
	policySubjectGroup = "group"
	policySubjectRole  = "role"
)

// ListPermissions exposes the server-defined permission catalog.
func (s *Service) ListPermissions(ctx context.Context, principal *Principal) ([]Permission, error) {
	_ = ctx
	if principal == nil {
		return nil, ErrUnauthorized("authentication required")
	}
	return permissionCatalog(), nil
}

func permissionCatalog() []Permission {
	permissions := []Permission{
		{Code: "organization.read", Name: "Read Organization", Description: "Inspect organization metadata.", Category: "organization"},
		{Code: "organization.use", Name: "Use Organization", Description: "Use the organization as a regular member.", Category: "organization"},
		{Code: "organization.manage", Name: "Manage Organization", Description: "Update organization settings and admin configuration.", Category: "organization"},
		{Code: "organization.delete", Name: "Delete Organization", Description: "Permanently delete the organization and everything scoped to it.", Category: "organization"},
		{Code: "members.read", Name: "Read Members", Description: "Inspect organization memberships.", Category: "members"},
		{Code: "members.manage", Name: "Manage Members", Description: "Create and update memberships and invitations.", Category: "members"},
		{Code: "roles.read", Name: "Read Roles", Description: "Inspect system and custom role definitions.", Category: "roles"},
		{Code: "roles.manage", Name: "Manage Roles", Description: "Create, update and delete custom organization roles.", Category: "roles"},
		{Code: "applications.read", Name: "Read Applications", Description: "Inspect client applications.", Category: "applications"},
		{Code: "applications.manage", Name: "Manage Applications", Description: "Create, update and delete client applications.", Category: "applications"},
		{Code: "providers.read", Name: "Read Providers", Description: "Inspect identity providers.", Category: "providers"},
		{Code: "providers.manage", Name: "Manage Providers", Description: "Create, update and delete identity providers.", Category: "providers"},
		{Code: "invitations.read", Name: "Read Invitations", Description: "Inspect organization invitations.", Category: "invitations"},
		{Code: "invitations.manage", Name: "Manage Invitations", Description: "Issue and revoke invitations.", Category: "invitations"},
		{Code: "groups.read", Name: "Read Groups", Description: "Inspect authorization groups.", Category: "groups"},
		{Code: "groups.manage", Name: "Manage Groups", Description: "Create, update and delete authorization groups.", Category: "groups"},
		{Code: "policies.read", Name: "Read Policies", Description: "Inspect policy bindings.", Category: "policies"},
		{Code: "policies.manage", Name: "Manage Policies", Description: "Create, update and delete policy bindings.", Category: "policies"},
		{Code: "audit.read", Name: "Read Audit Events", Description: "Inspect organization audit events.", Category: "audit"},
		{Code: "devices.read", Name: "Read Devices", Description: "Inspect registered devices.", Category: "devices"},
		{Code: "devices.manage", Name: "Manage Devices", Description: "Register and revoke devices.", Category: "devices"},
		{Code: "jobs.read", Name: "Read Jobs", Description: "Inspect scheduled jobs and their runs.", Category: "jobs"},
		{Code: "jobs.manage", Name: "Manage Jobs", Description: "Create, update, delete, pause, resume and trigger jobs; cancel runs.", Category: "jobs"},
		{Code: "provider_settings.read", Name: "Read Provider Settings", Description: "See which LLM providers are configured (never the API key itself).", Category: "provider_settings"},
		{Code: "provider_settings.manage", Name: "Manage Provider Settings", Description: "Create, update and delete LLM provider credentials.", Category: "provider_settings"},
		{Code: "knowledge.read", Name: "Read Knowledge Base", Description: "Inspect corpora, uploaded files and ingestion status.", Category: "knowledge"},
		{Code: "knowledge.manage", Name: "Manage Knowledge Base", Description: "Create/delete corpora, upload and remove files, retry ingestion.", Category: "knowledge"},
	}
	sort.Slice(permissions, func(i, j int) bool { return permissions[i].Code < permissions[j].Code })
	return permissions
}

func permissionCatalogSet() map[string]Permission {
	catalog := map[string]Permission{}
	for _, permission := range permissionCatalog() {
		catalog[permission.Code] = permission
	}
	return catalog
}

func validatePermissionCodes(codes []string) ([]string, error) {
	catalog := permissionCatalogSet()
	unique := map[string]struct{}{}
	normalized := make([]string, 0, len(codes))
	for _, code := range codes {
		code = strings.ToLower(strings.TrimSpace(code))
		if code == "" {
			continue
		}
		if _, ok := catalog[code]; !ok {
			return nil, ErrInvalidInput("unsupported permission code")
		}
		if _, ok := unique[code]; ok {
			continue
		}
		unique[code] = struct{}{}
		normalized = append(normalized, code)
	}
	if len(normalized) == 0 {
		return nil, ErrInvalidInput("at least one permission code is required")
	}
	sort.Strings(normalized)
	return normalized, nil
}

func normalizePolicySubjectType(subjectType string) string {
	return strings.ToLower(strings.TrimSpace(subjectType))
}

func validatePolicySubjectType(subjectType string) (string, error) {
	subjectType = normalizePolicySubjectType(subjectType)
	switch subjectType {
	case policySubjectUser, policySubjectGroup, policySubjectRole:
		return subjectType, nil
	default:
		return "", ErrInvalidInput("unsupported subject_type")
	}
}

// hasOrganizationPermission checks one permission code for a principal in
// one organization. Platform admins always pass (as long as the organization
// exists); everyone else is resolved via effectivePermissionsForPrincipal.
func hasOrganizationPermission(tx *gorm.DB, principal *Principal, organizationID, permissionCode string) (bool, error) {
	if principal == nil {
		return false, nil
	}
	if principal.User.IsAdmin {
		var count int64
		if err := tx.Model(&sdb.Organization{}).Where("id = ?", organizationID).Count(&count).Error; err != nil {
			return false, err
		}
		return count > 0, nil
	}
	permissions, err := effectivePermissionsForPrincipal(tx, principal, organizationID)
	if err != nil {
		return false, err
	}
	_, ok := permissions[permissionCode]
	return ok, nil
}

func hasAnyOrganizationPermission(tx *gorm.DB, principal *Principal, organizationID string, permissionCodes ...string) (bool, error) {
	for _, permissionCode := range permissionCodes {
		ok, err := hasOrganizationPermission(tx, principal, organizationID, permissionCode)
		if err != nil {
			return false, err
		}
		if ok {
			return true, nil
		}
	}
	return false, nil
}

// effectivePermissionsForPrincipal resolves the union of role-derived and
// policy-binding-derived permissions for one principal, scoped to one
// organization. Every query here is scoped by organization_id (indexed),
// never a full-table scan of every tenant's data.
func effectivePermissionsForPrincipal(tx *gorm.DB, principal *Principal, organizationID string) (map[string]struct{}, error) {
	permissions := map[string]struct{}{}
	if principal == nil {
		return permissions, nil
	}
	if principal.User.IsAdmin {
		for _, permission := range permissionCatalog() {
			permissions[permission.Code] = struct{}{}
		}
		return permissions, nil
	}

	var memberships []sdb.Membership
	if err := tx.Where("user_id = ? AND organization_id = ?", principal.User.ID, organizationID).Find(&memberships).Error; err != nil {
		return nil, err
	}
	if len(memberships) == 0 {
		return permissions, nil
	}
	roleCodes := map[string]struct{}{}
	customRoleCodes := make([]string, 0, len(memberships))
	for _, membership := range memberships {
		roleCode := normalizeRole(membership.Role)
		roleCodes[roleCode] = struct{}{}
		if role, ok := systemRoleByCode(roleCode); ok {
			for _, permission := range role.Permissions {
				permissions[permission] = struct{}{}
			}
			continue
		}
		customRoleCodes = append(customRoleCodes, roleCode)
	}
	if len(customRoleCodes) > 0 {
		var customRoles []sdb.CustomRole
		if err := tx.Where("organization_id = ? AND code IN ?", organizationID, customRoleCodes).Find(&customRoles).Error; err != nil {
			return nil, err
		}
		for _, role := range customRoles {
			for _, permission := range role.PermissionCodes {
				permissions[permission] = struct{}{}
			}
		}
	}

	var groupMemberships []sdb.GroupMember
	if err := tx.Where("organization_id = ? AND user_id = ?", organizationID, principal.User.ID).Find(&groupMemberships).Error; err != nil {
		return nil, err
	}
	groupIDs := map[string]struct{}{}
	for _, membership := range groupMemberships {
		groupIDs[membership.GroupID] = struct{}{}
	}

	var bindings []sdb.PolicyBinding
	if err := tx.Where("organization_id = ?", organizationID).Find(&bindings).Error; err != nil {
		return nil, err
	}
	for _, binding := range bindings {
		if bindingMatchesPrincipal(binding, roleCodes, groupIDs, principal.User.ID) {
			for _, permissionCode := range binding.PermissionCodes {
				permissions[permissionCode] = struct{}{}
			}
		}
	}
	return permissions, nil
}

func bindingMatchesPrincipal(binding sdb.PolicyBinding, roleCodes, groupIDs map[string]struct{}, userID string) bool {
	switch binding.SubjectType {
	case policySubjectUser:
		return binding.SubjectID == userID
	case policySubjectGroup:
		_, ok := groupIDs[binding.SubjectID]
		return ok
	case policySubjectRole:
		_, ok := roleCodes[binding.SubjectID]
		return ok
	default:
		return false
	}
}

func requireOrganizationPermission(tx *gorm.DB, principal *Principal, organizationID string, permissionCodes ...string) error {
	if principal == nil {
		return ErrUnauthorized("authentication required")
	}
	var count int64
	if err := tx.Model(&sdb.Organization{}).Where("id = ?", organizationID).Count(&count).Error; err != nil {
		return err
	}
	if count == 0 {
		return ErrNotFound("organization not found")
	}
	ok, err := hasAnyOrganizationPermission(tx, principal, organizationID, permissionCodes...)
	if err != nil {
		return err
	}
	if ok {
		return nil
	}
	return ErrForbidden("organization permission denied")
}

// CheckOrganizationPermission is the exported form of requireOrganizationPermission,
// for sibling control-plane packages (e.g. automation) that need the exact
// same role/policy-binding resolution iam already implements, without
// duplicating it or reaching into iam's unexported internals.
//
// Takes the caller's own *gorm.DB handle (a third-party type, not an iam
// internal) rather than a context — same reasoning as AppendAuditEvent: a
// caller running this inside its own s.db.Transaction(...) must pass that
// same tx, not let this open a fresh connection. Under SQLite with
// MaxOpenConns(1) (see db.Open), opening a second connection from inside an
// already-open transaction on the same pool deadlocks outright — this bit
// us once already, keep it that way.
func (s *Service) CheckOrganizationPermission(tx *gorm.DB, principal *Principal, organizationID string, permissionCodes ...string) error {
	return requireOrganizationPermission(tx, principal, organizationID, permissionCodes...)
}

// CanAccessOrganization is the exported form of canAccessOrganization, for
// read-only visibility checks (member or platform admin) from sibling
// packages. Same tx-handle requirement as CheckOrganizationPermission.
func (s *Service) CanAccessOrganization(tx *gorm.DB, principal *Principal, organizationID string) (bool, error) {
	return canAccessOrganization(tx, principal, organizationID)
}

// canAccessOrganization is the coarse "is this principal a member (or a
// platform admin) of this organization" check used by read-only Get/List
// paths that don't gate on a specific permission code.
func canAccessOrganization(tx *gorm.DB, principal *Principal, organizationID string) (bool, error) {
	if principal == nil {
		return false, nil
	}
	if principal.User.IsAdmin {
		var count int64
		if err := tx.Model(&sdb.Organization{}).Where("id = ?", organizationID).Count(&count).Error; err != nil {
			return false, err
		}
		return count > 0, nil
	}
	var count int64
	if err := tx.Model(&sdb.Membership{}).Where("user_id = ? AND organization_id = ?", principal.User.ID, organizationID).Count(&count).Error; err != nil {
		return false, err
	}
	return count > 0, nil
}

func toGroup(record sdb.Group, memberUserIDs []string) Group {
	return Group{
		ID:             record.ID,
		OrganizationID: record.OrganizationID,
		Name:           record.Name,
		Slug:           record.Slug,
		Description:    record.Description,
		MemberUserIDs:  append([]string(nil), memberUserIDs...),
		CreatedAt:      record.CreatedAt,
		UpdatedAt:      record.UpdatedAt,
	}
}

func toPolicyBinding(record sdb.PolicyBinding) PolicyBinding {
	return PolicyBinding{
		ID:              record.ID,
		OrganizationID:  record.OrganizationID,
		Name:            record.Name,
		Description:     record.Description,
		SubjectType:     record.SubjectType,
		SubjectID:       record.SubjectID,
		PermissionCodes: append([]string(nil), record.PermissionCodes...),
		CreatedAt:       record.CreatedAt,
		UpdatedAt:       record.UpdatedAt,
	}
}
