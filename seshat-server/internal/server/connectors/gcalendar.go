package connectors

// gcalendarKind is agent_action-only, same reasoning as gsheets.go: Google
// Calendar has no Discover/Sync in this package, it never implements
// knowledgeConnector.
const gcalendarKind connectorKind = "gcalendar"

// gcalendarScopes: calendar.events (not the broader "calendar" scope,
// which also grants calendar-list management) - narrowest scope that still
// covers creating events, verified against Google's OAuth 2.0 Scopes for
// Google APIs reference before writing this.
var gcalendarScopes = []string{"https://www.googleapis.com/auth/calendar.events"}
