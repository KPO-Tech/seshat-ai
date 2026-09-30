package connectors

// githubKind is agent_action-only, same reasoning as gsheets.go: GitHub has
// no Discover/Sync in this package, it never implements knowledgeConnector.
const githubKind connectorKind = "github"

// githubScopes: public_repo, not the broader repo scope - narrowest scope
// that still covers this batch's one representative action (create an
// issue) on a public repository. An org wanting to create issues on
// private repos needs the broader repo scope instead - not offered as a
// choice in this pass, same "one representative action, least privilege"
// call made throughout this connectors initiative (e.g. gcalendar.events
// over the full calendar scope). Verified against GitHub's OAuth scopes
// reference before writing this.
var githubScopes = []string{"public_repo"}
