package iam

import (
	"context"
	"errors"
	"strings"
	"time"

	"gorm.io/gorm"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
)

type CreatePolicyBindingParams struct {
	OrganizationID  string   `json:"organization_id"`
	Name            string   `json:"name"`
	Description     string   `json:"description"`
	SubjectType     string   `json:"subject_type"`
	SubjectID       string   `json:"subject_id"`
	PermissionCodes []string `json:"permission_codes"`
}

type UpdatePolicyBindingParams struct {
	Name            string   `json:"name"`
	Description     string   `json:"description"`
	SubjectType     string   `json:"subject_type"`
	SubjectID       string   `json:"subject_id"`
	PermissionCodes []string `json:"permission_codes"`
}

var policyBindingSortFields = map[string]sdb.SortField{
	"name":         {Column: "name"},
	"subject_type": {Column: "subject_type"},
	"created_at":   {Column: "created_at"},
	"updated_at":   {Column: "updated_at"},
}

var policyBindingSearchColumns = []string{
	"id", "organization_id", "name", "description", "subject_type", "subject_id", "permission_codes",
}

// ListPolicyBindings returns a page of policy bindings, with
// search/sort/pagination applied in SQL.
func (s *Service) ListPolicyBindings(ctx context.Context, principal *Principal, organizationID string, params sdb.ListParams) ([]PolicyBinding, int64, error) {
	if principal == nil {
		return nil, 0, ErrUnauthorized("authentication required")
	}
	organizationID = strings.TrimSpace(organizationID)
	tx := s.db.Gorm().WithContext(ctx)

	query, allowed, err := restrictQueryToPrincipalOrganizations(tx.Model(&sdb.PolicyBinding{}), principal, organizationID, "policies.read", "policies.manage", "organization.manage")
	if err != nil {
		return nil, 0, err
	}
	if !allowed {
		return []PolicyBinding{}, 0, nil
	}
	sortField, err := sdb.ResolveSortField(policyBindingSortFields, params.Sort)
	if err != nil {
		return nil, 0, ErrInvalidInput(err.Error())
	}
	query = sdb.ApplySearch(query, params.Search, policyBindingSearchColumns...)
	query = sdb.ApplySort(query, sortField, params.Order)

	records, total, err := sdb.Page[sdb.PolicyBinding](query, params.Limit, params.Offset)
	if err != nil {
		return nil, 0, err
	}
	bindings := make([]PolicyBinding, 0, len(records))
	for _, record := range records {
		bindings = append(bindings, toPolicyBinding(record))
	}
	return bindings, total, nil
}

func (s *Service) GetPolicyBinding(ctx context.Context, principal *Principal, bindingID string) (*PolicyBinding, error) {
	if principal == nil {
		return nil, ErrUnauthorized("authentication required")
	}
	bindingID = strings.TrimSpace(bindingID)
	if bindingID == "" {
		return nil, ErrInvalidInput("binding_id is required")
	}

	tx := s.db.Gorm().WithContext(ctx)
	var record sdb.PolicyBinding
	if err := tx.First(&record, "id = ?", bindingID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound("policy binding not found")
		}
		return nil, err
	}
	if !principal.User.IsAdmin {
		ok, err := hasAnyOrganizationPermission(tx, principal, record.OrganizationID, "policies.read", "policies.manage", "organization.manage")
		if err != nil {
			return nil, err
		}
		if !ok {
			return nil, ErrForbidden("policy binding access denied")
		}
	}
	binding := toPolicyBinding(record)
	return &binding, nil
}

