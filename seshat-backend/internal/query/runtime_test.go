package query

import (
	"testing"

	"github.com/KPO-Tech/seshat/pkg/sdk"
)

func newTestSDKRuntime(t *testing.T) *SDKRuntime {
	t.Helper()

	cfg := sdk.DefaultClientConfig()
	cfg.PersistSessions = false
	cfg.WorkingDir = t.TempDir()

	client, err := sdk.NewClient(cfg)
	if err != nil {
		t.Fatalf("NewClient failed: %v", err)
	}
	t.Cleanup(func() { _ = client.Close() })

	return NewSDKRuntime(client, cfg)
}

func TestSDKRuntimeClientForInputReturnsFreshBaseClients(t *testing.T) {
	runtime := newTestSDKRuntime(t)

	clientA, releaseA, err := runtime.clientForInput(QueryInput{})
	if err != nil {
		t.Fatalf("clientForInput failed: %v", err)
	}
	defer releaseA()

	clientB, releaseB, err := runtime.clientForInput(QueryInput{})
	if err != nil {
		t.Fatalf("second clientForInput failed: %v", err)
	}
	defer releaseB()

	if clientA == runtime.client || clientB == runtime.client {
		t.Fatal("expected request-scoped clients, not the shared base client")
	}
	if clientA == clientB {
		t.Fatal("expected a fresh client per request")
	}
	if clientA.GetSessionStore() != runtime.client.GetSessionStore() {
		t.Fatal("expected request client to reuse the shared session store")
	}
	if clientA.GetArtifactStore() != runtime.client.GetArtifactStore() {
		t.Fatal("expected request client to reuse the shared artifact store")
	}
}

func TestSDKRuntimeClientForInputReturnsFreshProviderOverrideClients(t *testing.T) {
	runtime := newTestSDKRuntime(t)
	input := QueryInput{RuntimeProvider: &RuntimeProviderConfig{
		Provider: "anthropic",
		ModelID:  "claude-3-5-sonnet-20241022",
		Secret:   "test-secret",
	}}

	clientA, releaseA, err := runtime.clientForInput(input)
	if err != nil {
		t.Fatalf("provider clientForInput failed: %v", err)
	}
	defer releaseA()

	clientB, releaseB, err := runtime.clientForInput(input)
	if err != nil {
		t.Fatalf("second provider clientForInput failed: %v", err)
	}
	defer releaseB()

	if clientA == runtime.client || clientB == runtime.client {
		t.Fatal("expected provider override clients to be request-scoped")
	}
	if clientA == clientB {
		t.Fatal("expected provider override clients to be recreated per request")
	}
	if clientA.GetSessionStore() != runtime.client.GetSessionStore() {
		t.Fatal("expected provider override client to reuse the shared session store")
	}
}
