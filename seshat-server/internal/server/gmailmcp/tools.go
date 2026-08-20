package gmailmcp

import (
	"context"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	coregmail "github.com/EngineerProjects/seshat-ai/seshat-core/gmail"
)

type listGmailMessagesInput struct{}

type listGmailMessagesOutput struct {
	Messages []coregmail.Message `json:"messages"`
}

type sendGmailMailInput struct {
	To      []string `json:"to" jsonschema:"recipient email addresses"`
	Subject string   `json:"subject"`
	Body    string   `json:"body"`
}

type sendGmailMailOutput struct {
	MessageID string `json:"message_id"`
}

type replyGmailMailInput struct {
	ThreadID string `json:"thread_id" jsonschema:"the id of the thread to reply to, from list_gmail_messages"`
	To       string `json:"to" jsonschema:"the recipient email address"`
	Body     string `json:"body"`
}

type replyGmailMailOutput struct {
	MessageID string `json:"message_id"`
}

func registerGmailTools(server *mcp.Server, client *coregmail.Client) {
	mcp.AddTool(server, &mcp.Tool{
		Name:        "list_gmail_messages",
		Description: "List recent messages in the connected employee's Gmail inbox.",
	}, func(ctx context.Context, _ *mcp.CallToolRequest, _ listGmailMessagesInput) (*mcp.CallToolResult, listGmailMessagesOutput, error) {
		messages, _, err := client.Sync(ctx, "")
		if err != nil {
			return nil, listGmailMessagesOutput{}, err
		}
		return nil, listGmailMessagesOutput{Messages: messages}, nil
	})

	mcp.AddTool(server, &mcp.Tool{
		Name:        "send_gmail_mail",
		Description: "Send a new email from the connected employee's Gmail account.",
	}, func(ctx context.Context, _ *mcp.CallToolRequest, in sendGmailMailInput) (*mcp.CallToolResult, sendGmailMailOutput, error) {
		id, err := client.Send(ctx, in.To, in.Subject, in.Body)
		if err != nil {
			return nil, sendGmailMailOutput{}, err
		}
		return nil, sendGmailMailOutput{MessageID: id}, nil
	})

	mcp.AddTool(server, &mcp.Tool{
		Name:        "reply_gmail_mail",
		Description: "Reply to an existing email thread in the connected employee's Gmail inbox.",
	}, func(ctx context.Context, _ *mcp.CallToolRequest, in replyGmailMailInput) (*mcp.CallToolResult, replyGmailMailOutput, error) {
		id, err := client.Reply(ctx, in.ThreadID, in.To, in.Body)
		if err != nil {
			return nil, replyGmailMailOutput{}, err
		}
		return nil, replyGmailMailOutput{MessageID: id}, nil
	})
}
