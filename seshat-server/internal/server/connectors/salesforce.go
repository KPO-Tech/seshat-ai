package connectors

// salesforceKind is agent_action-only, same reasoning as gsheets.go:
// Salesforce has no Discover/Sync in this package, it never implements
// knowledgeConnector.
//
// Same structural quirk as pipedriveKind: the authorize/token hosts are
// fixed (login.salesforce.com - production/Developer Edition orgs only,
// not sandboxes, which use test.salesforce.com instead; not offered as a
// choice in this pass), but the REST API host is dynamic per-org - the
// token exchange response includes an "instance_url" field (e.g.
// "https://acme.my.salesforce.com") every subsequent API call must use.
// Captured into ConnectorAccount.Config at connect time
// (CompleteConnectorOAuth) and read back via Service.AccountConfigForUser
// - see that method's doc comment for the accepted staleness tradeoff.
const salesforceKind connectorKind = "salesforce"

// salesforceScopes: "api" (REST API access) and "refresh_token" (Salesforce's
// own scope name for what every other provider in this file calls
// offline_access) - both verified against Salesforce's OAuth tokens/scopes
// docs before writing this.
var salesforceScopes = []string{"api", "refresh_token"}
