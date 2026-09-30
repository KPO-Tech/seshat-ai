package connectors

// zendeskKind is agent_action-only, same reasoning as gsheets.go: Zendesk
// has no Discover/Sync in this package, it never implements
// knowledgeConnector.
//
// The one kind in this whole package whose OAuth authorize/token hosts
// are themselves per-account, not just its REST API - verified against
// Zendesk's OAuth docs before writing this:
// https://{subdomain}.zendesk.com/oauth/authorizations/new and
// https://{subdomain}.zendesk.com/oauth/tokens, where subdomain is the
// org's own Zendesk account subdomain. Every other kind in this file
// shares a fixed provider host (or, for pipedriveKind/salesforceKind,
// only its REST API host is dynamic, discoverable from the token
// response). Zendesk's subdomain can't be discovered that way - it's
// needed before any token exists, to build the authorize redirect itself
// - so it's registered once at RegisterOAuthApp time alongside the OAuth
// app's ClientID/ClientSecret (sdb.ConnectorOAuthApp.Subdomain) rather
// than resolved per-connect or per-call.
const zendeskKind connectorKind = "zendesk"

// zendeskScopes: tickets:write (the named scope for this batch's one
// representative action, create a ticket) plus users:read - without the
// latter, GET /api/v2/users/me.json (fetchZendeskIdentity) fails and the
// entire connect flow breaks at the identity-resolution step, not just a
// later action, so it's included defensively even though it costs a
// little more than the strict minimum for ticket creation alone. Both
// verified against Zendesk's OAuth scopes docs before writing this.
var zendeskScopes = []string{"tickets:write", "users:read"}
