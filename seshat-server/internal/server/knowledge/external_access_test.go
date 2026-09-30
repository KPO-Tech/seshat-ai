package knowledge

import (
	"context"
	"testing"
	"time"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
)

func TestPrincipalMatchesExternalAccess(t *testing.T) {
	adminPrincipal := &iam.Principal{User: iam.User{Email: "admin@example.com"}}
	verifiedAt := time.Now()
	verifiedDomain := "acme.com"
	verifiedOrg := sdb.Organization{Domain: &verifiedDomain, DomainVerifiedAt: &verifiedAt}
	unverifiedOrg := sdb.Organization{Domain: &verifiedDomain} // Domain set but never verified

	tests := []struct {
		name      string
		principal *iam.Principal
		org       sdb.Organization
		access    []string
		want      bool
	}{
		{"nil access means default-open", adminPrincipal, sdb.Organization{}, nil, true},
		{"empty access means default-open", adminPrincipal, sdb.Organization{}, []string{}, true},
		{"public always matches", adminPrincipal, sdb.Organization{}, []string{"public"}, true},
		{"nil principal never matches a restricted file", nil, sdb.Organization{}, []string{"public"}, false},
		{"exact user email matches", adminPrincipal, sdb.Organization{}, []string{"user:admin@example.com"}, true},
		{"user email match is case-insensitive", &iam.Principal{User: iam.User{Email: "Admin@Example.com"}}, sdb.Organization{}, []string{"user:admin@example.com"}, true},
		{"different user email does not match", adminPrincipal, sdb.Organization{}, []string{"user:other@example.com"}, false},
		{"verified domain matches any org member", adminPrincipal, verifiedOrg, []string{"domain:acme.com"}, true},
		{"unverified domain never matches, even if it's set", adminPrincipal, unverifiedOrg, []string{"domain:acme.com"}, false},
		{"unresolved group entry fails closed", adminPrincipal, sdb.Organization{}, []string{"group:eng@acme.com"}, false},
		{"group entry fails closed even alongside a non-matching user entry", adminPrincipal, sdb.Organization{}, []string{"group:eng@acme.com", "user:other@example.com"}, false},
		{"a later matching entry still succeeds after an earlier non-matching one", adminPrincipal, sdb.Organization{}, []string{"user:other@example.com", "user:admin@example.com"}, true},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := principalMatchesExternalAccess(tc.principal, tc.org, tc.access); got != tc.want {
				t.Fatalf("principalMatchesExternalAccess() = %v, want %v", got, tc.want)
			}
		})
	}
}

func TestIngestFromConnectorPersistsAndRefreshesExternalAccess(t *testing.T) {
	env := newTestEnv(t)
	corpus, err := env.knowledge.CreateCorpus(context.Background(), env.adminPrincipal, CreateCorpusParams{
		OrganizationID: env.orgID, Name: "ACL Test",
	})
	if err != nil {
		t.Fatalf("create corpus: %v", err)
	}

	file, err := env.knowledge.IngestFromConnector(context.Background(), env.orgID, corpus.ID,
		"conn_fake", "remote/restricted.txt", env.adminPrincipal.User.ID,
		"restricted.txt", "text/plain", []byte("confidential"), "",
		[]string{"user:alice@example.com", "group:eng@example.com"},
	)
	if err != nil {
		t.Fatalf("ingest connector item: %v", err)
	}

	var stored sdb.CorpusFile
	if err := env.db.Gorm().First(&stored, "id = ?", file.ID).Error; err != nil {
		t.Fatalf("load stored file: %v", err)
	}
	if len(stored.ExternalAccess) != 2 || stored.ExternalAccess[0] != "user:alice@example.com" || stored.ExternalAccess[1] != "group:eng@example.com" {
		t.Fatalf("expected persisted ExternalAccess, got %+v", stored.ExternalAccess)
	}

	// Re-sync the same external resource with a changed ACL - must overwrite
	// in place, not accumulate or leave the old value behind.
	refreshed, err := env.knowledge.IngestFromConnector(context.Background(), env.orgID, corpus.ID,
		"conn_fake", "remote/restricted.txt", env.adminPrincipal.User.ID,
		"restricted.txt", "text/plain", []byte("confidential v2"), "",
		[]string{"public"},
	)
	if err != nil {
		t.Fatalf("re-sync connector item: %v", err)
	}
	if refreshed.ID != file.ID {
		t.Fatalf("expected re-sync to update the same CorpusFile, got a new id %q vs %q", refreshed.ID, file.ID)
	}
	var restored sdb.CorpusFile
	if err := env.db.Gorm().First(&restored, "id = ?", file.ID).Error; err != nil {
		t.Fatalf("load refreshed file: %v", err)
	}
	if len(restored.ExternalAccess) != 1 || restored.ExternalAccess[0] != "public" {
		t.Fatalf("expected ExternalAccess to be refreshed to the new ACL, got %+v", restored.ExternalAccess)
	}

	// A connector item synced with no ACL at all (nil) must persist as
	// empty/nil, not silently keep a stale one - the whole point of
	// refreshing on every sync.
	unrestricted, err := env.knowledge.IngestFromConnector(context.Background(), env.orgID, corpus.ID,
		"conn_fake", "remote/restricted.txt", env.adminPrincipal.User.ID,
		"restricted.txt", "text/plain", []byte("confidential v3"), "",
		nil,
	)
	if err != nil {
		t.Fatalf("re-sync connector item without acl: %v", err)
	}
	var finalRow sdb.CorpusFile
	if err := env.db.Gorm().First(&finalRow, "id = ?", unrestricted.ID).Error; err != nil {
		t.Fatalf("load final file: %v", err)
	}
	if len(finalRow.ExternalAccess) != 0 {
		t.Fatalf("expected ExternalAccess to clear when the connector reports no ACL, got %+v", finalRow.ExternalAccess)
	}
}

