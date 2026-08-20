package connectors

import coremsgraph "github.com/EngineerProjects/seshat-ai/core/msgraph"

// outlookKind is agent_action-only, same reasoning as slack.go: Outlook has
// no Discover/Sync in this package, it never implements knowledgeConnector.
// The agent reaches it through internal/server/msgraphmcp, a small
// self-hosted MCP server wrapping core/msgraph, bridged with a per-employee
// Bearer token the same way every other agent_action kind is - see
// msgraphmcp's package doc comment.
const outlookKind connectorKind = "outlook"

// outlookScopes is this package's own name for the scopes outlook's OAuth
// connect flow (oauth.go) requests - re-exported from core/msgraph so
// there's exactly one list, not a locally duplicated one. Identity
// resolution reuses fetchMicrosoftAccountUPN (oauth.go) - already generic,
// no outlook-specific identity lookup needed.
var outlookScopes = coremsgraph.MailScopes
