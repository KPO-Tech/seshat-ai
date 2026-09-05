package automation

import (
	"context"
	"testing"

	dataflowexpr "github.com/KPO-Tech/seshat/pkg/dataflow/expr"
)

func TestPreviewExpressionFailsClearlyWithoutAnEvaluatorConfigured(t *testing.T) {
	env := newTestEnv(t)
	_, err := env.automation.PreviewExpression(context.Background(), "1 + 1", nil, 0)
	if err == nil {
		t.Fatal("expected an error when no ExpressionEvaluator has been wired via SetExpressionEvaluator")
	}
}

func TestPreviewExpressionEvaluatesAgainstTheGivenSampleItem(t *testing.T) {
	env := newTestEnv(t)
	env.automation.SetExpressionEvaluator(dataflowexpr.NewPool(1))

	value, err := env.automation.PreviewExpression(context.Background(), "$json.n * 2", map[string]any{"n": 3}, 0)
	if err != nil {
		t.Fatalf("preview: %v", err)
	}
	n, ok := value.(int64)
	if !ok || n != 6 {
		t.Fatalf("expected 6, got %#v (%T)", value, value)
	}
}

func TestPreviewExpressionOffersItemIndexNowTodayAndNodeBindings(t *testing.T) {
	env := newTestEnv(t)
	env.automation.SetExpressionEvaluator(dataflowexpr.NewPool(1))

	value, err := env.automation.PreviewExpression(context.Background(),
		"$itemIndex === 4 && typeof $now !== 'undefined' && typeof $today !== 'undefined' && typeof $node === 'function'",
		map[string]any{}, 4)
	if err != nil {
		t.Fatalf("preview: %v", err)
	}
	if value != true {
		t.Fatalf("expected all bindings to be present, got %#v", value)
	}
}

func TestPreviewExpressionNodeAccessorIsEmptyForAnyName(t *testing.T) {
	// A preview has no completed upstream nodes to record real output for -
	// $node(...) must resolve to the same nil-safe empty shape
	// dataflow.Runtime.NodeAccessor already gives an unrecorded name, not
	// error out just because nothing has actually run yet.
	env := newTestEnv(t)
	env.automation.SetExpressionEvaluator(dataflowexpr.NewPool(1))

	value, err := env.automation.PreviewExpression(context.Background(), "$node('anything').json === null && $node('anything').all.length === 0", map[string]any{}, 0)
	if err != nil {
		t.Fatalf("preview: %v", err)
	}
	if value != true {
		t.Fatalf("expected $node to resolve to an empty accessor, got %#v", value)
	}
}

func TestPreviewExpressionPropagatesEvaluationErrors(t *testing.T) {
	env := newTestEnv(t)
	env.automation.SetExpressionEvaluator(dataflowexpr.NewPool(1))

	_, err := env.automation.PreviewExpression(context.Background(), "this is not valid js at all (((", map[string]any{}, 0)
	if err == nil {
		t.Fatal("expected an error for invalid JS")
	}
}
