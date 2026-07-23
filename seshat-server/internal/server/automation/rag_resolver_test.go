package automation

import (
	"context"
	"testing"

	sdkrag "github.com/KPO-Tech/seshat/pkg/rag"
)

// fakeRAGResolver lets tests observe how executeCloudRun consults the
// injected RAGResolver without needing a real knowledge.Service (which
// would need a real embedder/vector store) or touching the network.
type fakeRAGResolver struct {
	calledWithOrgID string
	callCount       int
	service         *sdkrag.Service
	ok              bool
}

func (f *fakeRAGResolver) RAGServiceForOrganization(_ context.Context, organizationID string) (*sdkrag.Service, bool, error) {
	f.calledWithOrgID = organizationID
	f.callCount++
	return f.service, f.ok, nil
}

func TestSetRAGResolverWiresTheResolverIn(t *testing.T) {
	env := newTestEnv(t)
	if env.automation.rag != nil {
		t.Fatal("expected a fresh Service to have no RAGResolver until SetRAGResolver is called")
	}

	fake := &fakeRAGResolver{}
	env.automation.SetRAGResolver(fake)
	if env.automation.rag == nil {
		t.Fatal("expected SetRAGResolver to set the resolver")
	}
}

// TestExecuteCloudRunFailsBeforeConsultingRAGResolverWithoutProviderSettings
// pins down the current ordering: provider credential resolution happens
// before RAG resolution, so a job with no provider_settings configured
// fails (as already covered by
// TestExecuteCloudRunFailsCleanlyWithNoProviderSettingsConfigured) without
// ever calling the injected resolver — cheap confirmation that adding the
// RAG-resolution step didn't change this failure path's behavior.
func TestExecuteCloudRunFailsBeforeConsultingRAGResolverWithoutProviderSettings(t *testing.T) {
	env := newTestEnv(t)
	fake := &fakeRAGResolver{}
	env.automation.SetRAGResolver(fake)

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
		t.Fatalf("expected the RAG resolver not to be consulted before provider credentials are resolved, got %d calls", fake.callCount)
	}
}

func TestSetDoclingURLWiresTheURLIn(t *testing.T) {
	env := newTestEnv(t)
	if env.automation.doclingURL != "" {
		t.Fatalf("expected a fresh Service to have no docling URL, got %q", env.automation.doclingURL)
	}

	env.automation.SetDoclingURL("http://docling:5001")
	if env.automation.doclingURL != "http://docling:5001" {
		t.Fatalf("expected SetDoclingURL to set the URL, got %q", env.automation.doclingURL)
	}
}
