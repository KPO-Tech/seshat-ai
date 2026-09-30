package config

import (
	"testing"

	sdkrag "github.com/KPO-Tech/seshat/pkg/rag"
	sdkvector "github.com/KPO-Tech/seshat/pkg/vector"
)

func TestOrgModeFromEnvDefaultsToMulti(t *testing.T) {
	if got := orgModeFromEnv(); got != OrgModeMulti {
		t.Fatalf("expected an unset SESHAT_SERVER_ORG_MODE to default to %q, got %q", OrgModeMulti, got)
	}
}

func TestOrgModeFromEnvReadsSingle(t *testing.T) {
	t.Setenv("SESHAT_SERVER_ORG_MODE", "single")
	if got := orgModeFromEnv(); got != OrgModeSingle {
		t.Fatalf("expected %q, got %q", OrgModeSingle, got)
	}
}

func TestOrgModeFromEnvTrimsAndLowercases(t *testing.T) {
	t.Setenv("SESHAT_SERVER_ORG_MODE", "  Single  ")
	if got := orgModeFromEnv(); got != OrgModeSingle {
		t.Fatalf("expected whitespace/case to be normalized to %q, got %q", OrgModeSingle, got)
	}
}

func TestVectorStoreKindFromEnvReadsPrimaryName(t *testing.T) {
	t.Setenv("SESHAT_SERVER_VECTOR_STORE", "  MEMORY  ")
	t.Setenv("SESHAT_SERVER_VECTOR_BACKEND", "qdrant")

	if got := vectorStoreKindFromEnv(); got != sdkvector.StoreMemory {
		t.Fatalf("expected primary SESHAT_SERVER_VECTOR_STORE to win, got %q", got)
	}
}

func TestVectorStoreKindFromEnvFallsBackToLegacyBackend(t *testing.T) {
	t.Setenv("SESHAT_SERVER_VECTOR_STORE", "")
	t.Setenv("SESHAT_SERVER_VECTOR_BACKEND", "  HNSW  ")

	if got := vectorStoreKindFromEnv(); got != sdkvector.StoreHNSW {
		t.Fatalf("expected legacy SESHAT_SERVER_VECTOR_BACKEND fallback, got %q", got)
	}
}

func TestVectorConfigFromEnvDefaultsToHNSW(t *testing.T) {
	t.Setenv("SESHAT_SERVER_VECTOR_STORE", "")
	t.Setenv("SESHAT_SERVER_VECTOR_BACKEND", "")
	t.Setenv("SESHAT_SERVER_VECTOR_HNSW_DIR", "")
	t.Setenv("SESHAT_RUNTIME_ROOT", "")

	cfg := vectorConfigFromEnv()
	if cfg.StoreKind != sdkvector.StoreHNSW {
		t.Fatalf("expected default vector store %q, got %q", sdkvector.StoreHNSW, cfg.StoreKind)
	}
	if cfg.Backend != sdkvector.StoreHNSW { //nolint:staticcheck // verifying the deprecated mirror itself
		t.Fatalf("expected deprecated backend mirror %q, got %q", sdkvector.StoreHNSW, cfg.Backend) //nolint:staticcheck // same
	}
	if cfg.HNSWDir == "" {
		t.Fatal("expected default HNSW dir to be set")
	}
}

