package iam

import (
	"context"
	"errors"
	"strings"
	"time"

	"gorm.io/gorm"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
)

// Desktop policy codes - the fixed, code-defined catalog (see
// desktopPolicyCatalog). Adding a new policy means adding a new constant +
// catalog entry here, never letting an admin invent an arbitrary code: only
// the *assignment* of these fixed policies to a subject is admin-controlled
// data (DesktopPolicyBinding).
const (
	DesktopPolicyAllowCustomProviders      = "allow_custom_providers"
	DesktopPolicyAllowLocalModels          = "allow_local_models"
	DesktopPolicyAllowMultipleWorkspaces   = "allow_multiple_workspaces"
	DesktopPolicyAllowSettingsModification = "allow_settings_modification"
)

// desktopPolicySubjectOrg is a subject type PolicyBinding has no equivalent
// for: PolicyBinding's "org-wide" is an empty ResourceType, never a
// distinct subject, because every PolicyBinding grant already flows through
// a real role/user/group. A desktop policy needs an explicit way to
// restrict literally everyone in the organization without threading the
// restriction through every role.
const desktopPolicySubjectOrg = "org"

// DesktopPolicy is one entry from the fixed desktop-policy catalog - see
// docs/helps/audit-2026-08-29-openwork-den-comparison.md § 5 for the
// research and decisions behind this shape (declarative catalog, not
// scattered booleans).
type DesktopPolicy struct {
	Code               string `json:"code"`
	AdminDescription   string `json:"admin_description"`
	UserBlockedMessage string `json:"user_blocked_message"`
	// DefaultValue is what an organization gets when no binding at all
	// applies to a given subject - not to be confused with a desktop
	// client's own fail-open behavior when it has never synced any bundle
	// (a purely client-side concept, see ResolveDesktopPolicies's doc
	// comment and the desktop-side PolicyStore built in a later stage).
	DefaultValue bool `json:"default_value"`
}

// desktopPolicyCatalog is intentionally small and code-defined (mirrors
// permissionCatalog's own shape) - every policy here defaults to true
// (unrestricted) so no existing installation is suddenly broken; an org
// opts into restricting via DesktopPolicyBinding rows, never the reverse.
func desktopPolicyCatalog() []DesktopPolicy {
	return []DesktopPolicy{
		{
			Code:               DesktopPolicyAllowCustomProviders,
			AdminDescription:   "Allow adding a custom LLM provider (a base URL outside the built-in catalog) rather than only the providers Seshat ships with.",
			UserBlockedMessage: "Your organization does not allow adding custom providers.",
			DefaultValue:       true,
		},
		{
			Code:               DesktopPolicyAllowLocalModels,
			AdminDescription:   "Allow connecting to a local model runtime (e.g. Ollama) instead of only cloud providers.",
			UserBlockedMessage: "Your organization does not allow using local models.",
			DefaultValue:       true,
		},
		{
			Code:               DesktopPolicyAllowMultipleWorkspaces,
			AdminDescription:   "Allow creating more than one workspace on a single device.",
			UserBlockedMessage: "Your organization only allows a single workspace on this device.",
			DefaultValue:       true,
		},
		{
			Code:               DesktopPolicyAllowSettingsModification,
			AdminDescription:   "Allow changing local settings (providers, MCP servers, knowledge sources, and similar) on the device.",
			UserBlockedMessage: "Your organization does not allow modifying settings on this device.",
			DefaultValue:       true,
		},
	}
}

func desktopPolicyCatalogSet() map[string]DesktopPolicy {
	catalog := map[string]DesktopPolicy{}
	for _, policy := range desktopPolicyCatalog() {
		catalog[policy.Code] = policy
	}
	return catalog
}