func TestSearchEnforcesExternalAccess(t *testing.T) {
	env := newTestEnv(t)
	env.configurePlatformEmbedder(t)
	corpus, err := env.knowledge.CreateCorpus(context.Background(), env.adminPrincipal, CreateCorpusParams{
		OrganizationID: env.orgID, Name: "Restricted Corpus",
	})
	if err != nil {
		t.Fatalf("create corpus: %v", err)
	}

	// Restricted to a specific member, not the admin. Grant the member
	// corpus-level access (knowledge.read) so the only thing standing
	// between them and the result is the per-file ACL this test exercises -
	// same PolicyBinding pattern as corpus_resource_scope_test.go.
	member := env.addMember(t, "member")
	if _, err := env.iam.CreatePolicyBinding(context.Background(), env.adminPrincipal, iam.CreatePolicyBindingParams{
		OrganizationID:  env.orgID,
		Name:            "Restricted corpus access",
		SubjectType:     "user",
		SubjectID:       member.User.ID,
		PermissionCodes: []string{"knowledge.read"},
		ResourceType:    "corpus",
		ResourceID:      corpus.ID,
	}); err != nil {
		t.Fatalf("grant member corpus access: %v", err)
	}
	if _, err := env.knowledge.IngestFromConnector(context.Background(), env.orgID, corpus.ID,
		"conn_fake", "remote/secret-roadmap.txt", env.adminPrincipal.User.ID,
		"secret-roadmap.txt", "text/plain", []byte("Q3 roadmap details only for the eng team lead"), "",
		[]string{"user:" + member.User.Email},
	); err != nil {
		t.Fatalf("ingest restricted connector item: %v", err)
	}
	if _, err := env.knowledge.ProcessNextIngestionJob(context.Background()); err != nil {
		t.Fatalf("process ingestion job: %v", err)
	}

	// The admin (corpus-level access, but not in the file's ACL) must not
	// see it - this is the exact leak this change closes.
	adminResp, err := env.knowledge.Search(context.Background(), env.adminPrincipal, SearchParams{
		CorpusID: corpus.ID, Query: "roadmap", Mode: SearchModeKeyword,
	})
	if err != nil {
		t.Fatalf("admin search: %v", err)
	}
	if len(adminResp.Results) != 0 {
		t.Fatalf("expected the ACL-restricted file to be excluded from a non-matching principal's results, got %+v", adminResp.Results)
	}

	// The member named in the ACL must still see it.
	memberResp, err := env.knowledge.Search(context.Background(), member, SearchParams{
		CorpusID: corpus.ID, Query: "roadmap", Mode: SearchModeKeyword,
	})
	if err != nil {
		t.Fatalf("member search: %v", err)
	}
	if len(memberResp.Results) == 0 {
		t.Fatal("expected the principal named in the file's ACL to still find it")
	}
}
