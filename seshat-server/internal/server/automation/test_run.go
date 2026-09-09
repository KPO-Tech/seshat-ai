package automation

import (
	"context"
	"fmt"
	"strings"

	"github.com/KPO-Tech/seshat/pkg/dataflow"

	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
)

// TestRunGraph executes graph immediately and returns its full Result,
// without ever creating a JobRun/NodeTrace row or touching the job-queue/
// device-claim path at all - lets the graph editor test a node (or the
// ancestor chain feeding it) while still building the graph, not only
// "Run now" on an already-saved whole job. Same permission CreateJob/
// UpdateJob already require, since this resolves the same org-scoped
// secrets a saved job's own run would.
//
// Runtime.Agent/Subworkflow are deliberately left nil - both need a full
// sdk.Session/executor built from provider config, RAG, MCP, and sandbox
// posture (see executeCloudRun), out of scope for an ad-hoc node test. A
// tested closure containing an "agent"/"subworkflow" node fails clearly at
// that one node, same as any other misconfigured node; agent nodes already
// have Companion's own chat surface for iterating.
func (s *Service) TestRunGraph(ctx context.Context, principal *iam.Principal, organizationID string, graph dataflow.Definition, seed []map[string]any) (dataflow.Result, error) {
	if principal == nil {
		return dataflow.Result{}, ErrUnauthorized("authentication required")
	}
	organizationID = strings.TrimSpace(organizationID)
	if organizationID == "" {
		return dataflow.Result{}, ErrInvalidInput("organization_id is required")
	}
	if err := s.iam.CheckOrganizationPermission(s.db.Gorm().WithContext(ctx), principal, organizationID, "jobs.manage", "organization.manage"); err != nil {
		return dataflow.Result{}, err
	}
	if s.nodeRegistry == nil {
		return dataflow.Result{}, ErrInvalidInput("this deployment has no dataflow node registry configured")
	}

	var secrets dataflow.SecretResolver
	if s.secrets != nil {
		secrets = orgScopedSecretResolver{resolver: s.secrets, organizationID: organizationID}
	}
	var vars map[string]string
	if s.variables != nil {
		var err error
		vars, err = s.variables.ResolveAll(ctx, organizationID)
		if err != nil {
			return dataflow.Result{}, fmt.Errorf("resolve variables: %w", err)
		}
	}
	rt := &dataflow.Runtime{Secrets: secrets, Expr: s.exprEval, Vars: vars}

	items := make([]dataflow.Item, len(seed))
	for i, m := range seed {
		items[i] = dataflow.Item(m)
	}

	return dataflow.Run(ctx, graph, s.nodeRegistry, rt, items, dataflow.Options{})
}

// ConnectionTestResult is the outcome of a real connection attempt (Tier
// 3.5) - OK/Message, not ok/invalid_credential/unknown like
// probeProviderCredential's LLM-provider probe. A DB driver's own error
// message already tells the caller what's wrong (bad password, unreachable
// host, ...) without needing a classification layer on top - the same
// fundamentally 2-way shape n8n's own INodeCredentialTestResult uses for its
// core `ICredentialTestRequest` contract (the 3-way "unknown" middle state
// in n8n's own probeCredentialAuth exists specifically because HTTP status
// codes give a universal 401/403 signal that DB drivers don't).
type ConnectionTestResult struct {
	OK      bool   `json:"ok"`
	Message string `json:"message"`
}

// TestNodeConnection verifies a node's own secretRef-based connection (a SQL
// Ping, a Redis PING, ...) without requiring the rest of its parameters
// (query, key, operation, ...) to be filled in or valid - see
// dataflow.TestableExecutor's doc comment for why this needs a node-level
// capability rather than a declarative per-credential-type test contract.
//
// Structural problems (no principal, empty org, permission denied, no
// registry, unknown node type, a node type with no TestableExecutor) are a
// plain error - the same "request itself was bad" convention TestRunGraph
// uses. The connection attempt's own outcome becomes a ConnectionTestResult
// inside a nil error - "the test genuinely ran and reported what happened",
// same convention TestRunGraph's own doc comment states for a per-node
// failure inside a Result.
func (s *Service) TestNodeConnection(ctx context.Context, principal *iam.Principal, organizationID, nodeType string, params map[string]any) (ConnectionTestResult, error) {
	if principal == nil {
		return ConnectionTestResult{}, ErrUnauthorized("authentication required")
	}
	organizationID = strings.TrimSpace(organizationID)
	if organizationID == "" {
		return ConnectionTestResult{}, ErrInvalidInput("organization_id is required")
	}
	if err := s.iam.CheckOrganizationPermission(s.db.Gorm().WithContext(ctx), principal, organizationID, "jobs.manage", "organization.manage"); err != nil {
		return ConnectionTestResult{}, err
	}
	if s.nodeRegistry == nil {
		return ConnectionTestResult{}, ErrInvalidInput("this deployment has no dataflow node registry configured")
	}
	executor, err := s.nodeRegistry.Get(nodeType)
	if err != nil {
		return ConnectionTestResult{}, ErrInvalidInput(err.Error())
	}
	testable, ok := executor.(dataflow.TestableExecutor)
	if !ok {
		return ConnectionTestResult{}, ErrInvalidInput(fmt.Sprintf("node type %q has no connection to test", nodeType))
	}

	var secrets dataflow.SecretResolver
	if s.secrets != nil {
		secrets = orgScopedSecretResolver{resolver: s.secrets, organizationID: organizationID}
	}
	rt := &dataflow.Runtime{Secrets: secrets}

	if err := testable.TestConnection(ctx, rt, params); err != nil {
		return ConnectionTestResult{OK: false, Message: err.Error()}, nil
	}
	return ConnectionTestResult{OK: true, Message: "Connected"}, nil
}
