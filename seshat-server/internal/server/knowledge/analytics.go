package knowledge

import (
	"context"
	"errors"
	"strings"
	"time"

	"gorm.io/gorm"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
)

func (s *Service) recordSearchEvent(ctx context.Context, principal *iam.Principal, corpus sdb.Corpus, response *SearchResponse, latency time.Duration) (*SearchEvent, error) {
	if response == nil {
		return nil, nil
	}
	eventID, err := newID("ksrch")
	if err != nil {
		return nil, err
	}
	record := sdb.KnowledgeSearchEvent{
		ID:               eventID,
		OrganizationID:   corpus.OrganizationID,
		CorpusID:         corpus.ID,
		UserID:           principal.User.ID,
		Query:            response.Query,
		Mode:             response.Mode,
		TopK:             response.TopK,
		ResultCount:      len(response.Results),
		LatencyMillis:    latency.Milliseconds(),
		TopResultKeys:    topResultKeys(response.Results),
		TopResultFileIDs: topResultFileIDs(response.Results),
	}
	if err := s.db.Gorm().WithContext(ctx).Create(&record).Error; err != nil {
		return nil, err
	}
	event := toSearchEvent(record)
	return &event, nil
}

func topResultKeys(results []SearchResult) []string {
	values := make([]string, 0, len(results))
	for _, result := range results {
		if result.Key != "" {
			values = append(values, result.Key)
		}
	}
	return values
}

func topResultFileIDs(results []SearchResult) []string {
	seen := map[string]bool{}
	values := make([]string, 0, len(results))
	for _, result := range results {
		if result.CorpusFileID == "" || seen[result.CorpusFileID] {
			continue
		}
		seen[result.CorpusFileID] = true
		values = append(values, result.CorpusFileID)
	}
	return values
}

func (s *Service) SubmitSearchFeedback(ctx context.Context, principal *iam.Principal, params SubmitSearchFeedbackParams) (*SearchFeedback, error) {
	if principal == nil {
		return nil, ErrUnauthorized("authentication required")
	}
	searchEventID := strings.TrimSpace(params.SearchEventID)
	if searchEventID == "" {
		return nil, ErrInvalidInput("search_event_id is required")
	}
	rating := normalizeSearchFeedbackRating(params.Rating)
	if rating == "" {
		return nil, ErrInvalidInput("rating must be useful or not_useful")
	}

	var event sdb.KnowledgeSearchEvent
	if err := s.db.Gorm().WithContext(ctx).First(&event, "id = ?", searchEventID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound("search event not found")
		}
		return nil, err
	}
	if !principal.User.IsAdmin {
		if err := s.iam.CheckResourcePermission(s.db.Gorm().WithContext(ctx), principal, event.OrganizationID, "corpus", event.CorpusID, "knowledge.read", "knowledge.manage", "organization.manage"); err != nil {
			return nil, err
		}
	}

	feedbackID, err := newID("kfb")
	if err != nil {
		return nil, err
	}
	record := sdb.KnowledgeSearchFeedback{
		ID:             feedbackID,
		SearchEventID:  event.ID,
		OrganizationID: event.OrganizationID,
		CorpusID:       event.CorpusID,
		UserID:         principal.User.ID,
		ResultKey:      strings.TrimSpace(params.ResultKey),
		CorpusFileID:   strings.TrimSpace(params.CorpusFileID),
		Rating:         rating,
		Comment:        strings.TrimSpace(params.Comment),
	}
	if err := s.db.Gorm().WithContext(ctx).Create(&record).Error; err != nil {
		return nil, err
	}
	feedback := toSearchFeedback(record)
	return &feedback, nil
}

func normalizeSearchFeedbackRating(rating string) string {
	switch strings.ToLower(strings.TrimSpace(rating)) {
	case SearchFeedbackUseful, "up", "positive":
		return SearchFeedbackUseful
	case SearchFeedbackNotUseful, "down", "negative":
		return SearchFeedbackNotUseful
	default:
		return ""
	}
}

func (s *Service) GetSearchStats(ctx context.Context, principal *iam.Principal, corpusID string) (*SearchStats, error) {
	corpus, err := s.mustLoadCorpus(ctx, principal, corpusID, "knowledge.read", "knowledge.manage", "organization.manage")
	if err != nil {
		return nil, err
	}
	tx := s.db.Gorm().WithContext(ctx)

	var total int64
	if err := tx.Model(&sdb.KnowledgeSearchEvent{}).Where("corpus_id = ?", corpus.ID).Count(&total).Error; err != nil {
		return nil, err
	}
	var empty int64
	if err := tx.Model(&sdb.KnowledgeSearchEvent{}).Where("corpus_id = ? AND result_count = 0", corpus.ID).Count(&empty).Error; err != nil {
		return nil, err
	}
	var avgResult struct {
		Value *float64
	}
	if err := tx.Model(&sdb.KnowledgeSearchEvent{}).Select("AVG(result_count) AS value").Where("corpus_id = ?", corpus.ID).Scan(&avgResult).Error; err != nil {
		return nil, err
	}
	var useful int64
	if err := tx.Model(&sdb.KnowledgeSearchFeedback{}).Where("corpus_id = ? AND rating = ?", corpus.ID, SearchFeedbackUseful).Count(&useful).Error; err != nil {
		return nil, err
	}
	var notUseful int64
	if err := tx.Model(&sdb.KnowledgeSearchFeedback{}).Where("corpus_id = ? AND rating = ?", corpus.ID, SearchFeedbackNotUseful).Count(&notUseful).Error; err != nil {
		return nil, err
	}
	var recentRecords []sdb.KnowledgeSearchEvent
	if err := tx.Where("corpus_id = ?", corpus.ID).Order("created_at desc").Limit(20).Find(&recentRecords).Error; err != nil {
		return nil, err
	}
	recent := make([]SearchEvent, 0, len(recentRecords))
	for _, record := range recentRecords {
		recent = append(recent, toSearchEvent(record))
	}
	average := 0.0
	if avgResult.Value != nil {
		average = *avgResult.Value
	}
	return &SearchStats{
		OrganizationID:         corpus.OrganizationID,
		CorpusID:               corpus.ID,
		TotalSearches:          total,
		EmptySearches:          empty,
		AverageResultCount:     average,
		UsefulFeedbackCount:    useful,
		NotUsefulFeedbackCount: notUseful,
		RecentSearches:         recent,
	}, nil
}

func toSearchEvent(record sdb.KnowledgeSearchEvent) SearchEvent {
	return SearchEvent{
		ID:               record.ID,
		OrganizationID:   record.OrganizationID,
		CorpusID:         record.CorpusID,
		UserID:           record.UserID,
		Query:            record.Query,
		Mode:             record.Mode,
		TopK:             record.TopK,
		ResultCount:      record.ResultCount,
		LatencyMillis:    record.LatencyMillis,
		TopResultKeys:    cloneStringSlice(record.TopResultKeys),
		TopResultFileIDs: cloneStringSlice(record.TopResultFileIDs),
		CreatedAt:        record.CreatedAt,
	}
}

func toSearchFeedback(record sdb.KnowledgeSearchFeedback) SearchFeedback {
	return SearchFeedback{
		ID:            record.ID,
		SearchEventID: record.SearchEventID,
		CorpusID:      record.CorpusID,
		ResultKey:     record.ResultKey,
		CorpusFileID:  record.CorpusFileID,
		Rating:        record.Rating,
		Comment:       record.Comment,
		CreatedAt:     record.CreatedAt,
	}
}
