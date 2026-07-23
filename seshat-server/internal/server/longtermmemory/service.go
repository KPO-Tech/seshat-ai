// Package longtermmemory is the server-hosted implementation of the same
// entities/observations/relations knowledge graph seshat-backend already
// keeps locally (internal/db/memories.go on that repo, behind the SDK's
// longterm.Store interface — github.com/KPO-Tech/seshat/pkg/memory/longterm).
//
// This is deliberately NOT a new relevance/retrieval design: the local
// implementation's "search" is a full per-user table scan doing a
// case-insensitive substring match, not vector/embedding similarity. This
// package reproduces that exact same algorithm server-side rather than
// inventing something more sophisticated — the point of this migration is
// "move where the data lives," not "make search better," which stays a
// separate, later concern if ever wanted.
//
// Strictly personal, no organization concept — self-service only, same
// trust level as memories/preferences.
package longtermmemory

import (
	"context"
	"errors"
	"strings"
	"time"
	"unicode/utf8"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/apperr"
	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
)

type Entity struct {
	ID           string    `json:"id"`
	UserID       string    `json:"user_id"`
	Name         string    `json:"name"`
	EntityType   string    `json:"entity_type"`
	Observations []string  `json:"observations"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

type EntityInput struct {
	Name         string   `json:"name"`
	EntityType   string   `json:"entity_type"`
	Observations []string `json:"observations"`
}

type Relation struct {
	ID           string    `json:"id"`
	UserID       string    `json:"user_id"`
	From         string    `json:"from"`
	To           string    `json:"to"`
	RelationType string    `json:"relation_type"`
	CreatedAt    time.Time `json:"created_at"`
}

type ObservationInput struct {
	EntityName string   `json:"entity_name"`
	Contents   []string `json:"contents"`
}

type ObservationResult struct {
	EntityName        string   `json:"entity_name"`
	AddedObservations []string `json:"added_observations"`
}

type Graph struct {
	Entities  []Entity   `json:"entities"`
	Relations []Relation `json:"relations"`
}

type Service struct {
	db *sdb.DB
}

func New(database *sdb.DB) *Service {
	return &Service{db: database}
}

// UpsertEntities creates entities that do not exist yet for the caller
// (deduplicated by name — an existing entity is left untouched, matching
// the reference implementation, which does not update on conflict).
func (s *Service) UpsertEntities(ctx context.Context, principal *iam.Principal, inputs []EntityInput) ([]Entity, error) {
	if principal == nil {
		return nil, apperr.Unauthorized("authentication required")
	}
	userID := principal.User.ID
	created := make([]Entity, 0)
	for _, inp := range inputs {
		name := strings.TrimSpace(inp.Name)
		if name == "" {
			continue
		}
		entityType := strings.TrimSpace(inp.EntityType)
		if entityType == "" {
			entityType = "entity"
		}

		var existing sdb.MemoryEntity
		err := s.db.Gorm().WithContext(ctx).Where("user_id = ? AND name = ?", userID, name).First(&existing).Error
		if err == nil {
			continue // already exists — skip, matching the reference implementation
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, err
		}

		id, err := sdb.NewID("ment")
		if err != nil {
			return nil, err
		}
		row := sdb.MemoryEntity{ID: id, UserID: userID, Name: name, EntityType: entityType}
		if err := s.db.Gorm().WithContext(ctx).Create(&row).Error; err != nil {
			return nil, err
		}

		entity := entityFromModel(row, nil)
		if len(inp.Observations) > 0 {
			obs, err := s.insertObservations(ctx, row.ID, inp.Observations)
			if err != nil {
				return nil, err
			}
			entity.Observations = obs
		}
		created = append(created, entity)
	}
	return created, nil
}

// AddObservations appends new observations to existing entities. Duplicate
// observation strings (already present on that entity) are silently
// skipped.
func (s *Service) AddObservations(ctx context.Context, principal *iam.Principal, inputs []ObservationInput) ([]ObservationResult, error) {
	if principal == nil {
		return nil, apperr.Unauthorized("authentication required")
	}
	userID := principal.User.ID
	results := make([]ObservationResult, 0, len(inputs))
	for _, inp := range inputs {
		name := strings.TrimSpace(inp.EntityName)
		if name == "" {
			continue
		}
		var row sdb.MemoryEntity
		if err := s.db.Gorm().WithContext(ctx).Where("user_id = ? AND name = ?", userID, name).First(&row).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return nil, apperr.NotFound("entity " + name + " not found")
			}
			return nil, err
		}

		existing, err := s.loadObservationContents(ctx, row.ID)
		if err != nil {
			return nil, err
		}
		existingSet := make(map[string]bool, len(existing))
		for _, o := range existing {
			existingSet[o] = true
		}

		var toAdd []string
		for _, c := range inp.Contents {
			c = strings.TrimSpace(c)
			if c == "" || existingSet[c] {
				continue
			}
			toAdd = append(toAdd, c)
		}
		if len(toAdd) > 0 {
			if _, err := s.insertObservations(ctx, row.ID, toAdd); err != nil {
				return nil, err
			}
		}
		results = append(results, ObservationResult{EntityName: name, AddedObservations: toAdd})
	}
	return results, nil
}

// SearchNodes performs a case-insensitive substring search across entity
// names, entity types, and observation content — the same "load
// everything for this user, then strings.Contains" algorithm as the local
// implementation, not a vector/relevance search.
func (s *Service) SearchNodes(ctx context.Context, principal *iam.Principal, query string) (*Graph, error) {
	if principal == nil {
		return nil, apperr.Unauthorized("authentication required")
	}
	userID := principal.User.ID
	q := strings.ToLower(strings.TrimSpace(query))
	entities, err := s.loadEntitiesWithObservations(ctx, userID)
	if err != nil {
		return nil, err
	}

	matched := make([]Entity, 0)
	matchedIDs := make(map[string]bool)
	for _, e := range entities {
		if q == "" ||
			strings.Contains(strings.ToLower(e.Name), q) ||
			strings.Contains(strings.ToLower(e.EntityType), q) ||
			observationsContain(e.Observations, q) {
			matched = append(matched, e)
			matchedIDs[e.ID] = true
		}
	}

	relations, err := s.loadRelationsForEntities(ctx, userID, matchedIDs)
	if err != nil {
		return nil, err
	}
	return &Graph{Entities: matched, Relations: relations}, nil
}

// OpenNodes returns specific entities by exact name.
func (s *Service) OpenNodes(ctx context.Context, principal *iam.Principal, names []string) (*Graph, error) {
	if principal == nil {
		return nil, apperr.Unauthorized("authentication required")
	}
	userID := principal.User.ID
	if len(names) == 0 {
		return &Graph{}, nil
	}
	nameSet := make(map[string]bool, len(names))
	for _, n := range names {
		nameSet[strings.TrimSpace(n)] = true
	}

	entities, err := s.loadEntitiesWithObservations(ctx, userID)
	if err != nil {
		return nil, err
	}
	matched := make([]Entity, 0)
	matchedIDs := make(map[string]bool)
	for _, e := range entities {
		if nameSet[e.Name] {
			matched = append(matched, e)
			matchedIDs[e.ID] = true
		}
	}
	relations, err := s.loadRelationsForEntities(ctx, userID, matchedIDs)
	if err != nil {
		return nil, err
	}
	return &Graph{Entities: matched, Relations: relations}, nil
}

// RetrieveForContext searches nodes matching query and formats the result
// as a "## Memory" Markdown block capped to approximately maxTokens.
func (s *Service) RetrieveForContext(ctx context.Context, principal *iam.Principal, query string, maxTokens int) (string, error) {
	if principal == nil {
		return "", apperr.Unauthorized("authentication required")
	}
	if strings.TrimSpace(query) == "" {
		return "", nil
	}
	graph, err := s.SearchNodes(ctx, principal, query)
	if err != nil || graph == nil || len(graph.Entities) == 0 {
		return "", err
	}

	var sb strings.Builder
	sb.WriteString("## Memory\n\n")
	for _, e := range graph.Entities {
		sb.WriteString("**")
		sb.WriteString(e.Name)
		sb.WriteString("** (")
		sb.WriteString(e.EntityType)
		sb.WriteString(")\n")
		for _, o := range e.Observations {
			sb.WriteString("- ")
			sb.WriteString(o)
			sb.WriteString("\n")
		}
		sb.WriteString("\n")
	}
	if len(graph.Relations) > 0 {
		sb.WriteString("**Relations:**\n")
		for _, r := range graph.Relations {
			sb.WriteString("- ")
			sb.WriteString(r.From)
			sb.WriteString(" → ")
			sb.WriteString(r.To)
			sb.WriteString(" (")
			sb.WriteString(r.RelationType)
			sb.WriteString(")\n")
		}
	}

	result := sb.String()
	if maxTokens > 0 {
		result = truncateToTokens(result, maxTokens)
	}
	return strings.TrimRight(result, "\n"), nil
}

// ─── helpers ──────────────────────────────────────────────────────────────────

func (s *Service) insertObservations(ctx context.Context, entityID string, contents []string) ([]string, error) {
	rows := make([]sdb.MemoryObservation, 0, len(contents))
	for _, c := range contents {
		id, err := sdb.NewID("mob")
		if err != nil {
			return nil, err
		}
		rows = append(rows, sdb.MemoryObservation{ID: id, EntityID: entityID, Content: strings.TrimSpace(c)})
	}
	if err := s.db.Gorm().WithContext(ctx).Clauses(clause.OnConflict{DoNothing: true}).Create(&rows).Error; err != nil {
		return nil, err
	}
	out := make([]string, len(rows))
	for i, r := range rows {
		out[i] = r.Content
	}
	return out, nil
}

func (s *Service) loadObservationContents(ctx context.Context, entityID string) ([]string, error) {
	var rows []sdb.MemoryObservation
	if err := s.db.Gorm().WithContext(ctx).Where("entity_id = ?", entityID).Order("created_at asc").Find(&rows).Error; err != nil {
		return nil, err
	}
	out := make([]string, len(rows))
	for i, r := range rows {
		out[i] = r.Content
	}
	return out, nil
}

func (s *Service) loadEntitiesWithObservations(ctx context.Context, userID string) ([]Entity, error) {
	var entityRows []sdb.MemoryEntity
	if err := s.db.Gorm().WithContext(ctx).Where("user_id = ?", userID).Order("created_at asc").Find(&entityRows).Error; err != nil {
		return nil, err
	}
	if len(entityRows) == 0 {
		return nil, nil
	}

	ids := make([]string, len(entityRows))
	for i, r := range entityRows {
		ids[i] = r.ID
	}
	var obsRows []sdb.MemoryObservation
	if err := s.db.Gorm().WithContext(ctx).Where("entity_id IN ?", ids).Order("created_at asc").Find(&obsRows).Error; err != nil {
		return nil, err
	}

	obsMap := make(map[string][]string, len(entityRows))
	for _, o := range obsRows {
		obsMap[o.EntityID] = append(obsMap[o.EntityID], o.Content)
	}

	out := make([]Entity, len(entityRows))
	for i, r := range entityRows {
		out[i] = entityFromModel(r, obsMap[r.ID])
	}
	return out, nil
}

func (s *Service) loadRelationsForEntities(ctx context.Context, userID string, entityIDs map[string]bool) ([]Relation, error) {
	if len(entityIDs) == 0 {
		return nil, nil
	}
	ids := make([]string, 0, len(entityIDs))
	for id := range entityIDs {
		ids = append(ids, id)
	}

	var rows []sdb.MemoryRelation
	if err := s.db.Gorm().WithContext(ctx).
		Where("user_id = ? AND (from_name IN ? OR to_name IN ?)", userID, ids, ids).
		Order("created_at asc").Find(&rows).Error; err != nil {
		return nil, err
	}

	out := make([]Relation, 0, len(rows))
	for _, r := range rows {
		out = append(out, Relation{
			ID: r.ID, UserID: r.UserID, From: r.FromName, To: r.ToName,
			RelationType: r.RelationType, CreatedAt: r.CreatedAt,
		})
	}
	return out, nil
}

func entityFromModel(r sdb.MemoryEntity, observations []string) Entity {
	if observations == nil {
		observations = []string{}
	}
	return Entity{
		ID: r.ID, UserID: r.UserID, Name: r.Name, EntityType: r.EntityType,
		Observations: observations, CreatedAt: r.CreatedAt, UpdatedAt: r.UpdatedAt,
	}
}

func observationsContain(observations []string, query string) bool {
	for _, o := range observations {
		if strings.Contains(strings.ToLower(o), query) {
			return true
		}
	}
	return false
}

// truncateToTokens caps s to approximately maxTokens (rough estimate: 4
// chars = 1 token). Truncates at a newline boundary when possible.
func truncateToTokens(s string, maxTokens int) string {
	maxChars := maxTokens * 4
	if utf8.RuneCountInString(s) <= maxChars {
		return s
	}
	runes := []rune(s)
	cut := runes[:maxChars]
	for i := len(cut) - 1; i >= 0; i-- {
		if cut[i] == '\n' {
			return string(cut[:i+1]) + "\n*(truncated)*"
		}
	}
	return string(cut) + "\n*(truncated)*"
}
