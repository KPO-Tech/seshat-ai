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
	// ScimExternalID is set only for a group created by a SCIM connection's
	// auto-create-teams mode (see the scim package) - the IdP's own id for
	// this group, echoed back so the IdP can correlate its own records.
	ScimExternalID *string `json:"scim_external_id,omitempty"`
}

// PolicyBinding grants permissions to a role, user or group. ResourceType/
// ResourceID optionally narrow the grant to one resource within the
// organization (both empty = organization-wide, see bindingMatchesPrincipal).
type PolicyBinding struct {
	ID              string    `json:"id"`
	OrganizationID  string    `json:"organization_id"`
	Name            string    `json:"name"`
	Description     string    `json:"description"`
	SubjectType     string    `json:"subject_type"`
	SubjectID       string    `json:"subject_id"`
	PermissionCodes []string  `json:"permission_codes"`
	ResourceType    string    `json:"resource_type"`
	ResourceID      string    `json:"resource_id"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}

const (
	policySubjectUser  = "user"
	policySubjectGroup = "group"
	policySubjectRole  = "role"
)

// resourceTypeCorpus is the first (and currently only) resource kind a
// PolicyBinding can be scoped to. iam deliberately does not verify a
// ResourceID actually refers to an existing corpus — that would require
// importing the knowledge package, which already imports iam, an import
// cycle. A dangling ResourceID (its corpus later deleted) is harmless: it
// just never matches anything again, the same as a binding whose group
// subject was deleted.
const resourceTypeCorpus = "corpus"

// resourceTypeProviderSetting scopes a PolicyBinding to one LLM provider
// setting (automation.ProviderSetting.ID) - see
// Service.HasResourceScopedBindings and automation.ListUsableProviderSettings
// for how this turns into an opt-in per-member/team allowlist: a provider
// setting with no bindings scoped to it stays usable by every org member
// (today's behavior, unchanged), and creating even one such binding switches
// that specific setting into "only these subjects" mode.
const resourceTypeProviderSetting = "provider_setting"

var knownResourceTypes = map[string]struct{}{
	resourceTypeCorpus:          {},
	resourceTypeProviderSetting: {},
}

func validatePolicyResourceScope(resourceType, resourceID string) (string, string, error) {
	resourceType = strings.ToLower(strings.TrimSpace(resourceType))
	resourceID = strings.TrimSpace(resourceID)
	if resourceType == "" && resourceID == "" {
		return "", "", nil
	}
	if _, ok := knownResourceTypes[resourceType]; !ok {
		return "", "", ErrInvalidInput("unsupported resource_type")
	}
	if resourceID == "" {
		return "", "", ErrInvalidInput("resource_id is required when resource_type is set")
	}
	return resourceType, resourceID, nil
}

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
		{Code: "desktop_policies.read", Name: "Read Desktop Policies", Description: "Inspect the desktop policy catalog and how it's assigned by role, member and team.", Category: "desktop_policies"},
		{Code: "desktop_policies.manage", Name: "Manage Desktop Policies", Description: "Create, update and delete desktop policy assignments.", Category: "desktop_policies"},
		{Code: "audit.read", Name: "Read Audit Events", Description: "Inspect organization audit events.", Category: "audit"},
		{Code: "devices.read", Name: "Read Devices", Description: "Inspect registered devices.", Category: "devices"},
		{Code: "devices.manage", Name: "Manage Devices", Description: "Register and revoke devices.", Category: "devices"},
		{Code: "jobs.read", Name: "Read Jobs", Description: "Inspect scheduled jobs and their runs.", Category: "jobs"},
		{Code: "jobs.manage", Name: "Manage Jobs", Description: "Create, update, delete, pause, resume and trigger jobs; cancel runs.", Category: "jobs"},
		{Code: "provider_settings.read", Name: "Read Provider Settings", Description: "See which LLM providers are configured (never the API key itself).", Category: "provider_settings"},
		{Code: "provider_settings.manage", Name: "Manage Provider Settings", Description: "Create, update and delete LLM provider credentials.", Category: "provider_settings"},
		{Code: "scim_connections.read", Name: "Read SCIM Connections", Description: "See this organization's SCIM provisioning connection and its recent sync activity (never the bearer token itself).", Category: "scim_connections"},
		{Code: "scim_connections.manage", Name: "Manage SCIM Connections", Description: "Create, update, delete and rotate the token of this organization's SCIM provisioning connection.", Category: "scim_connections"},
		{Code: "network_diagnostics.read", Name: "Run Network Diagnostics", Description: "Trigger a live connectivity check (DNS/TCP/TLS/HTTP) against the SMTP relay and this organization's configured SSO providers - a distinct capability from providers.read, since it makes real outbound network calls rather than just reading configuration.", Category: "network_diagnostics"},
		{Code: "hooks_registry.read", Name: "Read Hooks", Description: "See this organization's configured PreToolUse hooks (desktop-only - see HookConfig's doc comment for why these never run inside seshat-server itself).", Category: "hooks_registry"},
		{Code: "hooks_registry.manage", Name: "Manage Hooks", Description: "Create, update and delete this organization's PreToolUse hooks.", Category: "hooks_registry"},
		{Code: "knowledge.read", Name: "Read Knowledge Base", Description: "Inspect corpora, uploaded files and ingestion status.", Category: "knowledge"},
		{Code: "knowledge.manage", Name: "Manage Knowledge Base", Description: "Create/delete corpora, upload and remove files, retry ingestion.", Category: "knowledge"},
		{Code: "prospecting.read", Name: "Read Prospecting Results", Description: "List businesses discovered by a prospecting sweep.", Category: "prospecting"},
		{Code: "prospecting.manage", Name: "Manage Prospecting", Description: "Start/continue sweeps (spends the organization's Google Places budget) and configure the Places API key.", Category: "prospecting"},
		{Code: "skills_registry.manage", Name: "Manage Skills Registry", Description: "Curate the organization's list of recommended skill repos. Reading the list only requires org membership — these are public repo URLs, nothing secret to gate behind a read permission.", Category: "skills_registry"},
		{Code: "web_search_settings.manage", Name: "Manage Web Search Settings", Description: "Create, update and delete web-search provider credentials and the organization's domain policy. Reading (resolving credentials, reading the domain policy) only requires org membership.", Category: "web_search_settings"},
		{Code: "mcp_registry.manage", Name: "Manage MCP Registry", Description: "Create, update and delete the organization's shared MCP server definitions. Reading/resolving them (to load locally) only requires org membership — execution always happens on the member's own machine, never here.", Category: "mcp_registry"},
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

// hasResourcePermission is the resource-scoped counterpart of
// hasOrganizationPermission: it also credits bindings scoped to
// (resourceType, resourceID), on top of every organization-wide grant.
func hasResourcePermission(tx *gorm.DB, principal *Principal, organizationID, resourceType, resourceID, permissionCode string) (bool, error) {
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
	permissions, err := effectivePermissionsForPrincipalScoped(tx, principal, organizationID, resourceType, resourceID)
	if err != nil {
		return false, err
	}
	_, ok := permissions[permissionCode]
	return ok, nil
}

func hasAnyResourcePermission(tx *gorm.DB, principal *Principal, organizationID, resourceType, resourceID string, permissionCodes ...string) (bool, error) {
	for _, permissionCode := range permissionCodes {
		ok, err := hasResourcePermission(tx, principal, organizationID, resourceType, resourceID, permissionCode)
		if err != nil {
			return false, err
		}
		if ok {
			return true, nil
		}
	}
	return false, nil
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
// organization-wide policy-binding-derived permissions for one principal,
// scoped to one organization. It's a thin wrapper over
// effectivePermissionsForPrincipalScoped with an empty resource — see that
// function for resource-scoped resolution.
func effectivePermissionsForPrincipal(tx *gorm.DB, principal *Principal, organizationID string) (map[string]struct{}, error) {
	return effectivePermissionsForPrincipalScoped(tx, principal, organizationID, "", "")
}

// effectivePermissionsForPrincipalScoped resolves the union of role-derived
// and policy-binding-derived permissions for one principal, scoped to one
// organization and optionally one resource within it. Every query here is
// scoped by organization_id (indexed), never a full-table scan of every
// tenant's data.
//
// resourceType/resourceID identify the resource the caller is checking
// access to, if any. Passing both empty resolves organization-wide
// permissions only (bindings scoped to a specific resource never match —
// see bindingMatchesPrincipal). Passing a resource additionally credits
// bindings scoped to exactly that resource; organization-wide bindings
// always match regardless.
func effectivePermissionsForPrincipalScoped(tx *gorm.DB, principal *Principal, organizationID, resourceType, resourceID string) (map[string]struct{}, error) {
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
	if err := tx.Where("user_id = ? AND organization_id = ? AND status <> ?", principal.User.ID, organizationID, "blocked").Find(&memberships).Error; err != nil {
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
		if bindingMatchesPrincipal(binding, roleCodes, groupIDs, principal.User.ID, resourceType, resourceID) {
			for _, permissionCode := range binding.PermissionCodes {
				permissions[permissionCode] = struct{}{}
			}
		}
	}
	return permissions, nil
}

// sortedPermissionCodes turns a permission set into a deterministic slice
// for JSON responses (map iteration order is otherwise random).
func sortedPermissionCodes(permissions map[string]struct{}) []string {
	codes := make([]string, 0, len(permissions))
	for code := range permissions {
		codes = append(codes, code)
	}
	sort.Strings(codes)
	return codes
}

// bindingMatchesPrincipal checks both dimensions of a binding: WHO it's
// granted to (subject: user/group/role) and WHAT resource it applies to.
// An organization-wide binding (empty ResourceType) matches any requested
// resource, including no resource at all — that's what makes existing
// bindings keep working unchanged. A resource-scoped binding only matches
// when the caller is checking access to that exact resource; it never
// satisfies an organization-wide check (resourceType/resourceID == "").
func bindingMatchesPrincipal(binding sdb.PolicyBinding, roleCodes, groupIDs map[string]struct{}, userID, resourceType, resourceID string) bool {
	subjectMatches := false
	switch binding.SubjectType {
	case policySubjectUser:
		subjectMatches = binding.SubjectID == userID
	case policySubjectGroup:
		_, subjectMatches = groupIDs[binding.SubjectID]
	case policySubjectRole:
		_, subjectMatches = roleCodes[binding.SubjectID]
	}
	if !subjectMatches {
		return false
	}
	if binding.ResourceType == "" {
		return true
	}
	return binding.ResourceType == resourceType && binding.ResourceID == resourceID
}

// requirePermissionsWithinCallerScope ensures every code in `codes` is
// already held by principal within organizationID (platform admins always
// pass). Use this wherever an action GRANTS permissions to someone or
// something else — assigning a role to a membership, defining what a policy
// binding grants, defining a custom role's permission set — so a principal
// can never hand out more than they themselves currently hold.
//
// Added 2026-08-06: none of role assignment, policy bindings, or custom role
// definitions checked this before. Holding only members.manage (an "admin"
// role permission, not "owner") was enough to assign the "owner" role —
// including organization.delete — to any membership, including your own.
// Holding only policies.manage or roles.manage was enough to grant, via a
// policy binding or a custom role, any permission in the catalog regardless
// of what the grantor actually held. This closes all three the same way.
// resourceType/resourceID identify the scope of the binding/role being
// granted, not the caller. Granting an organization-wide permission
// (resourceType == "") requires the caller to hold it organization-wide —
// a permission the caller only holds on one resource does not satisfy this,
// by construction of bindingMatchesPrincipal, so a resource-scoped grant can
// never be used to escalate to organization-wide. Granting a resource-scoped
// permission requires the caller to hold it on that same resource, or
// organization-wide (which always covers every resource).
func requirePermissionsWithinCallerScope(tx *gorm.DB, principal *Principal, organizationID, resourceType, resourceID string, codes []string) error {
	if principal == nil {
		return ErrUnauthorized("authentication required")
	}
	if principal.User.IsAdmin {
		return nil
	}
	callerPermissions, err := effectivePermissionsForPrincipalScoped(tx, principal, organizationID, resourceType, resourceID)
	if err != nil {
		return err
	}
	for _, code := range codes {
		if _, ok := callerPermissions[code]; !ok {
			return ErrForbidden("cannot grant a permission you do not hold: " + code)
		}
	}
	return nil
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

// requireResourcePermission is the resource-scoped counterpart of
// requireOrganizationPermission: it passes if the principal holds any of
// permissionCodes either organization-wide or specifically on
// (resourceType, resourceID).
func requireResourcePermission(tx *gorm.DB, principal *Principal, organizationID, resourceType, resourceID string, permissionCodes ...string) error {
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
	ok, err := hasAnyResourcePermission(tx, principal, organizationID, resourceType, resourceID, permissionCodes...)
	if err != nil {
		return err
	}
	if ok {
		return nil
	}
	return ErrForbidden("organization permission denied")
}

// CheckResourcePermission is the exported form of requireResourcePermission,
// for sibling control-plane packages (e.g. knowledge) that need to gate an
// action on one specific resource (e.g. one Corpus) rather than the whole
// organization. Same tx-handle requirement as CheckOrganizationPermission.
func (s *Service) CheckResourcePermission(tx *gorm.DB, principal *Principal, organizationID, resourceType, resourceID string, permissionCodes ...string) error {
	return requireResourcePermission(tx, principal, organizationID, resourceType, resourceID, permissionCodes...)
}

// HasResourceScopedBindings reports whether at least one PolicyBinding is
// scoped to exactly (resourceType, resourceID) within organizationID -
// regardless of which subject it grants to. Callers use this to decide
// whether a resource is in its default "open to every org member" state or
// has been switched into an opt-in allowlist by the presence of any binding
// at all; the actual authorization decision still goes through
// CheckResourcePermission/HasAnyResourcePermission.
func (s *Service) HasResourceScopedBindings(tx *gorm.DB, organizationID, resourceType, resourceID string) (bool, error) {
	var count int64
	err := tx.Model(&sdb.PolicyBinding{}).
		Where("organization_id = ? AND resource_type = ? AND resource_id = ?", organizationID, resourceType, resourceID).
		Count(&count).Error
	if err != nil {
		return false, err
	}
	return count > 0, nil
}

// HasAnyResourcePermission is the exported form of hasAnyResourcePermission,
// for sibling packages that need a boolean check (not an error-returning
// gate) on one specific resource - e.g. filtering a list down to only the
// items a principal is allowed to see, rather than rejecting a single
// request outright.
func (s *Service) HasAnyResourcePermission(tx *gorm.DB, principal *Principal, organizationID, resourceType, resourceID string, permissionCodes ...string) (bool, error) {
	return hasAnyResourcePermission(tx, principal, organizationID, resourceType, resourceID, permissionCodes...)
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

// IsOrganizationMember reports whether userID currently has a non-blocked
// membership in organizationID - the same coarse check canAccessOrganization
// makes internally, but for a bare userID with no live Principal to wrap it
// in (e.g. automation's cloud-job execution resolving MCP servers on behalf
// of a ScheduledJob's creator, not an authenticated HTTP caller). No
// IsAdmin fast-path, unlike canAccessOrganization - a job's creator being a
// platform admin doesn't change whose per-employee connected account gets
// bridged, and platform admins get a real membership row like anyone else
// in every organization they actually manage.
func (s *Service) IsOrganizationMember(tx *gorm.DB, userID, organizationID string) (bool, error) {
	var count int64
	if err := tx.Model(&sdb.Membership{}).Where("user_id = ? AND organization_id = ? AND status <> ?", userID, organizationID, "blocked").Count(&count).Error; err != nil {
		return false, err
	}
	return count > 0, nil
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
	if err := tx.Model(&sdb.Membership{}).Where("user_id = ? AND organization_id = ? AND status <> ?", principal.User.ID, organizationID, "blocked").Count(&count).Error; err != nil {
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
		ScimExternalID: record.ScimExternalID,
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
		ResourceType:    record.ResourceType,
		ResourceID:      record.ResourceID,
		CreatedAt:       record.CreatedAt,
		UpdatedAt:       record.UpdatedAt,
	}
}
