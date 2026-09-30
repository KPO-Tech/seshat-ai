package automation

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/KPO-Tech/seshat/pkg/dataflow"

	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
)

// PreviewExpression evaluates source as a JS expression body (no leading "="
// - the caller has already decided this field counts as an expression, so
// the raw JS goes straight to the evaluator) against the same bindings a
// real Graph run would give it via dataflow.ResolveValue: $json (item),
// $itemIndex, $now, $today, $node (via the exported Runtime.NodeAccessor -
// nil-safe, resolves to {json: null, all: []} for any name, since a preview
// has no completed upstream nodes to record real output for), and $vars
// (Tier 3.2 - only when organizationID is non-empty and the caller has read
// access to it; empty otherwise). Lets the graph editor show a real resolved
// value while a user is still authoring an expression, instead of only
// finding out it's wrong once the graph actually runs.
//
// Unlike $json/$itemIndex/$now/$today/$node (pure JS-sandbox evaluation
// against caller-supplied sample data, nothing tenant-scoped), resolving
// $vars touches a real organization's configured values - principal is
// checked against organizationID before anything is resolved, so an
// authenticated caller can't probe another organization's variables by
// passing an arbitrary organization_id.
func (s *Service) PreviewExpression(ctx context.Context, principal *iam.Principal, organizationID, source string, item map[string]any, itemIndex int) (any, error) {
	if s.exprEval == nil {
		return nil, errors.New("expression evaluation is not configured on this deployment")
	}
	var vars map[string]string
	organizationID = strings.TrimSpace(organizationID)
	if organizationID != "" {
		if principal == nil {
			return nil, ErrUnauthorized("authentication required")
		}
		if err := s.iam.CheckOrganizationPermission(s.db.Gorm().WithContext(ctx), principal, organizationID, "variables.read", "variables.manage", "organization.manage"); err != nil {
			return nil, err
		}
		if s.variables != nil {
			var err error
			vars, err = s.variables.ResolveAll(ctx, organizationID)
			if err != nil {
				return nil, err
			}
		}
	}
	rt := &dataflow.Runtime{Expr: s.exprEval, Vars: vars}
	now := time.Now()
	bindings := map[string]any{
		"$json":      item,
		"$itemIndex": itemIndex,
		"$now":       now,
		"$today":     now.Truncate(24 * time.Hour),
		"$node":      rt.NodeAccessor(),
		"$vars":      rt.VarsMap(),
	}
	return s.exprEval.Eval(ctx, source, bindings)
}
