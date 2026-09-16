package gmailmcp

import (
	"context"
	"encoding/base64"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	coregmail "github.com/KPO-Tech/seshat/pkg/gmail"
)

type listGmailMessagesInput struct{}

type listGmailMessagesOutput struct {
	Messages []coregmail.Message `json:"messages"`
}

type searchGmailMessagesInput struct {
	Query      string `json:"query" jsonschema:"Gmail search syntax, e.g. 'from:boss@company.com is:unread has:attachment after:2024/01/01'"`
	MaxResults int64  `json:"max_results,omitempty" jsonschema:"maximum number of results (default 25)"`
}

type searchGmailMessagesOutput struct {
	Messages []coregmail.Message `json:"messages"`
}

type getGmailMessageInput struct {
	MessageID string `json:"message_id"`
}

type getGmailMessageOutput struct {
	Message coregmail.Message `json:"message"`
}

type getGmailThreadInput struct {
	ThreadID string `json:"thread_id" jsonschema:"the id of the thread, from list_gmail_messages/search_gmail_messages"`
}

type getGmailThreadOutput struct {
	Messages []coregmail.Message `json:"messages"`
}

type getGmailProfileInput struct{}

type getGmailProfileOutput struct {
	Profile coregmail.Profile `json:"profile"`
}

