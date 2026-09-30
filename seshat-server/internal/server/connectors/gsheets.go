package connectors

// gsheetsKind is agent_action-only, same reasoning as gmail.go: Google
// Sheets has no Discover/Sync in this package, it never implements
// knowledgeConnector - it's reached only through a dataflow node (the
// agent's own deterministic action), not through Knowledge sync. Shares
// Google's OAuth endpoint and identity lookup (oauth.go's
// connectorOAuthEndpoint/fetchConnectorIdentity already switch on
// gdriveKind/gmailKind - extended to include this kind too) - a distinct
// "kind" registration from gdrive/gmail even though it's the same Google
// identity provider, same reasoning those two already establish (an org
// registers - and can scope - one OAuth app per product surface).
const gsheetsKind connectorKind = "gsheets"

// gsheetsScopes: Google exposes a single unified scope for Sheets, no
// read-only/write-only split (unlike Calendar's calendar.events) - verified
// against Google's OAuth 2.0 Scopes for Google APIs reference before
// writing this.
var gsheetsScopes = []string{"https://www.googleapis.com/auth/spreadsheets"}
