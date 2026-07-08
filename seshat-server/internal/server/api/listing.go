package api

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
)

const (
	defaultListLimit = 50
	maxListLimit     = 200
)

// listQuery normalizes the shared list contract exposed by admin endpoints.
type listQuery struct {
	Limit  int
	Offset int
	Sort   string
	Order  string
	Search string
}

func parseListQuery(r *http.Request, defaultSort, defaultOrder string) (listQuery, error) {
	query := listQuery{
		Limit:  defaultListLimit,
		Offset: 0,
		Sort:   strings.ToLower(strings.TrimSpace(defaultSort)),
		Order:  strings.ToLower(strings.TrimSpace(defaultOrder)),
		Search: strings.TrimSpace(r.URL.Query().Get("q")),
	}
	if query.Order == "" {
		query.Order = "asc"
	}

	if raw := strings.TrimSpace(r.URL.Query().Get("limit")); raw != "" {
		value, err := strconv.Atoi(raw)
		if err != nil || value < 0 {
			return listQuery{}, fmt.Errorf("limit must be a non-negative integer")
		}
		if value > maxListLimit {
			value = maxListLimit
		}
		query.Limit = value
	}

	if raw := strings.TrimSpace(r.URL.Query().Get("offset")); raw != "" {
		value, err := strconv.Atoi(raw)
		if err != nil || value < 0 {
			return listQuery{}, fmt.Errorf("offset must be a non-negative integer")
		}
		query.Offset = value
	}

	if raw := strings.TrimSpace(r.URL.Query().Get("sort")); raw != "" {
		query.Sort = strings.ToLower(raw)
	}

	if raw := strings.TrimSpace(r.URL.Query().Get("order")); raw != "" {
		switch strings.ToLower(raw) {
		case "asc", "desc":
			query.Order = strings.ToLower(raw)
		default:
			return listQuery{}, fmt.Errorf("order must be asc or desc")
		}
	}

	return query, nil
}

// writeListResponse keeps list payloads uniform for the future admin frontend.
func writeListResponse[T any](w http.ResponseWriter, status int, key string, items []T, query listQuery, total int) {
	payload := map[string]any{
		key:        items,
		"count":    len(items),
		"total":    total,
		"limit":    query.Limit,
		"offset":   query.Offset,
		"has_more": query.Offset+len(items) < total,
		"sort":     query.Sort,
		"order":    query.Order,
	}
	if query.Search != "" {
		payload["query"] = query.Search
	}
	writeJSON(w, status, payload)
}