type sendGmailMailInput struct {
	To       []string `json:"to" jsonschema:"recipient email addresses"`
	Cc       []string `json:"cc,omitempty"`
	Bcc      []string `json:"bcc,omitempty"`
	Subject  string   `json:"subject"`
	Body     string   `json:"body"`
	ThreadID string   `json:"thread_id,omitempty" jsonschema:"send within an existing thread instead of starting a new one"`
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

type createGmailDraftInput struct {
	To       []string `json:"to" jsonschema:"recipient email addresses"`
	Cc       []string `json:"cc,omitempty"`
	Bcc      []string `json:"bcc,omitempty"`
	Subject  string   `json:"subject"`
	Body     string   `json:"body"`
	ThreadID string   `json:"thread_id,omitempty"`
}

type createGmailDraftOutput struct {
	Draft coregmail.Draft `json:"draft"`
}

type listGmailDraftsInput struct {
	MaxResults int64 `json:"max_results,omitempty" jsonschema:"maximum number of drafts (default 25)"`
}

type listGmailDraftsOutput struct {
	Drafts []coregmail.Draft `json:"drafts"`
}

type sendGmailDraftInput struct {
	DraftID string `json:"draft_id" jsonschema:"the id of the draft to send, from list_gmail_drafts/create_gmail_draft"`
}

type sendGmailDraftOutput struct {
	MessageID string `json:"message_id"`
}

type deleteGmailDraftInput struct {
	DraftID string `json:"draft_id"`
}

type deleteGmailDraftOutput struct {
	Deleted bool `json:"deleted"`
}

type trashGmailMessageInput struct {
	MessageID string `json:"message_id"`
}

type trashGmailMessageOutput struct {
	Trashed bool `json:"trashed"`
}

type untrashGmailMessageInput struct {
	MessageID string `json:"message_id"`
}

type untrashGmailMessageOutput struct {
	Untrashed bool `json:"untrashed"`
}

type markGmailMessageReadInput struct {
	MessageID string `json:"message_id"`
}

type markGmailMessageReadOutput struct {
	Marked bool `json:"marked"`
}

type markGmailMessageUnreadInput struct {
	MessageID string `json:"message_id"`
}

type markGmailMessageUnreadOutput struct {
	Marked bool `json:"marked"`
}

type listGmailLabelsInput struct{}

type listGmailLabelsOutput struct {
	Labels []coregmail.Label `json:"labels"`
}

type createGmailLabelInput struct {
	Name string `json:"name"`
}

type createGmailLabelOutput struct {
	Label coregmail.Label `json:"label"`
}

type deleteGmailLabelInput struct {
	LabelID string `json:"label_id"`
}

type deleteGmailLabelOutput struct {
	Deleted bool `json:"deleted"`
}

type modifyGmailMessageLabelsInput struct {
	MessageID      string   `json:"message_id"`
	AddLabelIDs    []string `json:"add_label_ids,omitempty" jsonschema:"label ids to add, from list_gmail_labels"`
	RemoveLabelIDs []string `json:"remove_label_ids,omitempty" jsonschema:"label ids to remove, from list_gmail_labels"`
}

type modifyGmailMessageLabelsOutput struct {
	Modified bool `json:"modified"`
}

type listGmailAttachmentsInput struct {
	MessageID string `json:"message_id"`
}

type listGmailAttachmentsOutput struct {
	Attachments []coregmail.Attachment `json:"attachments"`
}

type getGmailAttachmentInput struct {
	MessageID    string `json:"message_id"`
	AttachmentID string `json:"attachment_id" jsonschema:"from list_gmail_attachments/get_gmail_message, the GmailAttachmentID"`
}

type getGmailAttachmentOutput struct {
	// DataBase64 is standard (non-URL-safe) base64 - unlike Gmail's own wire
	// format (base64url), so any MCP client can decode it without knowing
	// that Gmail-specific convention.
	DataBase64 string `json:"data_base64"`
	Size       int    `json:"size"`
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
		Name:        "search_gmail_messages",
		Description: "Search the connected employee's Gmail using Gmail's own search syntax (from:/subject:/is:unread/has:attachment/after:/label:, etc.).",
	}, func(ctx context.Context, _ *mcp.CallToolRequest, in searchGmailMessagesInput) (*mcp.CallToolResult, searchGmailMessagesOutput, error) {
		messages, err := client.Search(ctx, in.Query, in.MaxResults)
		if err != nil {
			return nil, searchGmailMessagesOutput{}, err
		}
		return nil, searchGmailMessagesOutput{Messages: messages}, nil
	})

	mcp.AddTool(server, &mcp.Tool{
		Name:        "get_gmail_message",
		Description: "Get the full content of a specific Gmail message by its ID.",
	}, func(ctx context.Context, _ *mcp.CallToolRequest, in getGmailMessageInput) (*mcp.CallToolResult, getGmailMessageOutput, error) {
		msg, err := client.GetMessage(ctx, in.MessageID)
		if err != nil {
			return nil, getGmailMessageOutput{}, err
		}
		return nil, getGmailMessageOutput{Message: msg}, nil
	})

	mcp.AddTool(server, &mcp.Tool{
		Name:        "get_gmail_thread",
		Description: "Get every message in a Gmail thread, oldest first.",
	}, func(ctx context.Context, _ *mcp.CallToolRequest, in getGmailThreadInput) (*mcp.CallToolResult, getGmailThreadOutput, error) {
		messages, err := client.GetThread(ctx, in.ThreadID)
		if err != nil {
			return nil, getGmailThreadOutput{}, err
		}
		return nil, getGmailThreadOutput{Messages: messages}, nil
	})

	mcp.AddTool(server, &mcp.Tool{
		Name:        "get_gmail_profile",
		Description: "Get the connected employee's Gmail profile (email address, total messages/threads).",
	}, func(ctx context.Context, _ *mcp.CallToolRequest, _ getGmailProfileInput) (*mcp.CallToolResult, getGmailProfileOutput, error) {
		profile, err := client.GetProfile(ctx)
		if err != nil {
			return nil, getGmailProfileOutput{}, err
		}
		return nil, getGmailProfileOutput{Profile: profile}, nil
	})

	mcp.AddTool(server, &mcp.Tool{
		Name:        "send_gmail_mail",
		Description: "Send a new email from the connected employee's Gmail account, optionally with CC/BCC or within an existing thread.",
	}, func(ctx context.Context, _ *mcp.CallToolRequest, in sendGmailMailInput) (*mcp.CallToolResult, sendGmailMailOutput, error) {
		id, err := client.Compose(ctx, coregmail.ComposeOptions{
			To: in.To, Cc: in.Cc, Bcc: in.Bcc, Subject: in.Subject, Body: in.Body, ThreadID: in.ThreadID,
		})
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

	mcp.AddTool(server, &mcp.Tool{
		Name:        "create_gmail_draft",
		Description: "Create a draft email in the connected employee's Gmail account without sending it.",
	}, func(ctx context.Context, _ *mcp.CallToolRequest, in createGmailDraftInput) (*mcp.CallToolResult, createGmailDraftOutput, error) {
		draft, err := client.CreateDraft(ctx, coregmail.ComposeOptions{
			To: in.To, Cc: in.Cc, Bcc: in.Bcc, Subject: in.Subject, Body: in.Body, ThreadID: in.ThreadID,
		})
		if err != nil {
			return nil, createGmailDraftOutput{}, err
		}
		return nil, createGmailDraftOutput{Draft: draft}, nil
	})

	mcp.AddTool(server, &mcp.Tool{
		Name:        "list_gmail_drafts",
		Description: "List saved (unsent) drafts in the connected employee's Gmail account.",
	}, func(ctx context.Context, _ *mcp.CallToolRequest, in listGmailDraftsInput) (*mcp.CallToolResult, listGmailDraftsOutput, error) {
		drafts, err := client.ListDrafts(ctx, in.MaxResults)
		if err != nil {
			return nil, listGmailDraftsOutput{}, err
		}
		return nil, listGmailDraftsOutput{Drafts: drafts}, nil
	})

	mcp.AddTool(server, &mcp.Tool{
		Name:        "send_gmail_draft",
		Description: "Send an existing draft from the connected employee's Gmail account.",
	}, func(ctx context.Context, _ *mcp.CallToolRequest, in sendGmailDraftInput) (*mcp.CallToolResult, sendGmailDraftOutput, error) {
		id, err := client.SendDraft(ctx, in.DraftID)
		if err != nil {
			return nil, sendGmailDraftOutput{}, err
		}
		return nil, sendGmailDraftOutput{MessageID: id}, nil
	})

	mcp.AddTool(server, &mcp.Tool{
		Name:        "delete_gmail_draft",
		Description: "Delete a draft from the connected employee's Gmail account.",
	}, func(ctx context.Context, _ *mcp.CallToolRequest, in deleteGmailDraftInput) (*mcp.CallToolResult, deleteGmailDraftOutput, error) {
		if err := client.DeleteDraft(ctx, in.DraftID); err != nil {
			return nil, deleteGmailDraftOutput{}, err
		}
		return nil, deleteGmailDraftOutput{Deleted: true}, nil
	})

	mcp.AddTool(server, &mcp.Tool{
		Name:        "trash_gmail_message",
		Description: "Move a message to Trash in the connected employee's Gmail account (reversible via untrash_gmail_message).",
	}, func(ctx context.Context, _ *mcp.CallToolRequest, in trashGmailMessageInput) (*mcp.CallToolResult, trashGmailMessageOutput, error) {
		if err := client.TrashMessage(ctx, in.MessageID); err != nil {
			return nil, trashGmailMessageOutput{}, err
		}
		return nil, trashGmailMessageOutput{Trashed: true}, nil
	})

	mcp.AddTool(server, &mcp.Tool{
		Name:        "untrash_gmail_message",
		Description: "Remove a message from Trash in the connected employee's Gmail account.",
	}, func(ctx context.Context, _ *mcp.CallToolRequest, in untrashGmailMessageInput) (*mcp.CallToolResult, untrashGmailMessageOutput, error) {
		if err := client.UntrashMessage(ctx, in.MessageID); err != nil {
			return nil, untrashGmailMessageOutput{}, err
		}
		return nil, untrashGmailMessageOutput{Untrashed: true}, nil
	})

	mcp.AddTool(server, &mcp.Tool{
		Name:        "mark_gmail_message_read",
		Description: "Mark a message as read in the connected employee's Gmail account.",
	}, func(ctx context.Context, _ *mcp.CallToolRequest, in markGmailMessageReadInput) (*mcp.CallToolResult, markGmailMessageReadOutput, error) {
		if err := client.MarkRead(ctx, in.MessageID); err != nil {
			return nil, markGmailMessageReadOutput{}, err
		}
		return nil, markGmailMessageReadOutput{Marked: true}, nil
	})

	mcp.AddTool(server, &mcp.Tool{
		Name:        "mark_gmail_message_unread",
		Description: "Mark a message as unread in the connected employee's Gmail account.",
	}, func(ctx context.Context, _ *mcp.CallToolRequest, in markGmailMessageUnreadInput) (*mcp.CallToolResult, markGmailMessageUnreadOutput, error) {
		if err := client.MarkUnread(ctx, in.MessageID); err != nil {
			return nil, markGmailMessageUnreadOutput{}, err
		}
		return nil, markGmailMessageUnreadOutput{Marked: true}, nil
	})

	mcp.AddTool(server, &mcp.Tool{
		Name:        "list_gmail_labels",
		Description: "List all labels (system and user-created) in the connected employee's Gmail account.",
	}, func(ctx context.Context, _ *mcp.CallToolRequest, _ listGmailLabelsInput) (*mcp.CallToolResult, listGmailLabelsOutput, error) {
		labels, err := client.ListLabels(ctx)
		if err != nil {
			return nil, listGmailLabelsOutput{}, err
		}
		return nil, listGmailLabelsOutput{Labels: labels}, nil
	})

	mcp.AddTool(server, &mcp.Tool{
		Name:        "create_gmail_label",
		Description: "Create a new user label in the connected employee's Gmail account.",
	}, func(ctx context.Context, _ *mcp.CallToolRequest, in createGmailLabelInput) (*mcp.CallToolResult, createGmailLabelOutput, error) {
		label, err := client.CreateLabel(ctx, in.Name)
		if err != nil {
			return nil, createGmailLabelOutput{}, err
		}
		return nil, createGmailLabelOutput{Label: label}, nil
	})

	mcp.AddTool(server, &mcp.Tool{
		Name:        "delete_gmail_label",
		Description: "Delete a user label from the connected employee's Gmail account.",
	}, func(ctx context.Context, _ *mcp.CallToolRequest, in deleteGmailLabelInput) (*mcp.CallToolResult, deleteGmailLabelOutput, error) {
		if err := client.DeleteLabel(ctx, in.LabelID); err != nil {
			return nil, deleteGmailLabelOutput{}, err
		}
		return nil, deleteGmailLabelOutput{Deleted: true}, nil
	})

	mcp.AddTool(server, &mcp.Tool{
		Name:        "modify_gmail_message_labels",
		Description: "Add and/or remove labels on a message in the connected employee's Gmail account.",
	}, func(ctx context.Context, _ *mcp.CallToolRequest, in modifyGmailMessageLabelsInput) (*mcp.CallToolResult, modifyGmailMessageLabelsOutput, error) {
		if err := client.ModifyLabels(ctx, in.MessageID, in.AddLabelIDs, in.RemoveLabelIDs); err != nil {
			return nil, modifyGmailMessageLabelsOutput{}, err
		}
		return nil, modifyGmailMessageLabelsOutput{Modified: true}, nil
	})

	mcp.AddTool(server, &mcp.Tool{
		Name:        "list_gmail_attachments",
		Description: "List attachment metadata (filename, content type, size) for a Gmail message.",
	}, func(ctx context.Context, _ *mcp.CallToolRequest, in listGmailAttachmentsInput) (*mcp.CallToolResult, listGmailAttachmentsOutput, error) {
		msg, err := client.GetMessage(ctx, in.MessageID)
		if err != nil {
			return nil, listGmailAttachmentsOutput{}, err
		}
		return nil, listGmailAttachmentsOutput{Attachments: msg.Attachments}, nil
	})

	mcp.AddTool(server, &mcp.Tool{
		Name:        "get_gmail_attachment",
		Description: "Download one attachment's bytes (base64-encoded) from a Gmail message.",
	}, func(ctx context.Context, _ *mcp.CallToolRequest, in getGmailAttachmentInput) (*mcp.CallToolResult, getGmailAttachmentOutput, error) {
		data, err := client.FetchAttachment(ctx, in.MessageID, in.AttachmentID)
		if err != nil {
			return nil, getGmailAttachmentOutput{}, err
		}
		return nil, getGmailAttachmentOutput{DataBase64: base64.StdEncoding.EncodeToString(data), Size: len(data)}, nil
	})
}
