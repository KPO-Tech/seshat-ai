package connectors

// asanaKind is agent_action-only, same reasoning as gsheets.go: Asana has
// no Discover/Sync in this package, it never implements knowledgeConnector.
const asanaKind connectorKind = "asana"

// asanaScopes: "default", Asana's own documented value for an app
// registered with "Full permissions" rather than a set of granular
// resource:action scopes - verified against Asana's OAuth docs before
// writing this. Asana's granular scope names (e.g. "tasks:write") exist
// but aren't used here for one representative action.
var asanaScopes = []string{"default"}
