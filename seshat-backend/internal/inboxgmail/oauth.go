package inboxgmail

import (
	"golang.org/x/oauth2"

	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/googleoauth"
)

// Scopes requested from Google - read + send only, matching what this
// connector actually does today. Gmail's read/send scopes are "restricted"
// (Google's sensitive-scope review applies), which is also why this can't
// reuse the shared public OAuth client OpenAI's device flow uses (see
// internal/settings/oauth_factory.go's comment on that one) - each
// deployment registers its own Google Cloud OAuth client and consent
// screen.
var Scopes = []string{
	"https://www.googleapis.com/auth/gmail.readonly",
	"https://www.googleapis.com/auth/gmail.send",
	"https://www.googleapis.com/auth/userinfo.email",
}

// IsConfigured reports whether GOOGLE_OAUTH_CLIENT_ID/SECRET are set -
// bootstrap.go uses this to decide whether to register the Gmail connector
// at all, the same way other optional integrations (Docling, web search
// providers) are skipped rather than half-initialized when unconfigured.
func IsConfigured() bool {
	return googleoauth.IsConfigured()
}

// BaseOAuthConfig builds the Gmail OAuth2 client config - see
// googleoauth.BaseConfig for the shared client-ID/secret sourcing and
// "Desktop app" redirect setup this delegates to.
func BaseOAuthConfig() (*oauth2.Config, error) {
	return googleoauth.BaseConfig(Scopes)
}
