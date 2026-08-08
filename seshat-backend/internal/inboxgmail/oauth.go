package inboxgmail

import (
	"fmt"
	"os"
	"strings"

	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
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
	return strings.TrimSpace(os.Getenv("GOOGLE_OAUTH_CLIENT_ID")) != "" &&
		strings.TrimSpace(os.Getenv("GOOGLE_OAUTH_CLIENT_SECRET")) != ""
}

// BaseOAuthConfig builds the Google OAuth2 client config from
// GOOGLE_OAUTH_CLIENT_ID/GOOGLE_OAUTH_CLIENT_SECRET, with an empty
// RedirectURL - the caller (internal/api's OAuth start/callback handlers)
// fills that in per-request from the incoming request's own host:port,
// since this app's local HTTP server's port isn't fixed (main.go falls
// back to an OS-assigned port if the preferred one is taken) and can't be
// known this early at startup. The Google Cloud OAuth client must be
// registered as a "Desktop app" type, which Google treats as a native app
// under RFC 8252 and accepts any loopback port for - not "Web application",
// which would require every possible port pre-registered.
func BaseOAuthConfig() (*oauth2.Config, error) {
	clientID := strings.TrimSpace(os.Getenv("GOOGLE_OAUTH_CLIENT_ID"))
	clientSecret := strings.TrimSpace(os.Getenv("GOOGLE_OAUTH_CLIENT_SECRET"))
	if clientID == "" || clientSecret == "" {
		return nil, fmt.Errorf("GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET are not configured")
	}
	return &oauth2.Config{
		ClientID:     clientID,
		ClientSecret: clientSecret,
		Endpoint:     google.Endpoint,
		Scopes:       Scopes,
	}, nil
}
