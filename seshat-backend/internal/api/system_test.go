package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/KPO-Tech/seshat/pkg/sdk"
)

// TestHandleSystemStatusReportsDockerSandbox covers the combination logic
// added alongside sdk.Client.SandboxKind(): when the query client actually
// resolved to the Docker backend, the response must say so explicitly
// rather than falling back to the Landlock-only sdk.SandboxAvailable() check
// (which would report false on every non-Linux desktop regardless of Docker).
func TestHandleSystemStatusReportsDockerSandbox(t *testing.T) {
	a := &App{sandboxKind: string(sdk.SandboxKindDocker)}

	req := httptest.NewRequest(http.MethodGet, "/system/status", nil)
	rec := httptest.NewRecorder()
	a.handleSystemStatus(rec, req)

	var resp systemStatusResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if !resp.SandboxConfined {
		t.Fatal("expected sandbox_confined=true when the Docker backend is active")
	}
	if resp.SandboxKind != "docker" {
		t.Fatalf("expected sandbox_kind=\"docker\", got %q", resp.SandboxKind)
	}
}

// TestHandleSystemStatusReportsUnconfinedWithoutDockerOrLandlock covers the
// other side: no Docker sandbox resolved (empty sandboxKind) and no Landlock
// available (true on this test's platform whenever it's not Linux, and even
// on Linux CI runners that don't grant the syscall) reports fully unconfined,
// not a stale/incorrect "confined" status.
func TestHandleSystemStatusReportsUnconfinedWithoutDockerOrLandlock(t *testing.T) {
	if sdk.SandboxAvailable() {
		t.Skip("Landlock is available on this host - this test only covers the fully-unconfined case")
	}
	a := &App{}

	req := httptest.NewRequest(http.MethodGet, "/system/status", nil)
	rec := httptest.NewRecorder()
	a.handleSystemStatus(rec, req)

	var resp systemStatusResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp.SandboxConfined {
		t.Fatal("expected sandbox_confined=false when neither Docker nor Landlock is active")
	}
	if resp.SandboxKind != "" {
		t.Fatalf("expected empty sandbox_kind, got %q", resp.SandboxKind)
	}
}
