package automation

import (
	"context"
	"errors"
	"time"

	"github.com/KPO-Tech/seshat/pkg/dataflow"
)

// PreviewExpression evaluates source as a JS expression body (no leading "="
// - the caller has already decided this field counts as an expression, so
// the raw JS goes straight to the evaluator) against the same bindings a
// real Graph run would give it via dataflow.ResolveValue: $json (item),
// $itemIndex, $now, $today, and $node (via the exported Runtime.
// NodeAccessor - nil-safe, resolves to {json: null, all: []} for any name,
// since a preview has no completed upstream nodes to record real output
// for). Lets the graph editor show a real resolved value while a user is
// still authoring an expression, instead of only finding out it's wrong
// once the graph actually runs.
func (s *Service) PreviewExpression(ctx context.Context, source string, item map[string]any, itemIndex int) (any, error) {
	if s.exprEval == nil {
		return nil, errors.New("expression evaluation is not configured on this deployment")
	}
	rt := &dataflow.Runtime{Expr: s.exprEval}
	now := time.Now()
	bindings := map[string]any{
		"$json":      item,
		"$itemIndex": itemIndex,
		"$now":       now,
		"$today":     now.Truncate(24 * time.Hour),
		"$node":      rt.NodeAccessor(),
	}
	return s.exprEval.Eval(ctx, source, bindings)
}
