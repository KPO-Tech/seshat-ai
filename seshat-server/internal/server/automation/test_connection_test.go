package automation

import (
	"context"
	"testing"

	"github.com/KPO-Tech/seshat/pkg/dataflow"
	dataflowdatabase "github.com/KPO-Tech/seshat/pkg/dataflow/nodes/database"
)

func TestTestNodeConnectionRequiresPrincipal(t *testing.T) {
	env := newTestEnv(t)
	_, err := env.automation.TestNodeConnection(context.Background(), nil, env.orgID, "sqlite", nil)
	if err == nil {
		t.Fatal("expected an error for a nil principal")
	}
}

func TestTestNodeConnectionRequiresOrganizationID(t *testing.T) {
	env := newTestEnv(t)
	_, err := env.automation.TestNodeConnection(context.Background(), env.adminPrincipal, "", "sqlite", nil)
	if err == nil {
		t.Fatal("expected an error for an empty organization_id")
	}
}

func TestTestNodeConnectionRequiresNodeRegistry(t *testing.T) {
	env := newTestEnv(t)
	_, err := env.automation.TestNodeConnection(context.Background(), env.adminPrincipal, env.orgID, "sqlite", nil)
	if err == nil {
		t.Fatal("expected an error when no node registry is configured")
	}
}

func TestTestNodeConnectionRejectsUnknownNodeType(t *testing.T) {
	env := newTestEnv(t)
	env.automation.SetNodeRegistry(dataflow.NewRegistry())
	_, err := env.automation.TestNodeConnection(context.Background(), env.adminPrincipal, env.orgID, "bogus", nil)
	if err == nil {
		t.Fatal("expected an error for an unregistered node type")
	}
}

func TestTestNodeConnectionRejectsNodeTypeWithoutTestableExecutor(t *testing.T) {
	env := newTestEnv(t)
	reg := dataflow.NewRegistry()
	reg.Register("echo", echoExecutor{})
	env.automation.SetNodeRegistry(reg)

	_, err := env.automation.TestNodeConnection(context.Background(), env.adminPrincipal, env.orgID, "echo", nil)
	if err == nil {
		t.Fatal("expected an error for a node type with no connection to test")
	}
}

func TestTestNodeConnectionSucceedsForARealConnection(t *testing.T) {
	env := newTestEnv(t)
	reg := dataflow.NewRegistry()
	reg.Register("sqlite", dataflowdatabase.NewSQLite())
	env.automation.SetNodeRegistry(reg)
	env.automation.SetSecretResolver(&fakeSecretResolver{value: "file::memory:?cache=shared"})

	result, err := env.automation.TestNodeConnection(context.Background(), env.adminPrincipal, env.orgID, "sqlite", map[string]any{"dsnSecretRef": "db"})
	if err != nil {
		t.Fatalf("test connection: %v", err)
	}
	if !result.OK {
		t.Fatalf("expected a real sqlite connection to succeed, got %#v", result)
	}
}

func TestTestNodeConnectionReportsAFailedConnectionAsOKFalseNotAnError(t *testing.T) {
	env := newTestEnv(t)
	reg := dataflow.NewRegistry()
	reg.Register("postgres", dataflowdatabase.NewPostgres())
	env.automation.SetNodeRegistry(reg)
	env.automation.SetSecretResolver(&fakeSecretResolver{value: "postgres://user:pass@127.0.0.1:1/nonexistent"})

	result, err := env.automation.TestNodeConnection(context.Background(), env.adminPrincipal, env.orgID, "postgres", map[string]any{"dsnSecretRef": "db"})
	if err != nil {
		t.Fatalf("expected a bad connection to still be a 200-shaped result, not an error: %v", err)
	}
	if result.OK {
		t.Fatal("expected OK=false against an unreachable host")
	}
	if result.Message == "" {
		t.Fatal("expected a non-empty failure message")
	}
}
