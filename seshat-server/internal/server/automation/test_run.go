package automation

import (
	"context"
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
	rt := &dataflow.Runtime{Secrets: secrets, Expr: s.exprEval}

	items := make([]dataflow.Item, len(seed))
	for i, m := range seed {
		items[i] = dataflow.Item(m)
	}

	return dataflow.Run(ctx, graph, s.nodeRegistry, rt, items, dataflow.Options{})
}
