// Package msgraphmcp wraps core/msgraph as two self-hosted MCP servers
// (Outlook, Teams) via internal/server/mcpbridge - see that package's doc
// comment for why a self-hosted bridge exists at all (the seshat SDK's
// sdk.ClientConfig has no generic "native Go tool" field) and for the full
// auth/trust-model reasoning. This package only owns the Microsoft-Graph-
// specific pieces: building a *coremsgraph.Client from a bridged Bearer
// token, and each server's own tool set (outlook_tools.go/teams_tools.go).
package msgraphmcp

import (
	"context"
	"net/http"

	"golang.org/x/oauth2"

	coremsgraph "github.com/EngineerProjects/seshat-ai/seshat-core/msgraph"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/mcpbridge"
)

// NewOutlookHandler serves list_outlook_messages/send_outlook_mail/
// reply_outlook_mail.
func NewOutlookHandler() http.Handler {
	return mcpbridge.NewHandler("seshat-outlook", buildGraphClient, registerOutlookTools)
}

// NewTeamsHandler serves list_teams_chats/list_teams_messages/
// send_teams_message.
func NewTeamsHandler() http.Handler {
	return mcpbridge.NewHandler("seshat-teams", buildGraphClient, registerTeamsTools)
}

// buildGraphClient never actually errors (core/msgraph.New only wraps an
// *http.Client) - the error return exists to satisfy mcpbridge.NewHandler's
// generic buildClient signature, which other providers (e.g. core/gmail's
// real SDK) do need.
func buildGraphClient(ctx context.Context, token string) (*coremsgraph.Client, error) {
	httpClient := oauth2.NewClient(ctx, oauth2.StaticTokenSource(&oauth2.Token{AccessToken: token}))
	return coremsgraph.New(httpClient), nil
}
