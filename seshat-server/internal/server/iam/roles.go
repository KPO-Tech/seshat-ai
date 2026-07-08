package iam

import (
	"context"
	"errors"
	"regexp"
	"sort"
	"strings"
	"time"

	"gorm.io/gorm"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
)

var roleCodePattern = regexp.MustCompile(`^[a-z0-9][a-z0-9_-]{0,63}$`)

// Role describes one supported organization role.
type Role struct {
	ID             string    `json:"id,omitempty"`
	OrganizationID string    `json:"organization_id,omitempty"`
	Code           string    `json:"code"`
	Name           string    `json:"name"`
	Description    string    `json:"description"`
	Permissions    []string  `json:"permissions"`
	System         bool      `json:"system"`
	CreatedAt      time.Time `json:"created_at,omitempty"`
	UpdatedAt      time.Time `json:"updated_at,omitempty"`
}

type CreateRoleParams struct {
	OrganizationID string   `json:"organization_id"`
	Code           string   `json:"code"`
	Name           string   `json:"name"`
	Description    string   `json:"description"`
	Permissions    []string `json:"permissions"`
}

type UpdateRoleParams struct {
	OrganizationID string   `json:"organization_id"`
	Code           string   `json:"code"`
	Name           string   `json:"name"`
	Description    string   `json:"description"`
	Permissions    []string `json:"permissions"`
}

// ListRoles returns the supported role catalog. Without an organization scope,
// only system roles are exposed.
func (s *Service) ListRoles(ctx context.Context, principal *Principal, organizationID string) ([]Role, error) {
	if principal == nil {
		return nil, ErrUnauthorized("authentication required")
	}

	organizationID = strings.TrimSpace(organizationID)
	if organizationID == "" {
		return roleCatalog(), nil
	}

	tx := s.db.Gorm().WithContext(ctx)
	if err := requireOrganizationPermission(tx, principal, organizationID, "roles.read", "roles.manage", "members.manage", "invitations.manage", "organization.manage"); err != nil {
		return nil, err
	}

	roles := roleCatalog()
	var records []sdb.CustomRole
	if err := tx.Where("organization_id = ?", organizationID).Order("code asc").Find(&records).Error; err != nil {
		return nil, err
	}
	for _, record := range records {
		roles = append(roles, toRole(record))
	}
	sort.Slice(roles, func(i, j int) bool { return roles[i].Code < roles[j].Code })
	return roles, nil
}

func (s *Service) GetRole(ctx context.Context, principal *Principal, organizationID, roleCode string) (*Role, error) {
	if principal == nil {
		return nil, ErrUnauthorized("authentication required")
	}
	roleCode = strings.TrimSpace(roleCode)
	if roleCode == "" {
		return nil, ErrInvalidInput("role_code is required")
	}
	organizationID = strings.TrimSpace(organizationID)
	if organizationID == "" {
		role, ok := systemRoleByCode(normalizeRole(roleCode))
		if !ok {
			return nil, ErrNotFound("role not found")
		}
		return &role, nil
	}

	tx := s.db.Gorm().WithContext(ctx)
	if err := requireOrganizationPermission(tx, principal, organizationID, "roles.read", "roles.manage", "members.manage", "invitations.manage", "organization.manage"); err != nil {
		return nil, err
	}
	role, ok, err := findRoleByCode(tx, organizationID, roleCode)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, ErrNotFound("role not found")
	}
	return &role, nil
}

func (s *Service) CreateRole(ctx context.Context, principal *Principal, params CreateRoleParams) (*Role, error) {
	if principal == nil {
		return nil, ErrUnauthorized("authentication required")
	}
	organizationID := strings.TrimSpace(params.OrganizationID)
	name := strings.TrimSpace(params.Name)
	description := strings.TrimSpace(params.Description)
	if organizationID == "" || name == "" {
		return nil, ErrInvalidInput("organization_id and name are required")
	}
	code, err := validateNewCustomRoleCode(params.Code)
	if err != nil {
		return nil, err
	}
	permissions, err := validatePermissionCodes(params.Permissions)
	if err != nil {
		return nil, err
	}

	var role *Role
	err = s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		if err := requireOrganizationPermission(tx, principal, organizationID, "roles.manage", "organization.manage"); err != nil {
			return err
		}
		var existing int64
		if err := tx.Model(&sdb.CustomRole{}).Where("organization_id = ? AND code = ?", organizationID, code).Count(&existing).Error; err != nil {
			return err
		}
		if existing > 0 {
			return ErrConflict("role code already exists in the organization")
		}
		now := time.Now().UTC()
		roleID, err := newID("rol")
		if err != nil {
			return err
		}
		record := sdb.CustomRole{
			ID:              roleID,
			OrganizationID:  organizationID,
			Code:            code,
			Name:            name,
			Description:     description,
			PermissionCodes: permissions,
			CreatedAt:       now,
			UpdatedAt:       now,
		}
		if err := tx.Create(&record).Error; err != nil {
			if isUniqueConstraintError(err) {
				return ErrConflict("role code already exists in the organization")
			}
			return err
		}
		if err := appendAuditEvent(tx, principal, organizationID, "role.created", "role", record.Code, map[string]string{"role_code": record.Code}); err != nil {
			return err
		}
		converted := toRole(record)
		role = &converted
		return nil
	})
	return role, err
}

