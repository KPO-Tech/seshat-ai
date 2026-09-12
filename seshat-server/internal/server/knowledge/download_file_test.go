package knowledge

import (
	"bytes"
	"context"
	"testing"
)

// TestDownloadFileReturnsUploadedBytes is the regression guard for the
// desktop-side "connected mode" gap: a CorpusFile's id is this server's own
// primary key, a different id space than the desktop's local blob id (see
// cloudknowledge.RemoteService's doc comment in seshat-backend) - so unlike
// every other file method here, DownloadFile is looked up by that id alone,
// with no corpus_id available up front.
func TestDownloadFileReturnsUploadedBytes(t *testing.T) {
	env := newTestEnv(t)

	corpus, err := env.knowledge.CreateCorpus(context.Background(), env.adminPrincipal, CreateCorpusParams{
		OrganizationID: env.orgID, Name: "Handbook",
	})
	if err != nil {
		t.Fatalf("create corpus: %v", err)
	}

	content := []byte("Employees get 25 days of paid leave per year.")
	file, err := env.knowledge.UploadFile(context.Background(), env.adminPrincipal, corpus.ID, "leave-policy.txt", "text/plain", content)
	if err != nil {
		t.Fatalf("upload file: %v", err)
	}

	data, meta, err := env.knowledge.DownloadFile(context.Background(), env.adminPrincipal, file.ID)
	if err != nil {
		t.Fatalf("download file: %v", err)
	}
	if !bytes.Equal(data, content) {
		t.Fatalf("expected downloaded bytes to match the uploaded content, got %q", data)
	}
	if meta.Filename != "leave-policy.txt" {
		t.Fatalf("expected filename %q, got %q", "leave-policy.txt", meta.Filename)
	}
	if meta.ContentType != "text/plain" {
		t.Fatalf("expected content type %q, got %q", "text/plain", meta.ContentType)
	}
}

func TestDownloadFileUnknownIDIsNotFound(t *testing.T) {
	env := newTestEnv(t)

	if _, _, err := env.knowledge.DownloadFile(context.Background(), env.adminPrincipal, "file_does_not_exist"); err == nil {
		t.Fatal("expected an unknown file id to return an error")
	}
}

// TestDownloadFileDeniesOtherOrgMember proves DownloadFile enforces the same
// corpus-level permission check as every other file method (via
// mustLoadCorpus on the file's own corpus_id), even though the caller never
// supplies a corpus_id itself.
func TestDownloadFileDeniesOtherOrgMember(t *testing.T) {
	env := newTestEnv(t)

	corpus, err := env.knowledge.CreateCorpus(context.Background(), env.adminPrincipal, CreateCorpusParams{
		OrganizationID: env.orgID, Name: "Handbook",
	})
	if err != nil {
		t.Fatalf("create corpus: %v", err)
	}
	file, err := env.knowledge.UploadFile(context.Background(), env.adminPrincipal, corpus.ID, "leave-policy.txt", "text/plain", []byte("content"))
	if err != nil {
		t.Fatalf("upload file: %v", err)
	}

	viewer := env.addMember(t, "viewer")
	if _, _, err := env.knowledge.DownloadFile(context.Background(), viewer, file.ID); err == nil {
		t.Fatal("expected a plain viewer with no knowledge.read/manage grant to be denied")
	}
}
