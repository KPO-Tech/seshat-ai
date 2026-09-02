package automation

import (
	"context"
	"errors"
	"fmt"
	"time"

	"golang.org/x/oauth2"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	coregmail "github.com/EngineerProjects/seshat-ai/seshat-core/gmail"
	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
	"github.com/KPO-Tech/seshat/pkg/dataflow"
)

// ConnectorTokenResolver resolves a fresh, usable OAuth access token for
// userID's connected account of the given kind — satisfied by
// *connectors.Service.AccessTokenForUser, injected via
// GmailPollNode's constructor rather than importing connectors directly
// (same "compose through an interface" reasoning as RAGResolver/MCPResolver
// above).
type ConnectorTokenResolver interface {
	AccessTokenForUser(ctx context.Context, organizationID, kind, userID string) (string, bool, error)
}

// GmailPollNode is the "gmail_new_messages" node type: a starting node
// (no incoming connections) for an interval-triggered ScheduledJob's Graph
// that polls its owner's connected Gmail account for messages received
// since the job's own last successful poll, emitting one item per message.
// Deliberately not part of the generic pkg/dataflow SDK — it needs a
// seshat-ai connector account and a persisted per-job cursor, both
// product-specific concerns.
//
// Reads job context (job_id, owner_id, organization_id) from its own input
// — see executeCloudRun, which seeds every graph run's starting nodes with
// exactly this — rather than from node Parameters, since the graph
// definition itself is authored once and reused across every run of the
// job, while the owner/org identity is a property of *which job*, resolved
// by the caller at execution time.
type GmailPollNode struct {
	db     *sdb.DB
	tokens ConnectorTokenResolver
	// newGmailClient defaults to wrapping coregmail.New; tests override it to
	// point at a fake Gmail server (option.WithEndpoint), the same injection
	// pattern pkg/dataflow/nodes/http.go's checkSSRF field uses.
	newGmailClient func(ctx context.Context, ts oauth2.TokenSource) (*coregmail.Client, error)
}

func NewGmailPollNode(db *sdb.DB, tokens ConnectorTokenResolver) *GmailPollNode {
	return &GmailPollNode{db: db, tokens: tokens, newGmailClient: func(ctx context.Context, ts oauth2.TokenSource) (*coregmail.Client, error) {
		return coregmail.New(ctx, ts)
	}}
}

func (n *GmailPollNode) Description() dataflow.NodeDescription {
	return dataflow.NodeDescription{Type: "gmail_new_messages", Name: "Gmail: New Messages", Category: "Messaging",
		Description: "Polls the job owner's connected Gmail account for messages received since this job's own last successful run (Gmail's incremental history sync — never reprocesses a message already seen), emitting one item per new message (fields \"id\", \"thread_id\", \"subject\", \"from\", \"to\", \"body\", \"sent_at\"). Use on an interval-triggered job (not event-triggered — there is no push trigger yet, see the SDK). " +
			"Parameters: none — the job's owner/organization identity is resolved automatically from the run, not authored per graph."}
}

func (n *GmailPollNode) ValidateParameters(map[string]any) error { return nil }

func (n *GmailPollNode) Execute(ctx context.Context, rt *dataflow.Runtime, input []dataflow.Item, params map[string]any) (dataflow.Output, error) {
	if len(input) == 0 {
		return dataflow.Output{}, errors.New("gmail_new_messages: no job context in input (expected job_id/owner_id/organization_id)")
	}
	jobID, _ := input[0]["job_id"].(string)
	ownerID, _ := input[0]["owner_id"].(string)
	organizationID, _ := input[0]["organization_id"].(string)
	if jobID == "" || ownerID == "" || organizationID == "" {
		return dataflow.Output{}, errors.New("gmail_new_messages: job_id/owner_id/organization_id are required in input")
	}

	token, ok, err := n.tokens.AccessTokenForUser(ctx, organizationID, "gmail", ownerID)
	if err != nil {
		return dataflow.Output{}, fmt.Errorf("resolve gmail access token: %w", err)
	}
	if !ok {
		return dataflow.Output{}, errors.New("gmail_new_messages: job owner has no connected Gmail account")
	}

	cursor, err := n.loadCursor(ctx, jobID)
	if err != nil {
		return dataflow.Output{}, fmt.Errorf("load mail cursor: %w", err)
	}

	ts := oauth2.StaticTokenSource(&oauth2.Token{AccessToken: token})
	client, err := n.newGmailClient(ctx, ts)
	if err != nil {
		return dataflow.Output{}, fmt.Errorf("build gmail client: %w", err)
	}

	messages, newCursor, err := client.Sync(ctx, cursor)
	if err != nil {
		return dataflow.Output{}, fmt.Errorf("sync gmail: %w", err)
	}
	if err := n.saveCursor(ctx, jobID, newCursor); err != nil {
		return dataflow.Output{}, fmt.Errorf("save mail cursor: %w", err)
	}

	items := make([]dataflow.Item, 0, len(messages))
	for _, m := range messages {
		items = append(items, dataflow.Item{
			"id": m.ID, "thread_id": m.ThreadID, "subject": m.Subject,
			"from": m.From.Address, "to": m.To.Address, "body": m.BodyText,
			"sent_at": m.SentAt.Format(time.RFC3339),
		})
	}
	return dataflow.Main(items), nil
}

func (n *GmailPollNode) loadCursor(ctx context.Context, jobID string) (string, error) {
	var row sdb.ScheduledJobMailCursor
	err := n.db.Gorm().WithContext(ctx).First(&row, "scheduled_job_id = ?", jobID).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return "", nil // first run - bootstrap sync
		}
		return "", err
	}
	return row.Cursor, nil
}

func (n *GmailPollNode) saveCursor(ctx context.Context, jobID, cursor string) error {
	row := sdb.ScheduledJobMailCursor{ScheduledJobID: jobID, Cursor: cursor, UpdatedAt: time.Now().UTC()}
	return n.db.Gorm().WithContext(ctx).Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "scheduled_job_id"}},
		DoUpdates: clause.AssignmentColumns([]string{"cursor", "updated_at"}),
	}).Create(&row).Error
}
