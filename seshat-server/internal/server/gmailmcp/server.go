// Package gmailmcp wraps core/gmail as a self-hosted MCP server via
// internal/server/mcpbridge - see that package's doc comment for why a
// self-hosted bridge exists at all and for the full auth/trust-model
// reasoning. This package only owns the Gmail-specific pieces: building a
// *coregmail.Client from a bridged Bearer token, and the tool set
// (tools.go).
package gmailmcp

import (
	"context"
	"net/http"

	"golang.org/x/oauth2"
	"google.golang.org/api/option"

	coregmail "github.com/EngineerProjects/seshat-ai/seshat-core/gmail"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/mcpbridge"
)

// extraClientOptions is empty (no effect) in production - tests in this
// package override it with option.WithEndpoint to point coregmail.New at a
// fake Gmail server.
var extraClientOptions []option.ClientOption

// NewHandler serves list_gmail_messages/send_gmail_mail/reply_gmail_mail.
func NewHandler() http.Handler {
	return mcpbridge.NewHandler("seshat-gmail", buildGmailClient, registerGmailTools)
}

func buildGmailClient(ctx context.Context, token string) (*coregmail.Client, error) {
	ts := oauth2.StaticTokenSource(&oauth2.Token{AccessToken: token})
	return coregmail.New(ctx, ts, extraClientOptions...)
}
