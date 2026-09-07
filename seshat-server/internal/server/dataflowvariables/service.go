// Package dataflowvariables stores named, org-scoped values (n8n calls this
// "Variables") that pkg/dataflow graph expressions resolve as $vars.NAME
// (see pkg/dataflow's Runtime.Vars/VarsMap) — backed by db.DataflowVariable.
// Mirrors dataflowsecrets' CRUD/permission shape almost exactly, with two
// deliberate differences: no encryption (a Variable is plain config, not a
// credential, so it's safe to return in list/read responses), and a real
// Update (a settings page's values change over time; dataflowsecrets
// deliberately stays delete+recreate only for a credential's rotation
// story, which doesn't apply here).
package dataflowvariables

import (
	"context"
	"errors"
	"regexp"
	"strings"

	"gorm.io/gorm"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
)

// Variable is the CRUD/list-facing shape - Value is included, unlike
// dataflowsecrets.Secret's, since a Variable isn't a credential.
type Variable struct {
	ID              string `json:"id"`
	OrganizationID  string `json:"organization_id"`
	Name            string `json:"name"`
	Value           string `json:"value"`
	CreatedByUserID string `json:"created_by_user_id"`
}

type Service struct {
	db  *sdb.DB
	iam *iam.Service
}

func New(database *sdb.DB, iamService *iam.Service) *Service {
	return &Service{db: database, iam: iamService}
}

