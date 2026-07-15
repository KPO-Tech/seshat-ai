package knowledge

import (
	"context"
	"testing"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
)

func TestCreateCorpusFolderRequiresManagePermission(t *testing.T) {
	env := newTestEnv(t)
	member := env.addMember(t, "member")

	if _, err := env.knowledge.CreateCorpusFolder(context.Background(), member, CreateCorpusFolderParams{
		OrganizationID: env.orgID, Name: "Legal",
	}); err == nil {
		t.Fatal("expected a member without knowledge.manage to be denied creating a folder")
	}

	folder, err := env.knowledge.CreateCorpusFolder(context.Background(), env.adminPrincipal, CreateCorpusFolderParams{
		OrganizationID: env.orgID, Name: "Legal", Description: "Legal & compliance documents",
	})
	if err != nil {
		t.Fatalf("create as admin: %v", err)
	}
	if folder.Name != "Legal" || folder.Icon != "📁" {
		t.Fatalf("unexpected folder: %+v", folder)
	}
}

func TestListCorpusFoldersOpenToAnyMember(t *testing.T) {
	env := newTestEnv(t)
	member := env.addMember(t, "member")

	if _, err := env.knowledge.CreateCorpusFolder(context.Background(), env.adminPrincipal, CreateCorpusFolderParams{
		OrganizationID: env.orgID, Name: "Legal",
	}); err != nil {
		t.Fatalf("create: %v", err)
	}

	folders, err := env.knowledge.ListCorpusFolders(context.Background(), member, env.orgID)
	if err != nil {
		t.Fatalf("expected a member to list folders, got: %v", err)
	}
	if len(folders) != 1 || folders[0].Name != "Legal" {
		t.Fatalf("unexpected folders: %+v", folders)
	}
}

func TestCreateCorpusFolderRejectsDuplicateName(t *testing.T) {
	env := newTestEnv(t)
	params := CreateCorpusFolderParams{OrganizationID: env.orgID, Name: "Legal"}
	if _, err := env.knowledge.CreateCorpusFolder(context.Background(), env.adminPrincipal, params); err != nil {
		t.Fatalf("first create: %v", err)
	}
	if _, err := env.knowledge.CreateCorpusFolder(context.Background(), env.adminPrincipal, params); err == nil {
		t.Fatal("expected a second folder with the same name in the same org to be rejected")
	}
}

func TestAssignAndFilterCorpusByFolder(t *testing.T) {
	env := newTestEnv(t)

	folder, err := env.knowledge.CreateCorpusFolder(context.Background(), env.adminPrincipal, CreateCorpusFolderParams{
		OrganizationID: env.orgID, Name: "Legal",
	})
	if err != nil {
		t.Fatalf("create folder: %v", err)
	}
	filed, err := env.knowledge.CreateCorpus(context.Background(), env.adminPrincipal, CreateCorpusParams{
		OrganizationID: env.orgID, Name: "Filed Corpus", FolderID: folder.ID,
	})
	if err != nil {
		t.Fatalf("create filed corpus: %v", err)
	}
	if filed.FolderID == nil || *filed.FolderID != folder.ID {
		t.Fatalf("expected the corpus to be filed under the folder, got: %+v", filed)
	}
	unfiled, err := env.knowledge.CreateCorpus(context.Background(), env.adminPrincipal, CreateCorpusParams{
		OrganizationID: env.orgID, Name: "Unfiled Corpus",
	})
	if err != nil {
		t.Fatalf("create unfiled corpus: %v", err)
	}
	if unfiled.FolderID != nil {
		t.Fatalf("expected the corpus to have no folder, got: %+v", unfiled)
	}

	// nil filter: every corpus regardless of folder.
	all, _, err := env.knowledge.ListCorpora(context.Background(), env.adminPrincipal, env.orgID, nil, sdb.ListParams{Sort: "name", Order: "asc", Limit: 50})
	if err != nil {
		t.Fatalf("list all: %v", err)
	}
	if len(all) != 2 {
		t.Fatalf("expected 2 corpora with no filter, got %d", len(all))
	}

	// "unfiled" sentinel: only the corpus with no folder.
	unfiledOnly := ""
	unfiledList, _, err := env.knowledge.ListCorpora(context.Background(), env.adminPrincipal, env.orgID, &unfiledOnly, sdb.ListParams{Sort: "name", Order: "asc", Limit: 50})
	if err != nil {
		t.Fatalf("list unfiled: %v", err)
	}
	if len(unfiledList) != 1 || unfiledList[0].ID != unfiled.ID {
		t.Fatalf("unexpected unfiled list: %+v", unfiledList)
	}

	// A real folder id: only that folder's corpus.
	filedList, _, err := env.knowledge.ListCorpora(context.Background(), env.adminPrincipal, env.orgID, &folder.ID, sdb.ListParams{Sort: "name", Order: "asc", Limit: 50})
	if err != nil {
		t.Fatalf("list filed: %v", err)
	}
	if len(filedList) != 1 || filedList[0].ID != filed.ID {
		t.Fatalf("unexpected filed list: %+v", filedList)
	}
}

