package connectors

import coremsgraph "github.com/KPO-Tech/seshat/pkg/msgraph"

// teamsKind is agent_action-only, same reasoning as outlook.go/slack.go.
const teamsKind connectorKind = "teams"

// teamsScopes is this package's own name for the scopes teams' OAuth
// connect flow (oauth.go) requests - re-exported from core/msgraph. Covers
// 1:1/group chats only for v1 - see coremsgraph.TeamsScopes' doc comment.
var teamsScopes = coremsgraph.TeamsScopes
