// Package dataflowsecrets stores named, org-scoped secrets that
// pkg/dataflow graph nodes resolve by reference (e.g. a "postgres" node's
// dsnSecretRef parameter) — the multi-tenant SecretResolver a dataflow
// Definition needs, backed by db.DataflowSecret (see its doc comment for
// why this isn't folded into ConnectorAccount). CRUD is delete+recreate
// only, same v1 posture as inbox workflows (internal/inbox/workflow_crud.go
// in seshat-backend) — no update endpoint until there's a real need for one.
package dataflowsecrets

import (
	"context"
	"errors"
	"strings"

	"gorm.io/gorm"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
)

// Secret is the CRUD/list-facing shape — Value is deliberately absent, the
// same "never re-expose after write" posture as ConnectorAccount's access
// token. Only ResolveDataflowSecret (called from the automation execution
// path, not any HTTP handler) ever reads the decrypted value.
type Secret struct {
	ID              string `json:"id"`
	OrganizationID  string `json:"organization_id"`
	Name            string `json:"name"`
	CreatedByUserID string `json:"created_by_user_id"`
}

type Service struct {
	db  *sdb.DB
	iam *iam.Service
}

func New(database *sdb.DB, iamService *iam.Service) *Service {
	return &Service{db: database, iam: iamService}
}

type SetParams struct {
	OrganizationID, Name, Value string
}

// Set creates a new named secret, or errors if organizationID+name already
// has one — the caller deletes and recreates to rotate a value, matching
// the inbox-workflow precedent (no partial-update endpoint for a secret is
// deliberately not offered: a PATCH that only sometimes touches the value
// is exactly the kind of ambiguous surface worth avoiding for a credential).
func (s *Service) Set(ctx context.Context, principal *iam.Principal, params SetParams) (*Secret, error) {
	if principal == nil {
		return nil, iam.ErrUnauthorized("authentication required")
	}
	organizationID := strings.TrimSpace(params.OrganizationID)
	name := strings.TrimSpace(params.Name)
	value := params.Value
	if organizationID == "" || name == "" || value == "" {
		return nil, iam.ErrInvalidInput("organization_id, name and value are required")
	}

	var record sdb.DataflowSecret
	err := s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		if err := s.iam.CheckOrganizationPermission(tx, principal, organizationID, "dataflow_secrets.manage", "organization.manage"); err != nil {
			return err
		}
		var conflicting int64
		if err := tx.Model(&sdb.DataflowSecret{}).Where("organization_id = ? AND name = ?", organizationID, name).Count(&conflicting).Error; err != nil {
			return err
		}
		if conflicting > 0 {
			return iam.ErrConflict("a secret named " + name + " already exists in this organization; delete it first to replace the value")
		}
		encrypted, err := sdb.EncryptSecret(tx, organizationID, value)
		if err != nil {
			return err
		}
		id, err := sdb.NewID("dfsecret")
		if err != nil {
			return err
		}
		record = sdb.DataflowSecret{
			ID: id, OrganizationID: organizationID, Name: name,
			ValueEncrypted: encrypted, CreatedByUserID: principal.User.ID,
		}
		if err := tx.Create(&record).Error; err != nil {
			return err
		}
		return s.iam.AppendAuditEvent(tx, principal, organizationID, "dataflow_secret.created", "dataflow_secret", record.ID, map[string]string{"name": name})
	})
	if err != nil {
		return nil, err
	}
	result := toSecret(record)
	return &result, nil
}

func (s *Service) List(ctx context.Context, principal *iam.Principal, organizationID string) ([]Secret, error) {
	if principal == nil {
		return nil, iam.ErrUnauthorized("authentication required")
	}
	organizationID = strings.TrimSpace(organizationID)
	if organizationID == "" {
		return nil, iam.ErrInvalidInput("organization_id is required")
	}
	if !principal.User.IsAdmin {
		if err := s.iam.CheckOrganizationPermission(s.db.Gorm().WithContext(ctx), principal, organizationID, "dataflow_secrets.read", "dataflow_secrets.manage", "organization.manage"); err != nil {
			return []Secret{}, nil
		}
	}
	var records []sdb.DataflowSecret
	if err := s.db.Gorm().WithContext(ctx).Where("organization_id = ?", organizationID).Order("name asc").Find(&records).Error; err != nil {
		return nil, err
	}
	out := make([]Secret, 0, len(records))
	for _, r := range records {
		out = append(out, toSecret(r))
	}
	return out, nil
}

func (s *Service) Delete(ctx context.Context, principal *iam.Principal, id string) error {
	if principal == nil {
		return iam.ErrUnauthorized("authentication required")
	}
	return s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		var record sdb.DataflowSecret
		if err := tx.First(&record, "id = ?", id).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return iam.ErrNotFound("secret not found")
			}
			return err
		}
		if err := s.iam.CheckOrganizationPermission(tx, principal, record.OrganizationID, "dataflow_secrets.manage", "organization.manage"); err != nil {
			return err
		}
		if err := tx.Delete(&sdb.DataflowSecret{}, "id = ?", id).Error; err != nil {
			return err
		}
		return s.iam.AppendAuditEvent(tx, principal, record.OrganizationID, "dataflow_secret.deleted", "dataflow_secret", record.ID, map[string]string{"name": record.Name})
	})
}

// ResolveDataflowSecret implements automation.DataflowSecretResolver — the
// one path that ever decrypts a value. Not principal-gated: it's called
// from cloud job execution (internal/server/automation), which has already
// established the job belongs to organizationID before reaching this point,
// the same trust boundary connectors.Service.AccessTokenForUser relies on.
func (s *Service) ResolveDataflowSecret(ctx context.Context, organizationID, name string) (string, error) {
	organizationID = strings.TrimSpace(organizationID)
	name = strings.TrimSpace(name)
	if organizationID == "" || name == "" {
		return "", errors.New("organization_id and name are required")
	}
	tx := s.db.Gorm().WithContext(ctx)
	var record sdb.DataflowSecret
	if err := tx.First(&record, "organization_id = ? AND name = ?", organizationID, name).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return "", errors.New("no dataflow secret named " + name + " in this organization")
		}
		return "", err
	}
	return sdb.DecryptSecret(tx, organizationID, record.ValueEncrypted)
}

func toSecret(r sdb.DataflowSecret) Secret {
	return Secret{ID: r.ID, OrganizationID: r.OrganizationID, Name: r.Name, CreatedByUserID: r.CreatedByUserID}
}
