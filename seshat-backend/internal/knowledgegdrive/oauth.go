package knowledgegdrive

import (
	"golang.org/x/oauth2"

	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/googleoauth"
)

// Scopes requested from Google - read-only Drive access plus the account's
// email (used as ExternalAccountID, mirroring inboxgmail). Read-only by
// design: this is a Knowledge connector (see helps/roadmap.md Phase 1),
// never writes back to Drive.
var Scopes = []string{
	"https://www.googleapis.com/auth/drive.readonly",
	"https://www.googleapis.com/auth/userinfo.email",
}

// IsConfigured reports whether the shared Google OAuth client
// (GOOGLE_OAUTH_CLIENT_ID/SECRET) is configured - the same client Gmail
// uses, see googleoauth's package doc.
func IsConfigured() bool {
	return googleoauth.IsConfigured()
}

// BaseOAuthConfig builds the Google Drive OAuth2 client config - see
// googleoauth.BaseConfig for the shared client-ID/secret sourcing and
// "Desktop app" redirect setup this delegates to.
func BaseOAuthConfig() (*oauth2.Config, error) {
	return googleoauth.BaseConfig(Scopes)
}
