package knowledgetool

import (
	"context"
	"errors"
	"testing"

	backendauth "github.com/EngineerProjects/seshat-ai/seshat-backend/internal/auth"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/knowledge"
	"github.com/KPO-Tech/seshat/pkg/rag"
	"github.com/KPO-Tech/seshat/pkg/tools"
)

// fakeBackend is a minimal knowledge.Backend stub for exercising SearchTool
// without a real store - only ListCorpora/GetCorpus/Search are used by
// SearchTool, so everything else panics if called.
type fakeBackend struct {
	knowledge.Backend

	corpora     []knowledge.Corpus
	listErr     error
	results     map[string]*rag.SearchResponse // corpusID -> response
	searchErrs  map[string]error               // corpusID -> error
	getCorpusFn func(corpusID string) (*knowledge.Corpus, error)
}

func (f *fakeBackend) ListCorpora(_ context.Context, _ *backendauth.Principal) ([]knowledge.Corpus, error) {
	if f.listErr != nil {
		return nil, f.listErr
	}
	return f.corpora, nil
}

func (f *fakeBackend) GetCorpus(_ context.Context, _ *backendauth.Principal, corpusID string) (*knowledge.Corpus, error) {
	if f.getCorpusFn != nil {
		return f.getCorpusFn(corpusID)
	}
	for _, c := range f.corpora {
		if c.ID == corpusID {
			return &c, nil
		}
	}
	return nil, errors.New("corpus not found")
}

func (f *fakeBackend) Search(_ context.Context, _ *backendauth.Principal, params knowledge.SearchParams) (*rag.SearchResponse, error) {
	if err, ok := f.searchErrs[params.CorpusID]; ok {
		return nil, err
	}
	if resp, ok := f.results[params.CorpusID]; ok {
		return resp, nil
	}
	return &rag.SearchResponse{CorpusID: params.CorpusID, Results: nil}, nil
}

func principalCtx() context.Context {
	return backendauth.WithContext(context.Background(), &backendauth.Principal{
		User: backendauth.User{ID: "user-1"},
	})
}

func TestSearchTool_Call_NoPrincipalInContext(t *testing.T) {
	tool := NewSearchTool(&fakeBackend{})
	result, err := tool.Call(context.Background(), tools.CallInput{
		Parsed: map[string]any{"query": "invoices"},
	}, nil)
	if err != nil {
		t.Fatalf("Call: %v", err)
	}
	if result.Error == nil {
		t.Fatalf("expected an error result when no principal is in context, got %+v", result)
	}
}

func TestSearchTool_Call_MergesSortsAndTrimsAcrossCorpora(t *testing.T) {
	backend := &fakeBackend{
		corpora: []knowledge.Corpus{
			{ID: "c1", Name: "Corpus One"},
			{ID: "c2", Name: "Corpus Two"},
		},
		results: map[string]*rag.SearchResponse{
			"c1": {CorpusID: "c1", Results: []rag.SearchResult{
				{Key: "c1-a", Text: "low score", Score: 0.2},
				{Key: "c1-b", Text: "high score", Score: 0.9},
			}},
			"c2": {CorpusID: "c2", Results: []rag.SearchResult{
				{Key: "c2-a", Text: "mid score", Score: 0.5},
			}},
		},
	}
	tool := NewSearchTool(backend)

	result, err := tool.Call(principalCtx(), tools.CallInput{
		Parsed: map[string]any{"query": "invoices", "top_k": float64(2)},
	}, nil)
	if err != nil {
		t.Fatalf("Call: %v", err)
	}
	merged, ok := result.Data.([]taggedResult)
	if !ok {
		t.Fatalf("expected result.Data to be []taggedResult, got %T", result.Data)
	}
	if len(merged) != 2 {
		t.Fatalf("expected top_k=2 results, got %d", len(merged))
	}
	if merged[0].Key != "c1-b" || merged[0].CorpusID != "c1" {
		t.Errorf("expected highest-score result first (c1-b), got %+v", merged[0])
	}
	if merged[1].Key != "c2-a" {
		t.Errorf("expected second-highest result (c2-a) second, got %+v", merged[1])
	}
}

