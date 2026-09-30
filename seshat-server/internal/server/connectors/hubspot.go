package connectors

// hubspotKind is agent_action-only, same reasoning as gsheets.go: HubSpot
// has no Discover/Sync in this package, it never implements
// knowledgeConnector.
const hubspotKind connectorKind = "hubspot"

// hubspotScopes: narrowest scope that covers this batch's one
// representative action (create a CRM contact) - verified against
// HubSpot's OAuth scopes docs before writing this.
var hubspotScopes = []string{"crm.objects.contacts.write"}
