package connectors

// jiraKind is agent_action-only, same reasoning as gsheets.go: Jira has no
// Discover/Sync in this package, it never implements knowledgeConnector.
// Shares Atlassian's OAuth endpoint and identity lookup with confluenceKind
// (oauth.go's connectorOAuthEndpoint/fetchConnectorIdentity/
// BeginConnectorOAuth's audience+prompt=consent auth options already switch
// on confluenceKind - extended to include this kind too) -
// fetchAtlassianAccountEmail's own doc comment already anticipated this:
// "the same identity lookup would serve any future Atlassian-product
// connector (Jira, etc.)".
const jiraKind connectorKind = "jira"

// jiraScopes: granular scopes (same style as ConfluenceScopes in
// pkg/connectors/confluence.go, not the broader classic
// read:jira-work/write:jira-work), least-privilege for this batch's one
// representative action (create an issue) - no read scope requested since
// nothing in this batch reads Jira data back. read:me for identity
// resolution (fetchAtlassianAccountEmail), offline_access for a refresh
// token - both verified against Atlassian's OAuth 2.0 (3LO) docs before
// writing this, same as confluence.
var jiraScopes = []string{
	"write:issue:jira",
	"read:me",
	"offline_access",
}