func (s *Service) UpdateRole(ctx context.Context, principal *Principal, roleCode string, params UpdateRoleParams) (*Role, error) {
	if principal == nil {
		return nil, ErrUnauthorized("authentication required")
	}
	organizationID := strings.TrimSpace(params.OrganizationID)
	currentCode, err := normalizeRoleCodeInput(roleCode)
	if err != nil {
		return nil, ErrInvalidInput("role_code is required")
	}
	name := strings.TrimSpace(params.Name)
	description := strings.TrimSpace(params.Description)
	if organizationID == "" || name == "" {
		return nil, ErrInvalidInput("organization_id and name are required")
	}
	newCode := currentCode
	if strings.TrimSpace(params.Code) != "" {
		newCode, err = validateNewCustomRoleCode(params.Code)
		if err != nil {
			return nil, err
		}
	}
	permissions, err := validatePermissionCodes(params.Permissions)
	if err != nil {
		return nil, err
	}

	var role *Role
	err = s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		if err := requireOrganizationPermission(tx, principal, organizationID, "roles.manage", "organization.manage"); err != nil {
			return err
		}
		record, ok, err := findCustomRoleRecord(tx, organizationID, currentCode)
		if err != nil {
			return err
		}
		if !ok {
			if _, isSystem := systemRoleByCode(currentCode); isSystem {
				return ErrConflict("system roles cannot be modified")
			}
			return ErrNotFound("role not found")
		}
		if newCode != currentCode {
			var existing int64
			if err := tx.Model(&sdb.CustomRole{}).Where("organization_id = ? AND code = ? AND id <> ?", organizationID, newCode, record.ID).Count(&existing).Error; err != nil {
				return err
			}
			if existing > 0 {
				return ErrConflict("role code already exists in the organization")
			}
		}

		now := time.Now().UTC()
		oldCode := record.Code
		record.Code = newCode
		record.Name = name
		record.Description = description
		record.PermissionCodes = permissions
		record.UpdatedAt = now
		if err := tx.Save(&record).Error; err != nil {
			if isUniqueConstraintError(err) {
				return ErrConflict("role code already exists in the organization")
			}
			return err
		}
		if newCode != oldCode {
			if err := tx.Model(&sdb.Membership{}).Where("organization_id = ? AND role = ?", organizationID, oldCode).Update("role", newCode).Error; err != nil {
				return err
			}
			if err := tx.Model(&sdb.Invitation{}).Where("organization_id = ? AND role = ?", organizationID, oldCode).Update("role", newCode).Error; err != nil {
				return err
			}
			if err := tx.Model(&sdb.PolicyBinding{}).Where("organization_id = ? AND subject_type = ? AND subject_id = ?", organizationID, policySubjectRole, oldCode).Updates(map[string]any{"subject_id": newCode, "updated_at": now}).Error; err != nil {
				return err
			}
		}
		if err := appendAuditEvent(tx, principal, organizationID, "role.updated", "role", record.Code, map[string]string{"old_role_code": oldCode, "role_code": record.Code}); err != nil {
			return err
		}
		converted := toRole(record)
		role = &converted
		return nil
	})
	return role, err
}

func (s *Service) DeleteRole(ctx context.Context, principal *Principal, organizationID, roleCode string) error {
	if principal == nil {
		return ErrUnauthorized("authentication required")
	}
	organizationID = strings.TrimSpace(organizationID)
	code, err := normalizeRoleCodeInput(roleCode)
	if err != nil {
		return ErrInvalidInput("role_code is required")
	}
	if organizationID == "" {
		return ErrInvalidInput("organization_id is required")
	}

	return s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		if err := requireOrganizationPermission(tx, principal, organizationID, "roles.manage", "organization.manage"); err != nil {
			return err
		}
		record, ok, err := findCustomRoleRecord(tx, organizationID, code)
		if err != nil {
			return err
		}
		if !ok {
			if _, isSystem := systemRoleByCode(code); isSystem {
				return ErrConflict("system roles cannot be deleted")
			}
			return ErrNotFound("role not found")
		}
		var membershipCount int64
		if err := tx.Model(&sdb.Membership{}).Where("organization_id = ? AND role = ?", organizationID, code).Count(&membershipCount).Error; err != nil {
			return err
		}
		if membershipCount > 0 {
			return ErrConflict("cannot delete a role that is still assigned to memberships")
		}
		var pendingCount int64
		if err := tx.Model(&sdb.Invitation{}).Where("organization_id = ? AND role = ? AND status = ? AND expires_at > ?", organizationID, code, "pending", time.Now().UTC()).Count(&pendingCount).Error; err != nil {
			return err
		}
		if pendingCount > 0 {
			return ErrConflict("cannot delete a role with active invitations")
		}
		if err := tx.Where("organization_id = ? AND subject_type = ? AND subject_id = ?", organizationID, policySubjectRole, code).Delete(&sdb.PolicyBinding{}).Error; err != nil {
			return err
		}
		if err := tx.Delete(&sdb.CustomRole{}, "id = ?", record.ID).Error; err != nil {
			return err
		}
		return appendAuditEvent(tx, principal, organizationID, "role.deleted", "role", record.Code, map[string]string{"role_code": record.Code})
	})
}