func TestVectorConfigFromEnvReadsOpenSearchSettings(t *testing.T) {
	t.Setenv("SESHAT_SERVER_VECTOR_STORE", "opensearch")
	t.Setenv("SESHAT_SERVER_VECTOR_DIM", "768")
	t.Setenv("SESHAT_SERVER_OPENSEARCH_ADDRESSES", " http://opensearch:9200, https://search.example.com ")
	t.Setenv("SESHAT_SERVER_OPENSEARCH_USERNAME", "seshat")
	t.Setenv("SESHAT_SERVER_OPENSEARCH_PASSWORD", "secret")
	t.Setenv("SESHAT_SERVER_OPENSEARCH_API_KEY", "api-key")
	t.Setenv("SESHAT_SERVER_OPENSEARCH_INDEX_PREFIX", "tenant-a")
	t.Setenv("SESHAT_SERVER_OPENSEARCH_CREATE_INDEX", "false")
	t.Setenv("SESHAT_SERVER_OPENSEARCH_KNN", "true")
	t.Setenv("SESHAT_SERVER_OPENSEARCH_INSECURE_SKIP_VERIFY", "true")
	t.Setenv("SESHAT_SERVER_OPENSEARCH_BULK_SIZE", "250")

	cfg := vectorConfigFromEnv()
	if cfg.StoreKind != sdkvector.StoreOpenSearch {
		t.Fatalf("expected OpenSearch store, got %q", cfg.StoreKind)
	}
	if cfg.Backend != sdkvector.StoreOpenSearch { //nolint:staticcheck // verifying the deprecated mirror itself
		t.Fatalf("expected deprecated backend mirror %q, got %q", sdkvector.StoreOpenSearch, cfg.Backend) //nolint:staticcheck // same
	}
	if cfg.Dim != 768 {
		t.Fatalf("expected dim 768, got %d", cfg.Dim)
	}
	if got, want := cfg.OpenSearchAddresses, []string{"http://opensearch:9200", "https://search.example.com"}; len(got) != len(want) || got[0] != want[0] || got[1] != want[1] {
		t.Fatalf("expected addresses %v, got %v", want, got)
	}
	if cfg.OpenSearchUsername != "seshat" || cfg.OpenSearchPassword != "secret" || cfg.OpenSearchAPIKey != "api-key" {
		t.Fatalf("expected OpenSearch auth fields to be read")
	}
	if cfg.OpenSearchIndexPrefix != "tenant-a" {
		t.Fatalf("expected index prefix tenant-a, got %q", cfg.OpenSearchIndexPrefix)
	}
	if cfg.OpenSearchCreateIndex == nil || *cfg.OpenSearchCreateIndex {
		t.Fatalf("expected create index override to be false, got %v", cfg.OpenSearchCreateIndex)
	}
	if !cfg.OpenSearchKNN {
		t.Fatal("expected KNN to be enabled")
	}
	if !cfg.OpenSearchInsecureSkipVerify {
		t.Fatal("expected insecure skip verify to be enabled")
	}
	if cfg.OpenSearchBulkSize != 250 {
		t.Fatalf("expected bulk size 250, got %d", cfg.OpenSearchBulkSize)
	}
}

func TestKnowledgeChunkProfileFromEnvDefaultsToMedium(t *testing.T) {
	t.Setenv("SESHAT_SERVER_KNOWLEDGE_CHUNK_PROFILE", "")
	t.Setenv("SESHAT_SERVER_KNOWLEDGE_CHUNK_MAX_TOKENS", "")
	t.Setenv("SESHAT_SERVER_KNOWLEDGE_CHUNK_OVERLAP_TOKENS", "")

	profile := knowledgeChunkProfileFromEnv()
	if profile.Name != sdkrag.ChunkProfileMedium {
		t.Fatalf("expected medium profile, got %+v", profile)
	}
	if profile.MaxTokens != 768 || profile.OverlapTokens != 120 {
		t.Fatalf("unexpected medium profile values: %+v", profile)
	}
}

func TestKnowledgeChunkProfileFromEnvReadsRecommendedProfile(t *testing.T) {
	t.Setenv("SESHAT_SERVER_KNOWLEDGE_CHUNK_PROFILE", " LARGE ")
	t.Setenv("SESHAT_SERVER_KNOWLEDGE_CHUNK_MAX_TOKENS", "")
	t.Setenv("SESHAT_SERVER_KNOWLEDGE_CHUNK_OVERLAP_TOKENS", "")

	profile := knowledgeChunkProfileFromEnv()
	if profile.Name != sdkrag.ChunkProfileLarge || profile.MaxTokens != 1536 {
		t.Fatalf("expected large profile, got %+v", profile)
	}
}

func TestKnowledgeChunkProfileFromEnvAllowsCustomOverride(t *testing.T) {
	t.Setenv("SESHAT_SERVER_KNOWLEDGE_CHUNK_PROFILE", "medium")
	t.Setenv("SESHAT_SERVER_KNOWLEDGE_CHUNK_MAX_TOKENS", "640")
	t.Setenv("SESHAT_SERVER_KNOWLEDGE_CHUNK_OVERLAP_TOKENS", "96")

	profile := knowledgeChunkProfileFromEnv()
	if profile.Name != sdkrag.ChunkProfileCustom {
		t.Fatalf("expected custom profile, got %+v", profile)
	}
	if profile.MaxTokens != 640 || profile.OverlapTokens != 96 {
		t.Fatalf("unexpected custom profile values: %+v", profile)
	}
}
