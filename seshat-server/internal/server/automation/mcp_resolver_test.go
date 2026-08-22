package automation

import (
	"context"
	"testing"

	"github.com/KPO-Tech/seshat/pkg/sdk"
)

// fakeMCPResolver mirrors fakeRAGResolver's shape (rag_resolver_test.go) -
// lets tests observe how executeCloudRun consults the injected MCPResolver
// without needing a real mcpregistry.Service.
type fakeMCPResolver struct {
	calledWithOrgID  string
	calledWithUserID string
	callCount        int
	servers          []sdk.MCPServerConfig
	err              error
}

func (f *fakeMCPResolver) ResolveServerConfigsForUser(_ context.Context, organizationID, userID string) ([]sdk.MCPServerConfig, error) {
	f.calledWithOrgID = organizationID
	f.calledWithUserID = userID
	f.callCount++
	return f.servers, f.err
}

func TestSetMCPResolverWiresTheResolverIn(t *testing.T) {
	env := newTestEnv(t)
	if env.automation.mcp != nil {
		t.Fatal("expected a fresh Service to have no MCPResolver until SetMCPResolver is called")
	}

	fake := &fakeMCPResolver{}
	env.automation.SetMCPResolver(fake)
	if env.automation.mcp == nil {
		t.Fatal("expected SetMCPResolver to set the resolver")
	}
}

// TestExecuteCloudRunFailsBeforeConsultingMCPResolverWithoutProviderSettings
// mirrors TestExecuteCloudRunFailsBeforeConsultingRAGResolverWithoutProviderSettings
// (rag_resolver_test.go): provider credential resolution happens before MCP
// resolution too, so a job with no provider_settings configured fails
// without ever consulting the injected resolver.
func TestExecuteCloudRunFailsBeforeConsultingMCPResolverWithoutProviderSettings(t *testing.T) {
	env := newTestEnv(t)
	fake := &fakeMCPResolver{}
	env.automation.SetMCPResolver(fake)

	job, err := env.automation.CreateJob(context.Background(), env.adminPrincipal, CreateJobParams{
		OrganizationID:  env.orgID,
		Name:            "Cloud job",
		TriggerType:     TriggerTypeInterval,
		IntervalSeconds: 3600,
		ExecutionTarget: ExecutionTargetCloud,
		ModelOverride:   "anthropic:claude-sonnet-5",
		Prompt:          "Do cloud work.",
	})
	if err != nil {
		t.Fatalf("create job: %v", err)
	}
	run, err := env.automation.TriggerJobNow(context.Background(), env.adminPrincipal, job.ID)
	if err != nil {
		t.Fatalf("trigger job now: %v", err)
	}
	if err := env.automation.executeCloudRun(context.Background(), run.ID); err != nil {
		t.Fatalf("executeCloudRun: %v", err)
	}

	reloaded, err := env.automation.GetRun(context.Background(), env.adminPrincipal, run.ID)
	if err != nil {
		t.Fatalf("get run: %v", err)
	}
	if reloaded.Status != RunStatusFailed {
		t.Fatalf("expected the run to fail on missing provider_settings, got %s", reloaded.Status)
	}
	if fake.callCount != 0 {
		t.Fatalf("expected the MCP resolver not to be consulted before provider credentials are resolved, got %d calls", fake.callCount)
	}
}
