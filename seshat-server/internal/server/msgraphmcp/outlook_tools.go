package msgraphmcp

import (
	"context"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	coremsgraph "github.com/EngineerProjects/seshat-ai/core/msgraph"
)

type listOutlookMessagesInput struct{}

type listOutlookMessagesOutput struct {
	Messages []coremsgraph.Message `json:"messages"`
}

type sendOutlookMailInput struct {
	To      []string `json:"to" jsonschema:"recipient email addresses"`
	Subject string   `json:"subject"`
	Body    string   `json:"body"`
}

type sendOutlookMailOutput struct {
	Sent bool `json:"sent"`
}

type replyOutlookMailInput struct {
	MessageID string `json:"message_id" jsonschema:"the id of the message to reply to, from list_outlook_messages"`
	Body      string `json:"body"`
}

type replyOutlookMailOutput struct {
	Sent bool `json:"sent"`
}

func registerOutlookTools(server *mcp.Server, client *coremsgraph.Client) {
	mcp.AddTool(server, &mcp.Tool{
		Name:        "list_outlook_messages",
		Description: "List recent messages in the connected employee's Outlook inbox.",
	}, func(ctx context.Context, _ *mcp.CallToolRequest, _ listOutlookMessagesInput) (*mcp.CallToolResult, listOutlookMessagesOutput, error) {
		messages, _, err := client.ListMessagesDelta(ctx, "")
		if err != nil {
			return nil, listOutlookMessagesOutput{}, err
		}
		return nil, listOutlookMessagesOutput{Messages: messages}, nil
	})

	mcp.AddTool(server, &mcp.Tool{
		Name:        "send_outlook_mail",
		Description: "Send a new email from the connected employee's Outlook account.",
	}, func(ctx context.Context, _ *mcp.CallToolRequest, in sendOutlookMailInput) (*mcp.CallToolResult, sendOutlookMailOutput, error) {
		if err := client.SendMail(ctx, in.To, in.Subject, in.Body); err != nil {
			return nil, sendOutlookMailOutput{}, err
		}
		return nil, sendOutlookMailOutput{Sent: true}, nil
	})

	mcp.AddTool(server, &mcp.Tool{
		Name:        "reply_outlook_mail",
		Description: "Reply to an existing email in the connected employee's Outlook inbox.",
	}, func(ctx context.Context, _ *mcp.CallToolRequest, in replyOutlookMailInput) (*mcp.CallToolResult, replyOutlookMailOutput, error) {
		if err := client.ReplyToMessage(ctx, in.MessageID, in.Body); err != nil {
			return nil, replyOutlookMailOutput{}, err
		}
		return nil, replyOutlookMailOutput{Sent: true}, nil
	})
}
