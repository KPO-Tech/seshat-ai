package msgraphmcp

import (
	"context"
	"encoding/base64"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	coremsgraph "github.com/KPO-Tech/seshat/pkg/msgraph"
)

type listOutlookMessagesInput struct{}

type listOutlookMessagesOutput struct {
	Messages []coremsgraph.Message `json:"messages"`
}

type searchOutlookMessagesInput struct {
	Query      string `json:"query" jsonschema:"free-text search over subject/body/sender - Graph has no from:/is:unread query syntax, unlike Gmail"`
	MaxResults int    `json:"max_results,omitempty" jsonschema:"maximum number of results (default 25)"`
}

type searchOutlookMessagesOutput struct {
	Messages []coremsgraph.Message `json:"messages"`
}

type getOutlookMessageInput struct {
	MessageID string `json:"message_id"`
}

type getOutlookMessageOutput struct {
	Message coremsgraph.Message `json:"message"`
}

type getOutlookThreadInput struct {
	ConversationID string `json:"conversation_id" jsonschema:"the conversationId of the thread, from list_outlook_messages/search_outlook_messages"`
}

type getOutlookThreadOutput struct {
	Messages []coremsgraph.Message `json:"messages"`
}

type getOutlookProfileInput struct{}

type getOutlookProfileOutput struct {
	Profile coremsgraph.Profile `json:"profile"`
}

