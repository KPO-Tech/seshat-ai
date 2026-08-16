package knowledgesharepoint

import (
	"golang.org/x/oauth2"

	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/microsoftoauth"
)

// Scopes requested from Microsoft - read-only Sites/Files access plus
// openid/profile/offline_access (the last is required to receive a refresh
// token, Microsoft's equivalent of Google's access_type=offline). Read-only
// by design: this is a Knowledge connector, never writes back to
// SharePoint.
var Scopes = []string{
	"openid",
	"profile",
	"offline_access",
	"https://graph.microsoft.com/Files.Read.All",
	"https://graph.microsoft.com/Sites.Read.All",
}

// IsConfigured reports whether the shared Microsoft OAuth client
// (MICROSOFT_OAUTH_CLIENT_ID) is configured.
func IsConfigured() bool {
	return microsoftoauth.IsConfigured()
}

// BaseOAuthConfig builds the SharePoint OAuth2 client config - see
// microsoftoauth.BaseConfig for the shared client-ID sourcing, PKCE
// requirement, and "organizations" tenant endpoint this delegates to.
func BaseOAuthConfig() (*oauth2.Config, error) {
	return microsoftoauth.BaseConfig(Scopes)
}
