package query

import (
	"context"
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

	runtime := NewSDKRuntime(client, cfg)
	t.Cleanup(runtime.CloseCachedClients)
	return runtime
}

// TestSDKRuntimeClientForInputCachesBaseClients guards clientForInput's
// cache: two calls with the same (userID, provider, model, credential) key
// must return the identical *sdk.Client instead of building a fresh one each
// time - see clientCacheKey's doc comment for why this is safe (per-session
// state lives on the *sdk.Session each turn loads fresh, and the one
// historically shared mutable field, PromptFn/WebSearchRunner, is now
// threaded per-turn via context instead - see types.WithPromptFn).
func TestSDKRuntimeClientForInputCachesBaseClients(t *testing.T) {
	runtime := newTestSDKRuntime(t)

	clientA, releaseA, err := runtime.clientForInput(context.Background(), QueryInput{})
	if err != nil {
		t.Fatalf("clientForInput failed: %v", err)
	}
	defer releaseA()

	clientB, releaseB, err := runtime.clientForInput(context.Background(), QueryInput{})
	if err != nil {
		t.Fatalf("second clientForInput failed: %v", err)
	}
	defer releaseB()

	if clientA == runtime.client || clientB == runtime.client {
		t.Fatal("expected request-scoped clients, not the shared base client")
	}
	if clientA != clientB {
		t.Fatal("expected the same cache key to reuse the same cached client")
	}
	if clientA.GetSessionStore() != runtime.client.GetSessionStore() {
		t.Fatal("expected request client to reuse the shared session store")
	}
	if clientA.GetArtifactStore() != runtime.client.GetArtifactStore() {
		t.Fatal("expected request client to reuse the shared artifact store")
	}
}

// TestSDKRuntimeClientForInputCachesProviderOverrideClients mirrors the base
// case above for the RuntimeProvider (per-session model override) path.
func TestSDKRuntimeClientForInputCachesProviderOverrideClients(t *testing.T) {
	runtime := newTestSDKRuntime(t)
	input := QueryInput{RuntimeProvider: &RuntimeProviderConfig{
		Provider: "anthropic",
		ModelID:  "claude-3-5-sonnet-20241022",
		Secret:   "test-secret",
	}}

	clientA, releaseA, err := runtime.clientForInput(context.Background(), input)
	if err != nil {
		t.Fatalf("provider clientForInput failed: %v", err)
	}
	defer releaseA()

	clientB, releaseB, err := runtime.clientForInput(context.Background(), input)
	if err != nil {
		t.Fatalf("second provider clientForInput failed: %v", err)
	}
	defer releaseB()

	if clientA == runtime.client || clientB == runtime.client {
		t.Fatal("expected provider override clients to be request-scoped")
	}
	if clientA != clientB {
		t.Fatal("expected the same provider override key to reuse the same cached client")
	}
	if clientA.GetSessionStore() != runtime.client.GetSessionStore() {
		t.Fatal("expected provider override client to reuse the shared session store")
	}
}

// TestSDKRuntimeClientForInputDoesNotShareAcrossDifferentKeys guards the
// other half of the cache's correctness: two calls whose keys genuinely
// differ (here, different users) must never resolve to the same cached
// client - only same-key reuse is safe.
func TestSDKRuntimeClientForInputDoesNotShareAcrossDifferentKeys(t *testing.T) {
	runtime := newTestSDKRuntime(t)

	clientA, releaseA, err := runtime.clientForInput(context.Background(), QueryInput{UserID: "user-a"})
	if err != nil {
		t.Fatalf("clientForInput failed: %v", err)
	}
	defer releaseA()

	clientB, releaseB, err := runtime.clientForInput(context.Background(), QueryInput{UserID: "user-b"})
	if err != nil {
		t.Fatalf("second clientForInput failed: %v", err)
	}
	defer releaseB()

	if clientA == clientB {
		t.Fatal("expected different users to get different cached clients")
	}
}

func TestInteractiveMaxTokensForModelUsesProviderCatalog(t *testing.T) {
	got := InteractiveMaxTokensForModel(sdk.ModelIdentifier{
		Provider: sdk.APIProviderZAi,
		Model:    "glm-5.1",
	})
	if got != 128000 {
		t.Fatalf("expected Z.ai catalog max output 128000, got %d", got)
	}
}

func TestInteractiveMaxTokensForModelFallsBackForUnknownModels(t *testing.T) {
	got := InteractiveMaxTokensForModel(sdk.ModelIdentifier{
		Provider: sdk.APIProviderOllama,
		Model:    "locally-detected-model",
	})
	if got != 4096 {
		t.Fatalf("expected conservative fallback max output 4096, got %d", got)
	}
}