func roleCatalog() []Role {
	roles := []Role{
		{
			Code:        "owner",
			Name:        "Owner",
			Description: "Full organization control including destructive administration.",
			Permissions: []string{"organization.manage", "organization.delete", "members.read", "members.manage", "roles.read", "roles.manage", "applications.read", "applications.manage", "providers.read", "providers.manage", "invitations.read", "invitations.manage", "groups.read", "groups.manage", "policies.read", "policies.manage", "audit.read", "devices.read", "devices.manage", "jobs.read", "jobs.manage"},
			System:      true,
		},
		{
			Code:        "admin",
			Name:        "Admin",
			Description: "Administrative access for users, applications, providers, invitations and roles.",
			Permissions: []string{"organization.manage", "members.read", "members.manage", "roles.read", "roles.manage", "applications.read", "applications.manage", "providers.read", "providers.manage", "invitations.read", "invitations.manage", "groups.read", "groups.manage", "policies.read", "policies.manage", "audit.read", "devices.read", "devices.manage", "jobs.read", "jobs.manage"},
			System:      true,
		},
		{
			Code:        "member",
			Name:        "Member",
			Description: "Standard collaborator access inside the organization.",
			Permissions: []string{"organization.read", "organization.use"},
			System:      true,
		},
		{
			Code:        "viewer",
			Name:        "Viewer",
			Description: "Read-only access intended for audits, observers or support flows.",
			Permissions: []string{"organization.read"},
			System:      true,
		},
	}
	sort.Slice(roles, func(i, j int) bool { return roles[i].Code < roles[j].Code })
	return roles
}

func systemRoleByCode(role string) (Role, bool) {
	role = normalizeRole(role)
	for _, supported := range roleCatalog() {
		if supported.Code == role {
			return supported, true
		}
	}
	return Role{}, false
}

func canonicalRoleCode(role string) (string, error) {
	role = normalizeRole(role)
	if _, ok := systemRoleByCode(role); ok {
		return role, nil
	}
	return "", ErrInvalidInput("unsupported role")
}

func normalizeRole(role string) string {
	return strings.ToLower(strings.TrimSpace(role))
}

func normalizeRoleCodeInput(role string) (string, error) {
	role = normalizeRole(role)
	if role == "" {
		return "", ErrInvalidInput("role code is required")
	}
	if !roleCodePattern.MatchString(role) {
		return "", ErrInvalidInput("role code must contain only lowercase letters, digits, hyphen or underscore")
	}
	return role, nil
}

func validateNewCustomRoleCode(role string) (string, error) {
	code, err := normalizeRoleCodeInput(role)
	if err != nil {
		return "", err
	}
	if _, ok := systemRoleByCode(code); ok {
		return "", ErrConflict("system role codes are reserved")
	}
	return code, nil
}

func validateRoleCodeForOrganization(tx *gorm.DB, organizationID, role string) (string, error) {
	code, err := normalizeRoleCodeInput(role)
	if err != nil {
		return "", err
	}
	if _, ok := systemRoleByCode(code); ok {
		return code, nil
	}
	var count int64
	if err := tx.Model(&sdb.CustomRole{}).Where("organization_id = ? AND code = ?", organizationID, code).Count(&count).Error; err != nil {
		return "", err
	}
	if count == 0 {
		return "", ErrInvalidInput("unsupported role")
	}
	return code, nil
}

func findRoleByCode(tx *gorm.DB, organizationID, roleCode string) (Role, bool, error) {
	code, err := normalizeRoleCodeInput(roleCode)
	if err != nil {
		return Role{}, false, err
	}
	if role, ok := systemRoleByCode(code); ok {
		return role, true, nil
	}
	record, ok, err := findCustomRoleRecord(tx, organizationID, code)
	if err != nil || !ok {
		return Role{}, ok, err
	}
	role := toRole(record)
	return role, true, nil
}

func findCustomRoleRecord(tx *gorm.DB, organizationID, code string) (sdb.CustomRole, bool, error) {
	var record sdb.CustomRole
	err := tx.Where("organization_id = ? AND code = ?", organizationID, code).First(&record).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return sdb.CustomRole{}, false, nil
		}
		return sdb.CustomRole{}, false, err
	}
	return record, true, nil
}

func toRole(record sdb.CustomRole) Role {
	return Role{
		ID:             record.ID,
		OrganizationID: record.OrganizationID,
		Code:           record.Code,
		Name:           record.Name,
		Description:    record.Description,
		Permissions:    append([]string(nil), record.PermissionCodes...),
		System:         false,
		CreatedAt:      record.CreatedAt,
		UpdatedAt:      record.UpdatedAt,
	}
}
