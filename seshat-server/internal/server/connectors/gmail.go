package connectors

import coregmail "github.com/KPO-Tech/seshat/pkg/gmail"

// gmailKind is agent_action-only, same reasoning as outlook.go/slack.go:
// Gmail has no Discover/Sync in this package, it never implements
// knowledgeConnector. The agent reaches it through
// internal/server/gmailmcp, a small self-hosted MCP server wrapping
// core/gmail, bridged with a per-employee Bearer token the same way every
// other agent_action kind is.
const gmailKind connectorKind = "gmail"

// gmailScopes is this package's own name for the scopes gmail's OAuth
// connect flow (oauth.go) requests - re-exported from core/gmail so
// there's exactly one list, not a locally duplicated one. Identity
// resolution reuses fetchGoogleAccountEmail (oauth.go, already generic,
// shared with gdrive) - no gmail-specific identity lookup needed.
var gmailScopes = coregmail.Scopes