// DesktopPolicyBinding is the service-layer mirror of
// sdb.DesktopPolicyBinding - see that type's doc comment for the full
// design rationale (own table, own subject vocabulary, AND resolution).
type DesktopPolicyBinding struct {
	ID             string    `json:"id"`
	OrganizationID string    `json:"organization_id"`
	PolicyCode     string    `json:"policy_code"`
	SubjectType    string    `json:"subject_type"`
	SubjectID      string    `json:"subject_id"`
	Value          bool      `json:"value"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

func toDesktopPolicyBinding(record sdb.DesktopPolicyBinding) DesktopPolicyBinding {
	return DesktopPolicyBinding{
		ID:             record.ID,
		OrganizationID: record.OrganizationID,
		PolicyCode:     record.PolicyCode,
		SubjectType:    record.SubjectType,
		SubjectID:      record.SubjectID,
		Value:          record.Value,
		CreatedAt:      record.CreatedAt,
		UpdatedAt:      record.UpdatedAt,
	}
}

// ListDesktopPolicyCatalog exposes the server-defined desktop policy
// catalog - any authenticated member can read it (it's not org-specific
// data), mirroring ListPermissions.
func (s *Service) ListDesktopPolicyCatalog(ctx context.Context, principal *Principal) ([]DesktopPolicy, error) {
	_ = ctx
	if principal == nil {
		return nil, ErrUnauthorized("authentication required")
	}
	return desktopPolicyCatalog(), nil
}

// ListDesktopPolicyBindings returns every DesktopPolicyBinding for
// organizationID. Deliberately unpaginated, unlike ListPolicyBindings: the
// dataset is bounded by (catalog size) x (roles + teams + members an admin
// actually bothers to override), realistically a handful of rows per
// organization, not something that grows without bound.
func (s *Service) ListDesktopPolicyBindings(ctx context.Context, principal *Principal, organizationID string) ([]DesktopPolicyBinding, error) {
	if principal == nil {
		return nil, ErrUnauthorized("authentication required")
	}
	organizationID = strings.TrimSpace(organizationID)
	if organizationID == "" {
		return nil, ErrInvalidInput("organization_id is required")
	}
	tx := s.db.Gorm().WithContext(ctx)
	if err := requireOrganizationPermission(tx, principal, organizationID, "desktop_policies.read", "desktop_policies.manage", "organization.manage"); err != nil {
		return nil, err
	}
	var records []sdb.DesktopPolicyBinding
	if err := tx.Where("organization_id = ?", organizationID).
		Order("policy_code, subject_type, subject_id").
		Find(&records).Error; err != nil {
		return nil, err
	}
	bindings := make([]DesktopPolicyBinding, 0, len(records))
	for _, record := range records {
		bindings = append(bindings, toDesktopPolicyBinding(record))
	}
	return bindings, nil
}

// SetDesktopPolicyBindingParams identifies a subject (org/role/user/group)
// and the value to assign it for one policy code. Upsert semantics: an
// admin re-targeting the same subject updates the existing row's Value
// rather than accumulating duplicates - enforced by
// DesktopPolicyBinding's own unique index either way, but this method finds
// and updates the existing row directly instead of relying on the caller to
// retry after a conflict.
type SetDesktopPolicyBindingParams struct {
	OrganizationID string `json:"organization_id"`
	PolicyCode     string `json:"policy_code"`
	SubjectType    string `json:"subject_type"`
	SubjectID      string `json:"subject_id"`
	Value          bool   `json:"value"`
}

// SetDesktopPolicyBinding creates or updates the binding for
// (organization, policy_code, subject_type, subject_id).
func (s *Service) SetDesktopPolicyBinding(ctx context.Context, principal *Principal, params SetDesktopPolicyBindingParams) (*DesktopPolicyBinding, error) {
	if principal == nil {
		return nil, ErrUnauthorized("authentication required")
	}
	organizationID := strings.TrimSpace(params.OrganizationID)
	if organizationID == "" {
		return nil, ErrInvalidInput("organization_id is required")
	}
	policyCode, err := validateDesktopPolicyCode(params.PolicyCode)
	if err != nil {
		return nil, err
	}
	subjectType, subjectID, err := normalizeDesktopPolicySubject(params.SubjectType, params.SubjectID)
	if err != nil {
		return nil, err
	}

	var binding *DesktopPolicyBinding
	err = s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		if err := requireOrganizationPermission(tx, principal, organizationID, "desktop_policies.manage", "organization.manage"); err != nil {
			return err
		}
		if err := validateDesktopPolicySubject(tx, organizationID, subjectType, subjectID); err != nil {
			return err
		}

		now := time.Now().UTC()
		var existing sdb.DesktopPolicyBinding
		err := tx.Where("organization_id = ? AND policy_code = ? AND subject_type = ? AND subject_id = ?",
			organizationID, policyCode, subjectType, subjectID).First(&existing).Error
		switch {
		case err == nil:
			existing.Value = params.Value
			existing.UpdatedAt = now
			if err := tx.Save(&existing).Error; err != nil {
				return err
			}
			if err := appendAuditEvent(tx, principal, organizationID, "desktop_policy_binding.updated", "desktop_policy_binding", existing.ID,
				map[string]string{"policy_code": policyCode, "subject_type": subjectType, "subject_id": subjectID}); err != nil {
				return err
			}
			converted := toDesktopPolicyBinding(existing)
			binding = &converted
			return nil
		case errors.Is(err, gorm.ErrRecordNotFound):
			bindingID, err := newID("dpb")
			if err != nil {
				return err
			}
			record := sdb.DesktopPolicyBinding{
				ID: bindingID, OrganizationID: organizationID, PolicyCode: policyCode,
				SubjectType: subjectType, SubjectID: subjectID, Value: params.Value,
				CreatedAt: now, UpdatedAt: now,
			}
			if err := tx.Create(&record).Error; err != nil {
				return err
			}
			if err := appendAuditEvent(tx, principal, organizationID, "desktop_policy_binding.created", "desktop_policy_binding", record.ID,
				map[string]string{"policy_code": policyCode, "subject_type": subjectType, "subject_id": subjectID}); err != nil {
				return err
			}
			converted := toDesktopPolicyBinding(record)
			binding = &converted
			return nil
		default:
			return err
		}
	})
	return binding, err
}

// DeleteDesktopPolicyBinding removes one binding by id - the affected
// subject falls back to whatever the next-most-specific applicable binding
// says, or the catalog default if none remain.
func (s *Service) DeleteDesktopPolicyBinding(ctx context.Context, principal *Principal, bindingID string) error {
	if principal == nil {
		return ErrUnauthorized("authentication required")
	}
	bindingID = strings.TrimSpace(bindingID)
	if bindingID == "" {
		return ErrInvalidInput("binding_id is required")
	}
	return s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		var record sdb.DesktopPolicyBinding
		if err := tx.First(&record, "id = ?", bindingID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrNotFound("desktop policy binding not found")
			}
			return err
		}
		if err := requireOrganizationPermission(tx, principal, record.OrganizationID, "desktop_policies.manage", "organization.manage"); err != nil {
			return err
		}
		if err := tx.Delete(&sdb.DesktopPolicyBinding{}, "id = ?", bindingID).Error; err != nil {
			return err
		}
		return appendAuditEvent(tx, principal, record.OrganizationID, "desktop_policy_binding.deleted", "desktop_policy_binding", record.ID,
			map[string]string{"policy_code": record.PolicyCode, "subject_type": record.SubjectType, "subject_id": record.SubjectID})
	})
}

// ResolveDesktopPolicies computes the effective value of every catalog
// policy for userID within organizationID: the catalog default, ANDed with
// every applicable binding (org-wide, the user's role(s), the user
// directly, every team/group they belong to) - see
// docs/helps/audit-2026-08-29-openwork-den-comparison.md § 5 for why AND
// ("most restrictive wins") was chosen over an OR scheme. Once any
// applicable source says false, the result stays false regardless of what
// any other applicable source says - there is no mechanism for a
// more-specific binding to carve out an exception to a broader restriction.
//
// This resolves for a specific user, not a *Principal, because its only
// caller (the device heartbeat, added in a later stage) only has
// Device.RegisteredByUserID on hand, not a full authenticated session.
// Takes a *gorm.DB directly (like CheckResourcePermission), not a context,
// since call sites already hold a tx with context attached.
func (s *Service) ResolveDesktopPolicies(tx *gorm.DB, organizationID, userID string) (map[string]bool, error) {
	catalog := desktopPolicyCatalog()
	result := make(map[string]bool, len(catalog))
	for _, policy := range catalog {
		result[policy.Code] = policy.DefaultValue
	}

	var membership sdb.Membership
	roleCodes := map[string]struct{}{}
	err := tx.Where("organization_id = ? AND user_id = ?", organizationID, userID).First(&membership).Error
	switch {
	case err == nil:
		roleCodes[normalizeRole(membership.Role)] = struct{}{}
	case errors.Is(err, gorm.ErrRecordNotFound):
		// No membership - only org-wide bindings can apply below.
	default:
		return nil, err
	}

	var groupMemberships []sdb.GroupMember
	if err := tx.Where("organization_id = ? AND user_id = ?", organizationID, userID).Find(&groupMemberships).Error; err != nil {
		return nil, err
	}
	groupIDs := map[string]struct{}{}
	for _, gm := range groupMemberships {
		groupIDs[gm.GroupID] = struct{}{}
	}

	var bindings []sdb.DesktopPolicyBinding
	if err := tx.Where("organization_id = ?", organizationID).Find(&bindings).Error; err != nil {
		return nil, err
	}
	for _, binding := range bindings {
		if binding.Value {
			// A true binding can never loosen the result below the
			// catalog default (AND's identity element) - only a false
			// binding can ever change anything.
			continue
		}
		if _, known := result[binding.PolicyCode]; !known {
			continue // stale/removed catalog code - ignore rather than error
		}
		if desktopPolicyBindingMatches(binding, roleCodes, groupIDs, userID) {
			result[binding.PolicyCode] = false
		}
	}
	return result, nil
}

func desktopPolicyBindingMatches(binding sdb.DesktopPolicyBinding, roleCodes, groupIDs map[string]struct{}, userID string) bool {
	switch binding.SubjectType {
	case desktopPolicySubjectOrg:
		return true
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

func validateDesktopPolicyCode(code string) (string, error) {
	code = strings.ToLower(strings.TrimSpace(code))
	if _, ok := desktopPolicyCatalogSet()[code]; !ok {
		return "", ErrInvalidInput("unsupported policy_code")
	}
	return code, nil
}

// normalizeDesktopPolicySubject validates subjectType and normalizes
// subjectID - "org" must carry no subject_id (there's exactly one org-wide
// binding per policy code per organization, enforced by the unique index),
// every other subject type requires one.
func normalizeDesktopPolicySubject(subjectType, subjectID string) (string, string, error) {
	subjectType = strings.ToLower(strings.TrimSpace(subjectType))
	subjectID = strings.TrimSpace(subjectID)
	switch subjectType {
	case desktopPolicySubjectOrg:
		if subjectID != "" {
			return "", "", ErrInvalidInput("subject_id must be empty for an org-wide binding")
		}
		return subjectType, "", nil
	case policySubjectUser, policySubjectGroup, policySubjectRole:
		if subjectID == "" {
			return "", "", ErrInvalidInput("subject_id is required for this subject_type")
		}
		return subjectType, subjectID, nil
	default:
		return "", "", ErrInvalidInput("unsupported subject_type")
	}
}

func validateDesktopPolicySubject(tx *gorm.DB, organizationID, subjectType, subjectID string) error {
	switch subjectType {
	case desktopPolicySubjectOrg:
		return nil
	case policySubjectUser:
		_, exists, err := findMembershipByUserAndOrganization(tx, subjectID, organizationID)
		if err != nil {
			return err
		}
		if !exists {
			return ErrInvalidInput("policy user subject must belong to the organization")
		}
		return nil
	case policySubjectGroup:
		var group sdb.Group
		if err := tx.First(&group, "id = ?", subjectID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrNotFound("group not found")
			}
			return err
		}
		if group.OrganizationID != organizationID {
			return ErrInvalidInput("group subject must belong to the same organization")
		}
		return nil
	case policySubjectRole:
		_, err := validateRoleCodeForOrganization(tx, organizationID, subjectID)
		return err
	default:
		return ErrInvalidInput("unsupported subject_type")
	}
}
