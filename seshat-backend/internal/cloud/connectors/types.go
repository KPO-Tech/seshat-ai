// Package cloudconnectors makes seshat-backend a client of seshat-server's
// connector OAuth app registry, for Admin Console's own Connectors tab -
// the desktop-app counterpart of seshat-console's "OAuth apps" modal
// (pages/knowledge/ConnectorsPage.tsx).
package cloudconnectors

// OAuthApp mirrors seshat-server's connectors.OAuthApp - the client secret
// is never returned, only whether one is configured. Subdomain is only
// ever set for kind "zendesk" (see connectors.zendeskKind's doc comment on
// the seshat-server side).
type OAuthApp struct {
	Kind       string `json:"kind"`
	ClientID   string `json:"client_id"`
	Configured bool   `json:"configured"`
	UpdatedAt  string `json:"updated_at"`
	Subdomain  string `json:"subdomain,omitempty"`
}
