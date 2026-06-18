package query

import (
	"strings"
	"testing"

	"github.com/EngineerProjects/nexus_ai/internal/db"
	backendmemories "github.com/EngineerProjects/nexus_ai/internal/memories"
)

// ─── isPromptReadableAttachment ───────────────────────────────────────────────

func TestIsPromptReadableAttachment(t *testing.T) {
	cases := []struct {
		name        string
		filename    string
		contentType string
		want        bool
	}{
		{name: "text mime", filename: "notes.bin", contentType: "text/plain", want: true},
		{name: "markdown extension", filename: "brief.md", contentType: "application/octet-stream", want: true},
		{name: "json mime", filename: "payload.bin", contentType: "application/json", want: true},
		{name: "image unsupported", filename: "photo.png", contentType: "image/png", want: false},
		{name: "pdf unsupported", filename: "paper.pdf", contentType: "application/pdf", want: false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := isPromptReadableAttachment(tc.filename, tc.contentType); got != tc.want {
				t.Fatalf("expected %v, got %v", tc.want, got)
			}
		})
	}
}

// ─── buildUserMemoriesBlock ───────────────────────────────────────────────────

func TestBuildUserMemoriesBlock_Empty(t *testing.T) {
	if got := buildUserMemoriesBlock(nil); got != "" {
		t.Errorf("expected empty string for nil memories, got %q", got)
	}
	if got := buildUserMemoriesBlock([]backendmemories.UserMemory{}); got != "" {
		t.Errorf("expected empty string for zero memories, got %q", got)
	}
}

func TestBuildUserMemoriesBlock_ContainsKeyAndValue(t *testing.T) {
	mems := []backendmemories.UserMemory{
		{Type: db.MemoryTypeFact, Key: "language", Value: "French"},
	}
	got := buildUserMemoriesBlock(mems)
	if !strings.Contains(got, "language: French") {
		t.Errorf("expected 'language: French' in block, got:\n%s", got)
	}
	if !strings.Contains(got, "## User Memories") {
		t.Errorf("expected header in block, got:\n%s", got)
	}
}

func TestBuildUserMemoriesBlock_InstructionAppearsFirst(t *testing.T) {
	mems := []backendmemories.UserMemory{
		{Type: db.MemoryTypeFact, Key: "lang", Value: "Go"},
		{Type: db.MemoryTypeInstruction, Key: "style", Value: "concise"},
	}
	got := buildUserMemoriesBlock(mems)
	instrIdx := strings.Index(got, "Instructions")
	factIdx := strings.Index(got, "Facts")
	if instrIdx < 0 || factIdx < 0 {
		t.Fatalf("expected both Instructions and Facts sections, got:\n%s", got)
	}
	if instrIdx > factIdx {
		t.Errorf("Instructions section should appear before Facts section")
	}
}

func TestBuildUserMemoriesBlock_ValueOnlyEntry(t *testing.T) {
	mems := []backendmemories.UserMemory{
		{Type: db.MemoryTypePreference, Key: "", Value: "always use tabs"},
	}
	got := buildUserMemoriesBlock(mems)
	if !strings.Contains(got, "- always use tabs") {
		t.Errorf("expected value-only entry in block, got:\n%s", got)
	}
}