type sendOutlookMailInput struct {
	To      []string `json:"to" jsonschema:"recipient email addresses"`
	Cc      []string `json:"cc,omitempty"`
	Bcc     []string `json:"bcc,omitempty"`
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

type createOutlookDraftInput struct {
	To      []string `json:"to" jsonschema:"recipient email addresses"`
	Cc      []string `json:"cc,omitempty"`
	Bcc     []string `json:"bcc,omitempty"`
	Subject string   `json:"subject"`
	Body    string   `json:"body"`
}

type createOutlookDraftOutput struct {
	Draft coremsgraph.Message `json:"draft"`
}

type listOutlookDraftsInput struct {
	MaxResults int `json:"max_results,omitempty" jsonschema:"maximum number of drafts (default 25)"`
}

type listOutlookDraftsOutput struct {
	Drafts []coremsgraph.Message `json:"drafts"`
}

type sendOutlookDraftInput struct {
	DraftID string `json:"draft_id" jsonschema:"the id of the draft to send, from list_outlook_drafts/create_outlook_draft"`
}

type sendOutlookDraftOutput struct {
	Sent bool `json:"sent"`
}

type deleteOutlookDraftInput struct {
	DraftID string `json:"draft_id"`
}

type deleteOutlookDraftOutput struct {
	Deleted bool `json:"deleted"`
}

type trashOutlookMessageInput struct {
	MessageID string `json:"message_id"`
}

type trashOutlookMessageOutput struct {
	// TrashedMessageID is the moved message's new ID - Graph mints a new one
	// on move, unlike Gmail where trashing keeps the same message ID.
	TrashedMessageID string `json:"trashed_message_id"`
}

type untrashOutlookMessageInput struct {
	MessageID string `json:"message_id"`
}

type untrashOutlookMessageOutput struct {
	UntrashedMessageID string `json:"untrashed_message_id"`
}

type markOutlookMessageReadInput struct {
	MessageID string `json:"message_id"`
}

type markOutlookMessageReadOutput struct {
	Marked bool `json:"marked"`
}

type markOutlookMessageUnreadInput struct {
	MessageID string `json:"message_id"`
}

type markOutlookMessageUnreadOutput struct {
	Marked bool `json:"marked"`
}

type listOutlookCategoriesInput struct{}

type listOutlookCategoriesOutput struct {
	Categories []coremsgraph.Category `json:"categories"`
}

type createOutlookCategoryInput struct {
	Name string `json:"name"`
}

type createOutlookCategoryOutput struct {
	Category coremsgraph.Category `json:"category"`
}

type deleteOutlookCategoryInput struct {
	CategoryID string `json:"category_id"`
}

type deleteOutlookCategoryOutput struct {
	Deleted bool `json:"deleted"`
}

type modifyOutlookMessageCategoriesInput struct {
	MessageID        string   `json:"message_id"`
	AddCategories    []string `json:"add_categories,omitempty" jsonschema:"category names to add, from list_outlook_categories"`
	RemoveCategories []string `json:"remove_categories,omitempty" jsonschema:"category names to remove, from list_outlook_categories"`
}

type modifyOutlookMessageCategoriesOutput struct {
	Modified bool `json:"modified"`
}

type listOutlookAttachmentsInput struct {
	MessageID string `json:"message_id"`
}

type listOutlookAttachmentsOutput struct {
	Attachments []coremsgraph.Attachment `json:"attachments"`
}

type getOutlookAttachmentInput struct {
	MessageID    string `json:"message_id"`
	AttachmentID string `json:"attachment_id" jsonschema:"from list_outlook_attachments"`
}

type getOutlookAttachmentOutput struct {
	DataBase64 string `json:"data_base64"`
	Size       int    `json:"size"`
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
		Name:        "search_outlook_messages",
		Description: "Search the connected employee's Outlook inbox with a free-text query (subject/body/sender).",
	}, func(ctx context.Context, _ *mcp.CallToolRequest, in searchOutlookMessagesInput) (*mcp.CallToolResult, searchOutlookMessagesOutput, error) {
		messages, err := client.SearchMessages(ctx, in.Query, in.MaxResults)
		if err != nil {
			return nil, searchOutlookMessagesOutput{}, err
		}
		return nil, searchOutlookMessagesOutput{Messages: messages}, nil
	})

	mcp.AddTool(server, &mcp.Tool{
		Name:        "get_outlook_message",
		Description: "Get the full content of a specific Outlook message by its ID.",
	}, func(ctx context.Context, _ *mcp.CallToolRequest, in getOutlookMessageInput) (*mcp.CallToolResult, getOutlookMessageOutput, error) {
		msg, err := client.GetMessage(ctx, in.MessageID)
		if err != nil {
			return nil, getOutlookMessageOutput{}, err
		}
		return nil, getOutlookMessageOutput{Message: *msg}, nil
	})

	mcp.AddTool(server, &mcp.Tool{
		Name:        "get_outlook_thread",
		Description: "Get every message in an Outlook conversation (thread), oldest first.",
	}, func(ctx context.Context, _ *mcp.CallToolRequest, in getOutlookThreadInput) (*mcp.CallToolResult, getOutlookThreadOutput, error) {
		messages, err := client.ListMessagesInConversation(ctx, in.ConversationID)
		if err != nil {
			return nil, getOutlookThreadOutput{}, err
		}
		return nil, getOutlookThreadOutput{Messages: messages}, nil
	})

	mcp.AddTool(server, &mcp.Tool{
		Name:        "get_outlook_profile",
		Description: "Get the connected employee's Outlook/Microsoft 365 profile (display name, email).",
	}, func(ctx context.Context, _ *mcp.CallToolRequest, _ getOutlookProfileInput) (*mcp.CallToolResult, getOutlookProfileOutput, error) {
		profile, err := client.GetProfile(ctx)
		if err != nil {
			return nil, getOutlookProfileOutput{}, err
		}
		return nil, getOutlookProfileOutput{Profile: profile}, nil
	})

	mcp.AddTool(server, &mcp.Tool{
		Name:        "send_outlook_mail",
		Description: "Send a new email from the connected employee's Outlook account, optionally with CC/BCC.",
	}, func(ctx context.Context, _ *mcp.CallToolRequest, in sendOutlookMailInput) (*mcp.CallToolResult, sendOutlookMailOutput, error) {
		if err := client.Compose(ctx, coremsgraph.ComposeOptions{To: in.To, Cc: in.Cc, Bcc: in.Bcc, Subject: in.Subject, Body: in.Body}); err != nil {
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

	mcp.AddTool(server, &mcp.Tool{
		Name:        "create_outlook_draft",
		Description: "Create a draft email in the connected employee's Outlook account without sending it.",
	}, func(ctx context.Context, _ *mcp.CallToolRequest, in createOutlookDraftInput) (*mcp.CallToolResult, createOutlookDraftOutput, error) {
		draft, err := client.CreateDraft(ctx, coremsgraph.ComposeOptions{To: in.To, Cc: in.Cc, Bcc: in.Bcc, Subject: in.Subject, Body: in.Body})
		if err != nil {
			return nil, createOutlookDraftOutput{}, err
		}
		return nil, createOutlookDraftOutput{Draft: *draft}, nil
	})

	mcp.AddTool(server, &mcp.Tool{
		Name:        "list_outlook_drafts",
		Description: "List saved (unsent) drafts in the connected employee's Outlook account.",
	}, func(ctx context.Context, _ *mcp.CallToolRequest, in listOutlookDraftsInput) (*mcp.CallToolResult, listOutlookDraftsOutput, error) {
		drafts, err := client.ListDrafts(ctx, in.MaxResults)
		if err != nil {
			return nil, listOutlookDraftsOutput{}, err
		}
		return nil, listOutlookDraftsOutput{Drafts: drafts}, nil
	})

	mcp.AddTool(server, &mcp.Tool{
		Name:        "send_outlook_draft",
		Description: "Send an existing draft from the connected employee's Outlook account.",
	}, func(ctx context.Context, _ *mcp.CallToolRequest, in sendOutlookDraftInput) (*mcp.CallToolResult, sendOutlookDraftOutput, error) {
		if err := client.SendDraft(ctx, in.DraftID); err != nil {
			return nil, sendOutlookDraftOutput{}, err
		}
		return nil, sendOutlookDraftOutput{Sent: true}, nil
	})

	mcp.AddTool(server, &mcp.Tool{
		Name:        "delete_outlook_draft",
		Description: "Delete a draft from the connected employee's Outlook account.",
	}, func(ctx context.Context, _ *mcp.CallToolRequest, in deleteOutlookDraftInput) (*mcp.CallToolResult, deleteOutlookDraftOutput, error) {
		if err := client.DeleteDraft(ctx, in.DraftID); err != nil {
			return nil, deleteOutlookDraftOutput{}, err
		}
		return nil, deleteOutlookDraftOutput{Deleted: true}, nil
	})

	mcp.AddTool(server, &mcp.Tool{
		Name:        "trash_outlook_message",
		Description: "Move a message to Deleted Items in the connected employee's Outlook account (reversible via untrash_outlook_message using the returned trashed_message_id).",
	}, func(ctx context.Context, _ *mcp.CallToolRequest, in trashOutlookMessageInput) (*mcp.CallToolResult, trashOutlookMessageOutput, error) {
		newID, err := client.TrashMessage(ctx, in.MessageID)
		if err != nil {
			return nil, trashOutlookMessageOutput{}, err
		}
		return nil, trashOutlookMessageOutput{TrashedMessageID: newID}, nil
	})

	mcp.AddTool(server, &mcp.Tool{
		Name:        "untrash_outlook_message",
		Description: "Move a message from Deleted Items back to the Inbox in the connected employee's Outlook account.",
	}, func(ctx context.Context, _ *mcp.CallToolRequest, in untrashOutlookMessageInput) (*mcp.CallToolResult, untrashOutlookMessageOutput, error) {
		newID, err := client.UntrashMessage(ctx, in.MessageID)
		if err != nil {
			return nil, untrashOutlookMessageOutput{}, err
		}
		return nil, untrashOutlookMessageOutput{UntrashedMessageID: newID}, nil
	})

	mcp.AddTool(server, &mcp.Tool{
		Name:        "mark_outlook_message_read",
		Description: "Mark a message as read in the connected employee's Outlook account.",
	}, func(ctx context.Context, _ *mcp.CallToolRequest, in markOutlookMessageReadInput) (*mcp.CallToolResult, markOutlookMessageReadOutput, error) {
		if err := client.SetMessageRead(ctx, in.MessageID, true); err != nil {
			return nil, markOutlookMessageReadOutput{}, err
		}
		return nil, markOutlookMessageReadOutput{Marked: true}, nil
	})

	mcp.AddTool(server, &mcp.Tool{
		Name:        "mark_outlook_message_unread",
		Description: "Mark a message as unread in the connected employee's Outlook account.",
	}, func(ctx context.Context, _ *mcp.CallToolRequest, in markOutlookMessageUnreadInput) (*mcp.CallToolResult, markOutlookMessageUnreadOutput, error) {
		if err := client.SetMessageRead(ctx, in.MessageID, false); err != nil {
			return nil, markOutlookMessageUnreadOutput{}, err
		}
		return nil, markOutlookMessageUnreadOutput{Marked: true}, nil
	})

	mcp.AddTool(server, &mcp.Tool{
		Name:        "list_outlook_categories",
		Description: "List all master categories in the connected employee's Outlook account (Outlook's closest equivalent to Gmail labels).",
	}, func(ctx context.Context, _ *mcp.CallToolRequest, _ listOutlookCategoriesInput) (*mcp.CallToolResult, listOutlookCategoriesOutput, error) {
		categories, err := client.ListCategories(ctx)
		if err != nil {
			return nil, listOutlookCategoriesOutput{}, err
		}
		return nil, listOutlookCategoriesOutput{Categories: categories}, nil
	})

	mcp.AddTool(server, &mcp.Tool{
		Name:        "create_outlook_category",
		Description: "Create a new master category in the connected employee's Outlook account.",
	}, func(ctx context.Context, _ *mcp.CallToolRequest, in createOutlookCategoryInput) (*mcp.CallToolResult, createOutlookCategoryOutput, error) {
		category, err := client.CreateCategory(ctx, in.Name)
		if err != nil {
			return nil, createOutlookCategoryOutput{}, err
		}
		return nil, createOutlookCategoryOutput{Category: category}, nil
	})

	mcp.AddTool(server, &mcp.Tool{
		Name:        "delete_outlook_category",
		Description: "Delete a master category from the connected employee's Outlook account.",
	}, func(ctx context.Context, _ *mcp.CallToolRequest, in deleteOutlookCategoryInput) (*mcp.CallToolResult, deleteOutlookCategoryOutput, error) {
		if err := client.DeleteCategory(ctx, in.CategoryID); err != nil {
			return nil, deleteOutlookCategoryOutput{}, err
		}
		return nil, deleteOutlookCategoryOutput{Deleted: true}, nil
	})

	mcp.AddTool(server, &mcp.Tool{
		Name:        "modify_outlook_message_categories",
		Description: "Add and/or remove categories on a message in the connected employee's Outlook account.",
	}, func(ctx context.Context, _ *mcp.CallToolRequest, in modifyOutlookMessageCategoriesInput) (*mcp.CallToolResult, modifyOutlookMessageCategoriesOutput, error) {
		if err := client.ModifyMessageCategories(ctx, in.MessageID, in.AddCategories, in.RemoveCategories); err != nil {
			return nil, modifyOutlookMessageCategoriesOutput{}, err
		}
		return nil, modifyOutlookMessageCategoriesOutput{Modified: true}, nil
	})

	mcp.AddTool(server, &mcp.Tool{
		Name:        "list_outlook_attachments",
		Description: "List attachment metadata (name, content type, size) for an Outlook message.",
	}, func(ctx context.Context, _ *mcp.CallToolRequest, in listOutlookAttachmentsInput) (*mcp.CallToolResult, listOutlookAttachmentsOutput, error) {
		attachments, err := client.ListAttachments(ctx, in.MessageID)
		if err != nil {
			return nil, listOutlookAttachmentsOutput{}, err
		}
		return nil, listOutlookAttachmentsOutput{Attachments: attachments}, nil
	})

	mcp.AddTool(server, &mcp.Tool{
		Name:        "get_outlook_attachment",
		Description: "Download one attachment's bytes (base64-encoded) from an Outlook message.",
	}, func(ctx context.Context, _ *mcp.CallToolRequest, in getOutlookAttachmentInput) (*mcp.CallToolResult, getOutlookAttachmentOutput, error) {
		data, err := client.GetAttachment(ctx, in.MessageID, in.AttachmentID)
		if err != nil {
			return nil, getOutlookAttachmentOutput{}, err
		}
		return nil, getOutlookAttachmentOutput{DataBase64: base64.StdEncoding.EncodeToString(data), Size: len(data)}, nil
	})
}
