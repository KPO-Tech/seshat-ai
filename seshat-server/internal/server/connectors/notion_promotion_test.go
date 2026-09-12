package connectors

import (
	"context"
	"net/url"
	"testing"

	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/knowledge"
)

// TestNotionKindNoLongerAgentActionOnly is a direct regression guard for
// the "promotion" this session made: agentActionOnlyKinds (oauth.go) must
// no longer list notion, now that core/connectors/notion.go implements
// real Discover/Sync.
func TestNotionKindNoLongerAgentActionOnly(t *testing.T) {
	if agentActionOnlyKinds["notion"] {
		t.Fatal("expected notionKind to no longer be agent_action-only")
	}
}

// TestConnectorForNotionReturnsAKnowledgeConnector proves connectorFor's
// new case actually resolves to something satisfying knowledgeConnector,
// not just that the switch compiles.
func TestConnectorForNotionReturnsAKnowledgeConnector(t *testing.T) {
	env := newTestEnv(t)
	if _, err := env.connectors.RegisterOAuthApp(context.Background(), env.adminPrincipal, RegisterOAuthAppParams{
		OrganizationID: env.orgID, Kind: "notion", ClientID: "client-1", ClientSecret: "secret-1",
	}); err != nil {
		t.Fatalf("register notion app: %v", err)
	}
	conn, err := env.connectors.connectorFor(context.Background(), "notion", env.orgID)
	if err != nil {
		t.Fatalf("connectorFor(notion): %v", err)
	}
	if conn.Kind() != "notion" {
		t.Fatalf("expected Kind() = notion, got %q", conn.Kind())
	}
}

// TestBeginConnectorOAuthNotionSupportsBothPurposes proves the promotion
// end-to-end: knowledge_sync (previously rejected by agentActionOnlyKinds)
// now works, and the pre-existing agent_action self-service flow
// (automation.NotionCreatePageNode's own connect path) is completely
// unaffected.
func TestBeginConnectorOAuthNotionSupportsBothPurposes(t *testing.T) {
	env := newTestEnv(t)
	setIdentity := setUpFakeConnectorOAuth(t, env)
	setIdentity("workspace-bot-id")

	if _, err := env.connectors.RegisterOAuthApp(context.Background(), env.adminPrincipal, RegisterOAuthAppParams{
		OrganizationID: env.orgID, Kind: "notion", ClientID: "client-1", ClientSecret: "secret-1",
	}); err != nil {
		t.Fatalf("register notion app: %v", err)
	}

	corpus, err := env.knowledge.CreateCorpus(context.Background(), env.adminPrincipal, knowledge.CreateCorpusParams{
		OrganizationID: env.orgID, Name: "Wiki",
	})
	if err != nil {
		t.Fatalf("create corpus: %v", err)
	}

	// knowledge_sync: previously rejected outright by agentActionOnlyKinds.
	authURL, err := env.connectors.BeginConnectorOAuth(context.Background(), env.adminPrincipal, "notion", BeginOAuthParams{
		OrganizationID: env.orgID, CorpusID: corpus.ID,
	})
	if err != nil {
		t.Fatalf("expected notion to now support knowledge_sync, got: %v", err)
	}
	state, err := url.Parse(authURL)
	if err != nil {
		t.Fatalf("parse authorization url: %v", err)
	}
	account, err := env.connectors.CompleteConnectorOAuth(context.Background(), "notion", "fake-code", state.Query().Get("state"))
	if err != nil {
		t.Fatalf("complete knowledge_sync oauth: %v", err)
	}
	if account.Purpose != PurposeKnowledgeSync || account.CorpusID != corpus.ID {
		t.Fatalf("expected a knowledge_sync account scoped to the corpus, got %+v", account)
	}

	// agent_action: the original, pre-existing self-service flow - must
	// still work exactly as before, unaffected by the promotion above.
	member := env.addMember(t)
	agentAuthURL, err := env.connectors.BeginConnectorOAuth(context.Background(), member, "notion", BeginOAuthParams{
		OrganizationID: env.orgID, Purpose: PurposeAgentAction,
	})
	if err != nil {
		t.Fatalf("expected notion agent_action self-service to still work, got: %v", err)
	}
	agentState, err := url.Parse(agentAuthURL)
	if err != nil {
		t.Fatalf("parse agent_action authorization url: %v", err)
	}
	agentAccount, err := env.connectors.CompleteConnectorOAuth(context.Background(), "notion", "fake-code-2", agentState.Query().Get("state"))
	if err != nil {
		t.Fatalf("complete agent_action oauth: %v", err)
	}
	if agentAccount.Purpose != PurposeAgentAction || agentAccount.CorpusID != "" {
		t.Fatalf("expected an agent_action account with no corpus, got %+v", agentAccount)
	}
}
