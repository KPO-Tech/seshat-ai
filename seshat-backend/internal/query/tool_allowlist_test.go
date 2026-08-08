package query

import (
	"context"
	"reflect"
	"testing"

	backendauth "github.com/EngineerProjects/seshat-ai/seshat-backend/internal/auth"
	"github.com/KPO-Tech/seshat/pkg/agent"
)

func TestToolAllowlistFromPatterns(t *testing.T) {
	cases := []struct {
		name         string
		patterns     []string
		wantAllowed  []string
		wantRestrict bool
	}{
		{"bare star means unrestricted", []string{"*"}, nil, false},
		{"empty means unrestricted", nil, nil, false},
		{"exact names restrict", []string{"inbox_list_threads", "inbox_get_thread"}, []string{"inbox_list_threads", "inbox_get_thread"}, true},
		{"a glob beyond bare star fails open", []string{"inbox_*"}, nil, false},
		{"mixed exact and glob fails open entirely", []string{"inbox_list_threads", "inbox_*"}, nil, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			allowed, restrict := toolAllowlistFromPatterns(tc.patterns)
			if restrict != tc.wantRestrict {
				t.Fatalf("restrict = %v, want %v", restrict, tc.wantRestrict)
			}
			if !reflect.DeepEqual(allowed, tc.wantAllowed) {
				t.Fatalf("allowed = %v, want %v", allowed, tc.wantAllowed)
			}
		})
	}
}

// fakeAgentsProvider returns a fixed definition (or none) regardless of slug -
// enough to exercise BuildContextInput's tool-allowlist wiring without a real
// internal/agents.Service or database.
type fakeAgentsProvider struct {
	def *agent.AgentDefinition
}

func (f fakeAgentsProvider) GetDefinition(ctx context.Context, principal *backendauth.Principal, slug string) (*agent.AgentDefinition, bool) {
	if f.def == nil {
		return nil, false
	}
	return f.def, true
}

func TestBuildContextInput_PopulatesAllowedToolsFromAgentDefinition(t *testing.T) {
	svc := &Service{
		agents: fakeAgentsProvider{def: &agent.AgentDefinition{
			Tools: []string{"inbox_list_threads", "inbox_get_thread"},
		}},
	}
	input, _ := svc.BuildContextInput(context.Background(), ContextBuildParams{
		Prompt:    "hello",
		AgentSlug: "inbox-agent",
	})
	want := []string{"inbox_list_threads", "inbox_get_thread"}
	if !reflect.DeepEqual(input.AllowedTools, want) {
		t.Fatalf("AllowedTools = %v, want %v", input.AllowedTools, want)
	}
}

func TestBuildContextInput_NoRestrictionWhenAgentToolsIsNil(t *testing.T) {
	svc := &Service{
		agents: fakeAgentsProvider{def: &agent.AgentDefinition{Tools: nil}},
	}
	input, _ := svc.BuildContextInput(context.Background(), ContextBuildParams{
		Prompt:    "hello",
		AgentSlug: "some-unrestricted-agent",
	})
	if len(input.AllowedTools) != 0 {
		t.Fatalf("AllowedTools = %v, want empty (unrestricted)", input.AllowedTools)
	}
}

func TestBuildContextInput_NoAgentSlugMeansNoRestriction(t *testing.T) {
	svc := &Service{
		agents: fakeAgentsProvider{def: &agent.AgentDefinition{Tools: []string{"inbox_list_threads"}}},
	}
	input, _ := svc.BuildContextInput(context.Background(), ContextBuildParams{
		Prompt: "hello",
		// AgentSlug intentionally empty - general chat must never be restricted.
	})
	if len(input.AllowedTools) != 0 {
		t.Fatalf("AllowedTools = %v, want empty when no agent_slug is set", input.AllowedTools)
	}
}