func TestSearchTool_Call_ScopedToSingleCorpus(t *testing.T) {
	backend := &fakeBackend{
		corpora: []knowledge.Corpus{
			{ID: "c1", Name: "Corpus One"},
			{ID: "c2", Name: "Corpus Two"},
		},
		results: map[string]*rag.SearchResponse{
			"c1": {CorpusID: "c1", Results: []rag.SearchResult{{Key: "c1-a", Text: "hit", Score: 0.7}}},
			"c2": {CorpusID: "c2", Results: []rag.SearchResult{{Key: "c2-a", Text: "should not appear", Score: 0.99}}},
		},
	}
	tool := NewSearchTool(backend)

	result, err := tool.Call(principalCtx(), tools.CallInput{
		Parsed: map[string]any{"query": "invoices", "corpus_id": "c1"},
	}, nil)
	if err != nil {
		t.Fatalf("Call: %v", err)
	}
	merged := result.Data.([]taggedResult)
	if len(merged) != 1 || merged[0].Key != "c1-a" {
		t.Fatalf("expected only c1's result, got %+v", merged)
	}
}

func TestSearchTool_Call_OneCorpusFailingDoesNotSinkTheWholeCall(t *testing.T) {
	backend := &fakeBackend{
		corpora: []knowledge.Corpus{
			{ID: "c1", Name: "Corpus One"},
			{ID: "c2", Name: "Corpus Two"},
		},
		results: map[string]*rag.SearchResponse{
			"c1": {CorpusID: "c1", Results: []rag.SearchResult{{Key: "c1-a", Text: "hit", Score: 0.7}}},
		},
		searchErrs: map[string]error{"c2": errors.New("boom")},
	}
	tool := NewSearchTool(backend)

	result, err := tool.Call(principalCtx(), tools.CallInput{
		Parsed: map[string]any{"query": "invoices"},
	}, nil)
	if err != nil {
		t.Fatalf("Call: %v", err)
	}
	if result.Error != nil {
		t.Fatalf("expected a partial success, got error result: %v", result.Error)
	}
	merged := result.Data.([]taggedResult)
	if len(merged) != 1 || merged[0].Key != "c1-a" {
		t.Fatalf("expected the surviving corpus's result, got %+v", merged)
	}
}

func TestSearchTool_Call_AllCorporaFailingReturnsError(t *testing.T) {
	backend := &fakeBackend{
		corpora: []knowledge.Corpus{{ID: "c1", Name: "Corpus One"}},
		searchErrs: map[string]error{
			"c1": errors.New("boom"),
		},
	}
	tool := NewSearchTool(backend)

	result, err := tool.Call(principalCtx(), tools.CallInput{
		Parsed: map[string]any{"query": "invoices"},
	}, nil)
	if err != nil {
		t.Fatalf("Call: %v", err)
	}
	if result.Error == nil {
		t.Fatalf("expected an error result when every corpus search fails, got %+v", result)
	}
}

func TestSearchTool_Call_EmptyQueryIsRejected(t *testing.T) {
	tool := NewSearchTool(&fakeBackend{})
	result, err := tool.Call(principalCtx(), tools.CallInput{
		Parsed: map[string]any{"query": "   "},
	}, nil)
	if err != nil {
		t.Fatalf("Call: %v", err)
	}
	if result.Error == nil {
		t.Fatalf("expected an error result for a blank query, got %+v", result)
	}
}

func TestSearchTool_Call_NoCorporaAvailable(t *testing.T) {
	tool := NewSearchTool(&fakeBackend{corpora: nil})
	result, err := tool.Call(principalCtx(), tools.CallInput{
		Parsed: map[string]any{"query": "invoices"},
	}, nil)
	if err != nil {
		t.Fatalf("Call: %v", err)
	}
	if result.Error != nil {
		t.Fatalf("expected a plain informational text result, got error: %s", result.Error)
	}
}

var _ tools.Tool = (*SearchTool)(nil)
