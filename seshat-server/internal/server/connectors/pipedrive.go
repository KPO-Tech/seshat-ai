package connectors

// pipedriveKind is agent_action-only, same reasoning as gsheets.go:
// Pipedrive has no Discover/Sync in this package, it never implements
// knowledgeConnector.
//
// Structural quirk, unlike every OAuth kind before it in this file:
// Pipedrive's authorize/token hosts are fixed (oauth.pipedrive.com), but
// its REST API host is dynamic per-account - the token exchange response
// includes an "api_domain" field (e.g. "https://acme.pipedrive.com") that
// every subsequent API call must use instead of any generic host,
// verified against Pipedrive's OAuth docs before writing this ("you do
// not have to make additional requests to /users/me, because you will now
// receive up-to-date company_domain every time you make the initial
// request to get the tokens or when you refresh a token"). Captured into
// ConnectorAccount.Config at connect time (CompleteConnectorOAuth) and
// read back via Service.AccountConfigForUser - see that method's doc
// comment for the accepted staleness tradeoff (not refreshed on
// AccessTokenForUser's automatic token refresh).
const pipedriveKind connectorKind = "pipedrive"

// pipedriveScopes: deals:full, verified against Pipedrive's OAuth scopes
// reference before writing this - the named scope that covers this
// batch's one representative action (create a deal) end to end.
var pipedriveScopes = []string{"deals:full"}
