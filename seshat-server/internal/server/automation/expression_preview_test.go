package automation

import (
	"context"
	"testing"

	dataflowexpr "github.com/KPO-Tech/seshat/pkg/dataflow/expr"
)

func TestPreviewExpressionFailsClearlyWithoutAnEvaluatorConfigured(t *testing.T) {
	env := newTestEnv(t)
	_, err := env.automation.PreviewExpression(context.Background(), env.adminPrincipal, "", "1 + 1", nil, 0)
	if err == nil {
		t.Fatal("expected an error when no ExpressionEvaluator has been wired via SetExpressionEvaluator")
	}
}

func TestPreviewExpressionEvaluatesAgainstTheGivenSampleItem(t *testing.T) {
	env := newTestEnv(t)
	env.automation.SetExpressionEvaluator(dataflowexpr.NewPool(1))

	value, err := env.automation.PreviewExpression(context.Background(), env.adminPrincipal, "", "$json.n * 2", map[string]any{"n": 3}, 0)
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

	value, err := env.automation.PreviewExpression(context.Background(), env.adminPrincipal, "",
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

	value, err := env.automation.PreviewExpression(context.Background(), env.adminPrincipal, "", "$node('anything').json === null && $node('anything').all.length === 0", map[string]any{}, 0)
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

	_, err := env.automation.PreviewExpression(context.Background(), env.adminPrincipal, "", "this is not valid js at all (((", map[string]any{}, 0)
	if err == nil {
		t.Fatal("expected an error for invalid JS")
	}
}

// TestPreviewExpressionVarsBindingIsEmptyWithNoOrganizationID preserves the
// pre-Tier-3.2 behavior for any caller not yet passing organization_id:
// $vars just resolves to an empty object, not an error - same "off, not
// broken" posture the SDK's own Runtime.Vars has.
func TestPreviewExpressionVarsBindingIsEmptyWithNoOrganizationID(t *testing.T) {
	env := newTestEnv(t)
	env.automation.SetExpressionEvaluator(dataflowexpr.NewPool(1))

	value, err := env.automation.PreviewExpression(context.Background(), nil, "", "$vars.ANYTHING === undefined", map[string]any{}, 0)
	if err != nil {
		t.Fatalf("preview: %v", err)
	}
	if value != true {
		t.Fatalf("expected $vars to be empty with no organization_id, got %#v", value)
	}
}

// TestPreviewExpressionResolvesRealVarsForTheGivenOrganization proves $vars
// resolves to that organization's real configured values when
// organization_id is passed and the caller may read it - Tier 3.2's whole
// point (previewing an expression the same way it will actually resolve at
// real execution time).
func TestPreviewExpressionResolvesRealVarsForTheGivenOrganization(t *testing.T) {
	env := newTestEnv(t)
	env.automation.SetExpressionEvaluator(dataflowexpr.NewPool(1))
	env.automation.SetVariablesResolver(fakeVariableResolver{"API_BASE": "https://api.example.com"})

	value, err := env.automation.PreviewExpression(context.Background(), env.adminPrincipal, env.orgID, "$vars.API_BASE", map[string]any{}, 0)
	if err != nil {
		t.Fatalf("preview: %v", err)
	}
	if value != "https://api.example.com" {
		t.Fatalf("expected the real configured value, got %#v", value)
	}
}

// TestPreviewExpressionRejectsAnOrganizationIDThePrincipalCannotAccess is the
// security-relevant case: resolving $vars now touches real organization
// data, unlike every other binding this endpoint offers, so an
// organization_id the caller has no access to must be rejected rather than
// silently resolved. Same "made-up org id the caller has no membership in"
// fixture test_run_test.go's own TestTestRunGraphRejectsAnOrganizationThe
// PrincipalCannotAccess-style tests already use.
func TestPreviewExpressionRejectsAnOrganizationIDThePrincipalCannotAccess(t *testing.T) {
	env := newTestEnv(t)
	env.automation.SetExpressionEvaluator(dataflowexpr.NewPool(1))
	env.automation.SetVariablesResolver(fakeVariableResolver{"SECRET": "leaked"})

	otherOrgID := "org-not-mine"
	if _, err := env.automation.PreviewExpression(context.Background(), env.adminPrincipal, otherOrgID, "$vars.SECRET", map[string]any{}, 0); err == nil {
		t.Fatal("expected a permission error for an organization the principal has no membership in")
	}
}

type fakeVariableResolver map[string]string

func (f fakeVariableResolver) ResolveAll(_ context.Context, _ string) (map[string]string, error) {
	return f, nil
}