func (s *Service) CreatePolicyBinding(ctx context.Context, principal *Principal, params CreatePolicyBindingParams) (*PolicyBinding, error) {
	if principal == nil {
		return nil, ErrUnauthorized("authentication required")
	}
	organizationID := strings.TrimSpace(params.OrganizationID)
	name := strings.TrimSpace(params.Name)
	description := strings.TrimSpace(params.Description)
	subjectID := strings.TrimSpace(params.SubjectID)
	if organizationID == "" || name == "" || subjectID == "" {
		return nil, ErrInvalidInput("organization_id, name and subject_id are required")
	}
	subjectType, err := validatePolicySubjectType(params.SubjectType)
	if err != nil {
		return nil, err
	}
	permissionCodes, err := validatePermissionCodes(params.PermissionCodes)
	if err != nil {
		return nil, err
	}

	var binding *PolicyBinding
	err = s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		if err := requireOrganizationPermission(tx, principal, organizationID, "policies.manage", "organization.manage"); err != nil {
			return err
		}
		if err := requirePermissionsWithinCallerScope(tx, principal, organizationID, permissionCodes); err != nil {
			return err
		}
		if err := validatePolicySubject(tx, organizationID, subjectType, subjectID); err != nil {
			return err
		}
		now := time.Now().UTC()
		policyBindingID, err := newID("pol")
		if err != nil {
			return err
		}
		record := sdb.PolicyBinding{
			ID:              policyBindingID,
			OrganizationID:  organizationID,
			Name:            name,
			Description:     description,
			SubjectType:     subjectType,
			SubjectID:       subjectID,
			PermissionCodes: permissionCodes,
			CreatedAt:       now,
			UpdatedAt:       now,
		}
		if err := tx.Create(&record).Error; err != nil {
			return err
		}
		if err := appendAuditEvent(tx, principal, organizationID, "policy_binding.created", "policy_binding", record.ID, map[string]string{"subject_type": record.SubjectType, "subject_id": record.SubjectID}); err != nil {
			return err
		}
		converted := toPolicyBinding(record)
		binding = &converted
		return nil
	})
	return binding, err
}

func (s *Service) UpdatePolicyBinding(ctx context.Context, principal *Principal, bindingID string, params UpdatePolicyBindingParams) (*PolicyBinding, error) {
	if principal == nil {
		return nil, ErrUnauthorized("authentication required")
	}
	bindingID = strings.TrimSpace(bindingID)
	name := strings.TrimSpace(params.Name)
	description := strings.TrimSpace(params.Description)
	subjectID := strings.TrimSpace(params.SubjectID)
	if bindingID == "" || name == "" || subjectID == "" {
		return nil, ErrInvalidInput("binding_id, name and subject_id are required")
	}
	subjectType, err := validatePolicySubjectType(params.SubjectType)
	if err != nil {
		return nil, err
	}
	permissionCodes, err := validatePermissionCodes(params.PermissionCodes)
	if err != nil {
		return nil, err
	}

	var binding *PolicyBinding
	err = s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		var record sdb.PolicyBinding
		if err := tx.First(&record, "id = ?", bindingID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrNotFound("policy binding not found")
			}
			return err
		}
		if err := requireOrganizationPermission(tx, principal, record.OrganizationID, "policies.manage", "organization.manage"); err != nil {
			return err
		}
		if err := requirePermissionsWithinCallerScope(tx, principal, record.OrganizationID, permissionCodes); err != nil {
			return err
		}
		if err := validatePolicySubject(tx, record.OrganizationID, subjectType, subjectID); err != nil {
			return err
		}
		record.Name = name
		record.Description = description
		record.SubjectType = subjectType
		record.SubjectID = subjectID
		record.PermissionCodes = permissionCodes
		record.UpdatedAt = time.Now().UTC()
		if err := tx.Save(&record).Error; err != nil {
			return err
		}
		if err := appendAuditEvent(tx, principal, record.OrganizationID, "policy_binding.updated", "policy_binding", record.ID, map[string]string{"subject_type": record.SubjectType, "subject_id": record.SubjectID}); err != nil {
			return err
		}
		converted := toPolicyBinding(record)
		binding = &converted
		return nil
	})
	return binding, err
}

func (s *Service) DeletePolicyBinding(ctx context.Context, principal *Principal, bindingID string) error {
	if principal == nil {
		return ErrUnauthorized("authentication required")
	}
	bindingID = strings.TrimSpace(bindingID)
	if bindingID == "" {
		return ErrInvalidInput("binding_id is required")
	}

	return s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		var record sdb.PolicyBinding
		if err := tx.First(&record, "id = ?", bindingID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrNotFound("policy binding not found")
			}
			return err
		}
		if err := requireOrganizationPermission(tx, principal, record.OrganizationID, "policies.manage", "organization.manage"); err != nil {
			return err
		}
		if err := tx.Delete(&sdb.PolicyBinding{}, "id = ?", record.ID).Error; err != nil {
			return err
		}
		return appendAuditEvent(tx, principal, record.OrganizationID, "policy_binding.deleted", "policy_binding", record.ID, map[string]string{"subject_type": record.SubjectType, "subject_id": record.SubjectID})
	})
}

func validatePolicySubject(tx *gorm.DB, organizationID, subjectType, subjectID string) error {
	switch subjectType {
	case policySubjectUser:
		var userCount int64
		if err := tx.Model(&sdb.User{}).Where("id = ?", subjectID).Count(&userCount).Error; err != nil {
			return err
		}
		if userCount == 0 {
			return ErrNotFound("user not found")
		}
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
