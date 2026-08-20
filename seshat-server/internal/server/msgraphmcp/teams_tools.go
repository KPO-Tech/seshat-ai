package msgraphmcp

import (
	"context"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	coremsgraph "github.com/EngineerProjects/seshat-ai/core/msgraph"
)

type listTeamsChatsInput struct{}

type listTeamsChatsOutput struct {
	Chats []coremsgraph.Chat `json:"chats"`
}

type listTeamsMessagesInput struct {
	ChatID string `json:"chat_id" jsonschema:"the id of the chat to list messages from, from list_teams_chats"`
}

type listTeamsMessagesOutput struct {
	Messages []coremsgraph.ChatMessage `json:"messages"`
}

type sendTeamsMessageInput struct {
	ChatID string `json:"chat_id" jsonschema:"the id of the chat to post into, from list_teams_chats"`
	Body   string `json:"body"`
}

type sendTeamsMessageOutput struct {
	Sent bool `json:"sent"`
}

func registerTeamsTools(server *mcp.Server, client *coremsgraph.Client) {
	mcp.AddTool(server, &mcp.Tool{
		Name:        "list_teams_chats",
		Description: "List the Teams chats the connected employee is a member of.",
	}, func(ctx context.Context, _ *mcp.CallToolRequest, _ listTeamsChatsInput) (*mcp.CallToolResult, listTeamsChatsOutput, error) {
		chats, err := client.ListChats(ctx)
		if err != nil {
			return nil, listTeamsChatsOutput{}, err
		}
		return nil, listTeamsChatsOutput{Chats: chats}, nil
	})

	mcp.AddTool(server, &mcp.Tool{
		Name:        "list_teams_messages",
		Description: "List recent messages in a Teams chat.",
	}, func(ctx context.Context, _ *mcp.CallToolRequest, in listTeamsMessagesInput) (*mcp.CallToolResult, listTeamsMessagesOutput, error) {
		messages, _, err := client.ListChatMessages(ctx, in.ChatID, "")
		if err != nil {
			return nil, listTeamsMessagesOutput{}, err
		}
		return nil, listTeamsMessagesOutput{Messages: messages}, nil
	})

	mcp.AddTool(server, &mcp.Tool{
		Name:        "send_teams_message",
		Description: "Send a message into an existing Teams chat.",
	}, func(ctx context.Context, _ *mcp.CallToolRequest, in sendTeamsMessageInput) (*mcp.CallToolResult, sendTeamsMessageOutput, error) {
		if err := client.SendChatMessage(ctx, in.ChatID, in.Body); err != nil {
			return nil, sendTeamsMessageOutput{}, err
		}
		return nil, sendTeamsMessageOutput{Sent: true}, nil
	})
}
