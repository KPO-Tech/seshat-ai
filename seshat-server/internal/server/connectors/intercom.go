package connectors

// intercomKind is agent_action-only, same reasoning as gsheets.go:
// Intercom has no Discover/Sync in this package, it never implements
// knowledgeConnector.
//
// Region limitation, stated not hidden: Intercom's authorize endpoint is
// region-specific (app.intercom.com for US, app.eu.intercom.com for EU,
// app.au.intercom.com for AU - verified against Intercom's OAuth docs
// before writing this), and this package only wires the US host
// (connectorOAuthEndpoint). An EU/AU-hosted Intercom workspace cannot
// complete this connect flow today - not built in this batch, same
// "one representative host/action, limitation stated" call this whole
// initiative has made repeatedly (e.g. Trello's single combined secret
// field, Jira's write-only scope).
const intercomKind connectorKind = "intercom"

// intercomScopes stays nil: permissions are fixed at app-configuration
// time in Intercom's Developer Hub, not requested via an authorize-time
// scope parameter - verified against Intercom's OAuth docs before writing
// this, same nil-scopes reasoning notion.go documents.
var intercomScopes []string
