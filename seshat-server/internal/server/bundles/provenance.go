package bundles

import (
	"context"
	"strings"

	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
)

// ProvenanceEntry says which bundle import created one resource row - see
// db.BundleImport's doc comment. A resource ID absent from
// ResolveProvenance's returned map was never created via a bundle import
// (created directly by an admin, or inherited as a platform default) - the
// caller distinguishes those two the same way it already does today (its
// own List response's CreatedByUserID / Source fields), this endpoint only
// ever adds the third signal.
type ProvenanceEntry struct {
	BundleImportID string `json:"bundle_import_id"`
	BundleName     string `json:"bundle_name"`
}

// ResolveProvenance looks up, for a given resource_type and a caller-
// supplied set of resource IDs (normally exactly the IDs a registry's own
// List endpoint just returned to this same caller), which ones were created
// via a bundle import and by which one.
//
// Membership-only check, like hookregistry.ResolveHookConfigs - this only
// ever reveals which of the caller's own already-visible rows came from a
// bundle, never anything about a resource the caller couldn't already see,
// so there's nothing here for a *_registry.read/.manage permission to gate.
func (s *Service) ResolveProvenance(ctx context.Context, principal *iam.Principal, organizationID, resourceType string, resourceIDs []string) (map[string]ProvenanceEntry, error) {
	if principal == nil {
		return nil, iam.ErrUnauthorized("authentication required")
	}
	organizationID = strings.TrimSpace(organizationID)
	if organizationID == "" {
		return nil, iam.ErrInvalidInput("organization_id is required")
	}
	resourceType = strings.TrimSpace(resourceType)
	if resourceType == "" {
		return nil, iam.ErrInvalidInput("resource_type is required")
	}
	out := map[string]ProvenanceEntry{}
	if len(resourceIDs) == 0 {
		return out, nil
	}

	tx := s.db.Gorm().WithContext(ctx)
	allowed, err := s.iam.CanAccessOrganization(tx, principal, organizationID)
	if err != nil {
		return nil, err
	}
	if !allowed {
		return nil, iam.ErrForbidden("not a member of this organization")
	}

	var rows []struct {
		ResourceID     string
		BundleImportID string
		BundleName     string
	}
	err = tx.Table("bundle_import_items").
		Select("bundle_import_items.resource_id AS resource_id, bundle_import_items.bundle_import_id AS bundle_import_id, bundle_imports.bundle_name AS bundle_name").
		Joins("JOIN bundle_imports ON bundle_imports.id = bundle_import_items.bundle_import_id").
		Where("bundle_import_items.organization_id = ? AND bundle_import_items.resource_type = ? AND bundle_import_items.resource_id IN ?", organizationID, resourceType, resourceIDs).
		Find(&rows).Error
	if err != nil {
		return nil, err
	}
	for _, r := range rows {
		out[r.ResourceID] = ProvenanceEntry{BundleImportID: r.BundleImportID, BundleName: r.BundleName}
	}
	return out, nil
}