// validNameRE matches a valid JS identifier - $vars.NAME is plain property
// access in the expression's JS, so a name with a space or a leading digit
// would make that syntax break (bracket notation would still work, but
// nothing else in this codebase's expression chips - $node('id'), etc. -
// asks the user to reach for that, so the constraint is enforced here
// instead of surfacing as a confusing runtime-only failure).
var validNameRE = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]*$`)

func validateNameAndValue(name, value string) error {
	if name == "" || value == "" {
		return iam.ErrInvalidInput("organization_id, name and value are required")
	}
	if !validNameRE.MatchString(name) {
		return iam.ErrInvalidInput("name must start with a letter or underscore and contain only letters, digits and underscores (it's used as $vars." + name + " in expressions)")
	}
	return nil
}

type SetParams struct {
	OrganizationID, Name, Value string
}

// Set creates a new named variable, or errors if organizationID+name
// already has one - use Update to change an existing variable's value.
func (s *Service) Set(ctx context.Context, principal *iam.Principal, params SetParams) (*Variable, error) {
	if principal == nil {
		return nil, iam.ErrUnauthorized("authentication required")
	}
	organizationID := strings.TrimSpace(params.OrganizationID)
	name := strings.TrimSpace(params.Name)
	if organizationID == "" {
		return nil, iam.ErrInvalidInput("organization_id, name and value are required")
	}
	if err := validateNameAndValue(name, params.Value); err != nil {
		return nil, err
	}

	var record sdb.DataflowVariable
	err := s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		if err := s.iam.CheckOrganizationPermission(tx, principal, organizationID, "variables.manage", "organization.manage"); err != nil {
			return err
		}
		var conflicting int64
		if err := tx.Model(&sdb.DataflowVariable{}).Where("organization_id = ? AND name = ?", organizationID, name).Count(&conflicting).Error; err != nil {
			return err
		}
		if conflicting > 0 {
			return iam.ErrConflict("a variable named " + name + " already exists in this organization; edit it instead")
		}
		id, err := sdb.NewID("dfvar")
		if err != nil {
			return err
		}
		record = sdb.DataflowVariable{
			ID: id, OrganizationID: organizationID, Name: name,
			Value: params.Value, CreatedByUserID: principal.User.ID,
		}
		if err := tx.Create(&record).Error; err != nil {
			return err
		}
		return s.iam.AppendAuditEvent(tx, principal, organizationID, "dataflow_variable.created", "dataflow_variable", record.ID, map[string]string{"name": name})
	})
	if err != nil {
		return nil, err
	}
	result := toVariable(record)
	return &result, nil
}

type UpdateParams struct {
	Name, Value string
}

// Update changes an existing variable's name and/or value.
func (s *Service) Update(ctx context.Context, principal *iam.Principal, id string, params UpdateParams) (*Variable, error) {
	if principal == nil {
		return nil, iam.ErrUnauthorized("authentication required")
	}
	name := strings.TrimSpace(params.Name)
	if err := validateNameAndValue(name, params.Value); err != nil {
		return nil, err
	}

	var record sdb.DataflowVariable
	err := s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		if err := tx.First(&record, "id = ?", id).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return iam.ErrNotFound("variable not found")
			}
			return err
		}
		if err := s.iam.CheckOrganizationPermission(tx, principal, record.OrganizationID, "variables.manage", "organization.manage"); err != nil {
			return err
		}
		if name != record.Name {
			var conflicting int64
			if err := tx.Model(&sdb.DataflowVariable{}).Where("organization_id = ? AND name = ? AND id <> ?", record.OrganizationID, name, record.ID).Count(&conflicting).Error; err != nil {
				return err
			}
			if conflicting > 0 {
				return iam.ErrConflict("a variable named " + name + " already exists in this organization")
			}
		}
		record.Name = name
		record.Value = params.Value
		if err := tx.Save(&record).Error; err != nil {
			return err
		}
		return s.iam.AppendAuditEvent(tx, principal, record.OrganizationID, "dataflow_variable.updated", "dataflow_variable", record.ID, map[string]string{"name": name})
	})
	if err != nil {
		return nil, err
	}
	result := toVariable(record)
	return &result, nil
}

func (s *Service) List(ctx context.Context, principal *iam.Principal, organizationID string) ([]Variable, error) {
	if principal == nil {
		return nil, iam.ErrUnauthorized("authentication required")
	}
	organizationID = strings.TrimSpace(organizationID)
	if organizationID == "" {
		return nil, iam.ErrInvalidInput("organization_id is required")
	}
	if !principal.User.IsAdmin {
		if err := s.iam.CheckOrganizationPermission(s.db.Gorm().WithContext(ctx), principal, organizationID, "variables.read", "variables.manage", "organization.manage"); err != nil {
			return []Variable{}, nil
		}
	}
	var records []sdb.DataflowVariable
	if err := s.db.Gorm().WithContext(ctx).Where("organization_id = ?", organizationID).Order("name asc").Find(&records).Error; err != nil {
		return nil, err
	}
	out := make([]Variable, 0, len(records))
	for _, r := range records {
		out = append(out, toVariable(r))
	}
	return out, nil
}

func (s *Service) Delete(ctx context.Context, principal *iam.Principal, id string) error {
	if principal == nil {
		return iam.ErrUnauthorized("authentication required")
	}
	return s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		var record sdb.DataflowVariable
		if err := tx.First(&record, "id = ?", id).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return iam.ErrNotFound("variable not found")
			}
			return err
		}
		if err := s.iam.CheckOrganizationPermission(tx, principal, record.OrganizationID, "variables.manage", "organization.manage"); err != nil {
			return err
		}
		if err := tx.Delete(&sdb.DataflowVariable{}, "id = ?", id).Error; err != nil {
			return err
		}
		return s.iam.AppendAuditEvent(tx, principal, record.OrganizationID, "dataflow_variable.deleted", "dataflow_variable", record.ID, map[string]string{"name": record.Name})
	})
}

// ResolveAll implements automation.DataflowVariableResolver - the whole set
// of an organization's variables, resolved once up front rather than one
// name at a time (see pkg/dataflow's Runtime.Vars doc comment for why: a
// Variable isn't secret, so there's no cost to eager resolution). Not
// principal-gated: called from cloud job execution and expression preview
// (internal/server/automation), which have already established the caller
// may act within organizationID before reaching this point - same trust
// boundary as dataflowsecrets.Service.ResolveDataflowSecret.
func (s *Service) ResolveAll(ctx context.Context, organizationID string) (map[string]string, error) {
	organizationID = strings.TrimSpace(organizationID)
	if organizationID == "" {
		return map[string]string{}, nil
	}
	var records []sdb.DataflowVariable
	if err := s.db.Gorm().WithContext(ctx).Where("organization_id = ?", organizationID).Find(&records).Error; err != nil {
		return nil, err
	}
	out := make(map[string]string, len(records))
	for _, r := range records {
		out[r.Name] = r.Value
	}
	return out, nil
}

func toVariable(r sdb.DataflowVariable) Variable {
	return Variable{ID: r.ID, OrganizationID: r.OrganizationID, Name: r.Name, Value: r.Value, CreatedByUserID: r.CreatedByUserID}
}
