package api

import (
	"context"
	"encoding/json"

	backendauth "github.com/EngineerProjects/seshat-ai/seshat-backend/internal/auth"
	backendfiles "github.com/EngineerProjects/seshat-ai/seshat-backend/internal/files"
	backendquery "github.com/EngineerProjects/seshat-ai/seshat-backend/internal/query"
	"github.com/KPO-Tech/seshat/pkg/types"
)

// attachmentResponse is the wire shape for a file attached to a user message.
type attachmentResponse struct {
	FileID      string `json:"file_id"`
	Filename    string `json:"filename"`
	ContentType string `json:"content_type"`
	Category    string `json:"category"`
	Size        int64  `json:"size"`
}

// messageWithAttachments wraps a runtime types.Message to add an
// "attachments" field to its JSON representation. types.Message.MarshalJSON
// only recognizes its own built-in content-block types (text/image/tool_use/
// tool_result/thinking) and errors on anything else, so attachments can't be
// injected as a fake content block — they ride alongside the message instead,
// via this wrapper's own MarshalJSON built on top of the message's real one.
type messageWithAttachments struct {
	msg         types.Message
	attachments []attachmentResponse
}

func (m messageWithAttachments) MarshalJSON() ([]byte, error) {
	base, err := json.Marshal(m.msg)
	if err != nil {
		return nil, err
	}
	if len(m.attachments) == 0 {
		return base, nil
	}
	var asMap map[string]json.RawMessage
	if err := json.Unmarshal(base, &asMap); err != nil {
		return nil, err
	}
	attachmentsJSON, err := json.Marshal(m.attachments)
	if err != nil {
		return nil, err
	}
	asMap["attachments"] = attachmentsJSON
	return json.Marshal(asMap)
}

// decorateMessagesWithAttachments pairs each user message with the files
// attached to it (see internal/files.Service.AttachToMessage), by 0-based
// position among the session's user messages. Best effort: on any lookup
// failure, messages are returned with no attachments rather than failing the
// whole response — an attachment is enrichment, not something a session view
// should ever break over.
func decorateMessagesWithAttachments(ctx context.Context, filesSvc *backendfiles.Service, principal *backendauth.Principal, sessionID string, messages []types.Message) []messageWithAttachments {
	out := make([]messageWithAttachments, 0, len(messages))
	if filesSvc == nil {
		for _, m := range messages {
			out = append(out, messageWithAttachments{msg: m})
		}
		return out
	}
	byIndex, _ := filesSvc.ListMessageAttachments(ctx, principal, sessionID)
	userIndex := 0
	for _, m := range messages {
		var attachments []attachmentResponse
		if m.Role == types.RoleUser {
			for _, f := range byIndex[userIndex] {
				attachments = append(attachments, attachmentResponse{
					FileID:      f.ID,
					Filename:    f.Filename,
					ContentType: f.ContentType,
					Category:    f.Category,
					Size:        f.Size,
				})
			}
			userIndex++
		}
		out = append(out, messageWithAttachments{msg: m, attachments: attachments})
	}
	return out
}

// withDecoratedMessages returns a JSON-marshalable value equivalent to
// detail, except its "messages" field carries each user message's
// attachments. detail's own fields are preserved as-is by round-tripping
// through its default marshaling rather than re-declaring SessionInfo's
// field list here, so this stays correct if SessionInfo grows new fields.
func withDecoratedMessages(ctx context.Context, app *App, principal *backendauth.Principal, sessionID string, detail *backendquery.SessionDetail) json.Marshaler {
	return sessionDetailResponse{ctx: ctx, app: app, principal: principal, sessionID: sessionID, detail: detail}
}

type sessionDetailResponse struct {
	ctx       context.Context
	app       *App
	principal *backendauth.Principal
	sessionID string
	detail    *backendquery.SessionDetail
}

func (r sessionDetailResponse) MarshalJSON() ([]byte, error) {
	base, err := json.Marshal(r.detail)
	if err != nil {
		return nil, err
	}
	var asMap map[string]json.RawMessage
	if err := json.Unmarshal(base, &asMap); err != nil {
		return nil, err
	}
	decorated := decorateMessagesWithAttachments(r.ctx, r.app.backend.Files, r.principal, r.sessionID, r.detail.Messages)
	messagesJSON, err := json.Marshal(decorated)
	if err != nil {
		return nil, err
	}
	asMap["messages"] = messagesJSON
	return json.Marshal(asMap)
}
