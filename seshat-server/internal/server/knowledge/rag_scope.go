package knowledge

import (
	"context"
	"fmt"

	sdkvector "github.com/KPO-Tech/seshat/pkg/vector"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
)

// orgScopedVectorStore restricts a shared vector.Store to namespaces (corpus
// IDs) that belong to a single organization.
//
// Setting sdk.ClientConfig.RAGService wires rag_search, rag_ingest, AND
// rag_delete onto the session's LLM (internal/tools/builtin/builtin.go), and
// all three take corpus_id/namespace as a plain model-supplied string with
// no server-side ownership check of their own. The HTTP corpus endpoints
// enforce organization ownership via mustLoadCorpus's IAM permission check
// (see service.go), but that check is entirely bypassed on this tool-call
// path - RAGServiceForOrganization only ever takes an organizationID, never
// a principal, so nothing stops the LLM from supplying a corpus_id that
// belongs to a different organization. Workspace Chat and automation job
// execution both run the LLM under PermissionModeBypass (no human approves
// each tool call), so without this wrapper a turn in one organization could
// read, ingest into, or delete another organization's corpus simply by
// supplying its id.
type orgScopedVectorStore struct {
	inner          sdkvector.Store
	db             *sdb.DB
	organizationID string
}

func newOrgScopedVectorStore(db *sdb.DB, inner sdkvector.Store, organizationID string) sdkvector.Store {
	return &orgScopedVectorStore{inner: inner, db: db, organizationID: organizationID}
}

func (v *orgScopedVectorStore) checkNamespace(ctx context.Context, namespace string) error {
	var count int64
	err := v.db.Gorm().WithContext(ctx).Model(&sdb.Corpus{}).
		Where("id = ? AND organization_id = ?", namespace, v.organizationID).
		Count(&count).Error
	if err != nil {
		return err
	}
	if count == 0 {
		return fmt.Errorf("corpus %q not found in this organization", namespace)
	}
	return nil
}

func (v *orgScopedVectorStore) Upsert(ctx context.Context, records []sdkvector.Record) error {
	checked := make(map[string]struct{}, len(records))
	for _, r := range records {
		if _, ok := checked[r.Namespace]; ok {
			continue
		}
		if err := v.checkNamespace(ctx, r.Namespace); err != nil {
			return err
		}
		checked[r.Namespace] = struct{}{}
	}
	return v.inner.Upsert(ctx, records)
}

func (v *orgScopedVectorStore) Search(ctx context.Context, query sdkvector.Query) ([]sdkvector.SearchResult, error) {
	if err := v.checkNamespace(ctx, query.Namespace); err != nil {
		return nil, err
	}
	return v.inner.Search(ctx, query)
}

func (v *orgScopedVectorStore) Get(ctx context.Context, namespace string, keys []string) ([]sdkvector.Record, error) {
	if err := v.checkNamespace(ctx, namespace); err != nil {
		return nil, err
	}
	return v.inner.Get(ctx, namespace, keys)
}

func (v *orgScopedVectorStore) HasNamespace(ctx context.Context, namespace string) (bool, error) {
	if err := v.checkNamespace(ctx, namespace); err != nil {
		return false, nil
	}
	return v.inner.HasNamespace(ctx, namespace)
}

func (v *orgScopedVectorStore) DeleteNamespace(ctx context.Context, namespace string) error {
	if err := v.checkNamespace(ctx, namespace); err != nil {
		return err
	}
	return v.inner.DeleteNamespace(ctx, namespace)
}

func (v *orgScopedVectorStore) DeleteKeys(ctx context.Context, namespace string, keys []string) error {
	if err := v.checkNamespace(ctx, namespace); err != nil {
		return err
	}
	return v.inner.DeleteKeys(ctx, namespace, keys)
}