func TestUpdateCorpusMovesBetweenFolders(t *testing.T) {
	env := newTestEnv(t)
	folder, err := env.knowledge.CreateCorpusFolder(context.Background(), env.adminPrincipal, CreateCorpusFolderParams{
		OrganizationID: env.orgID, Name: "Legal",
	})
	if err != nil {
		t.Fatalf("create folder: %v", err)
	}
	corpus, err := env.knowledge.CreateCorpus(context.Background(), env.adminPrincipal, CreateCorpusParams{
		OrganizationID: env.orgID, Name: "Corpus",
	})
	if err != nil {
		t.Fatalf("create corpus: %v", err)
	}

	updated, err := env.knowledge.UpdateCorpus(context.Background(), env.adminPrincipal, corpus.ID, UpdateCorpusParams{
		Name: "Corpus", FolderID: folder.ID,
	})
	if err != nil {
		t.Fatalf("update into folder: %v", err)
	}
	if updated.FolderID == nil || *updated.FolderID != folder.ID {
		t.Fatalf("expected the corpus to be filed, got: %+v", updated)
	}

	updated, err = env.knowledge.UpdateCorpus(context.Background(), env.adminPrincipal, corpus.ID, UpdateCorpusParams{Name: "Corpus"})
	if err != nil {
		t.Fatalf("update out of folder: %v", err)
	}
	if updated.FolderID != nil {
		t.Fatalf("expected the corpus to be unfiled, got: %+v", updated)
	}
}

func TestUpdateCorpusRejectsFolderFromAnotherOrganization(t *testing.T) {
	env := newTestEnv(t)
	otherOrg, err := env.iam.CreateOrganization(context.Background(), env.adminPrincipal, iam.CreateOrganizationParams{Name: "Other Org", Slug: "other-org"})
	if err != nil {
		t.Fatalf("create other org: %v", err)
	}
	foreignFolder, err := env.knowledge.CreateCorpusFolder(context.Background(), env.adminPrincipal, CreateCorpusFolderParams{
		OrganizationID: otherOrg.ID, Name: "Foreign",
	})
	if err != nil {
		t.Fatalf("create foreign folder: %v", err)
	}
	corpus, err := env.knowledge.CreateCorpus(context.Background(), env.adminPrincipal, CreateCorpusParams{
		OrganizationID: env.orgID, Name: "Corpus",
	})
	if err != nil {
		t.Fatalf("create corpus: %v", err)
	}

	if _, err := env.knowledge.UpdateCorpus(context.Background(), env.adminPrincipal, corpus.ID, UpdateCorpusParams{
		Name: "Corpus", FolderID: foreignFolder.ID,
	}); err == nil {
		t.Fatal("expected assigning a folder from another organization to be rejected")
	}
}

func TestDeleteCorpusFolderUnfilesRatherThanDeletesCorpora(t *testing.T) {
	env := newTestEnv(t)
	folder, err := env.knowledge.CreateCorpusFolder(context.Background(), env.adminPrincipal, CreateCorpusFolderParams{
		OrganizationID: env.orgID, Name: "Legal",
	})
	if err != nil {
		t.Fatalf("create folder: %v", err)
	}
	corpus, err := env.knowledge.CreateCorpus(context.Background(), env.adminPrincipal, CreateCorpusParams{
		OrganizationID: env.orgID, Name: "Corpus", FolderID: folder.ID,
	})
	if err != nil {
		t.Fatalf("create corpus: %v", err)
	}

	if err := env.knowledge.DeleteCorpusFolder(context.Background(), env.adminPrincipal, folder.ID); err != nil {
		t.Fatalf("delete folder: %v", err)
	}

	fetched, err := env.knowledge.GetCorpus(context.Background(), env.adminPrincipal, corpus.ID)
	if err != nil {
		t.Fatalf("expected the corpus to survive the folder deletion: %v", err)
	}
	if fetched.FolderID != nil {
		t.Fatalf("expected the corpus to be unfiled after its folder was deleted, got: %+v", fetched)
	}
}
