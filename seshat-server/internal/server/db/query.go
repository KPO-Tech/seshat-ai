package db

import (
	"fmt"
	"regexp"
	"strings"

	"gorm.io/gorm"
)

// safeColumnPattern allows a bare column ("email") or a table-qualified one
// ("users.email"), since a couple of list endpoints join across tables.
var safeColumnPattern = regexp.MustCompile(`^[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)?$`)

// ListParams is the shared search/sort/pagination contract for list
// endpoints, carried all the way down to the SQL query instead of being
// applied in Go after loading every matching row into memory. Both iam and
// automation use this one type so there is a single contract to maintain.
type ListParams struct {
	Search string
	Sort   string
	Order  string
	Limit  int
	Offset int
}

// SortField maps an API-facing sort key to the real column backing it, plus
// a deterministic tiebreaker column (usually "id") so rows with an equal
// primary sort value still page consistently.
type SortField struct {
	Column   string
	Tiebreak string
}

// ResolveSortField validates a requested sort key against an allowlist built
// by the caller, so a value coming from a request query parameter never
// reaches raw SQL unchecked.
func ResolveSortField(fields map[string]SortField, requested string) (SortField, error) {
	field, ok := fields[requested]
	if !ok {
		return SortField{}, fmt.Errorf("unsupported sort field: %s", requested)
	}
	if field.Tiebreak == "" {
		field.Tiebreak = "id"
	}
	return field, nil
}

// ApplySearch adds a case-insensitive substring match across the given
// columns. Columns must be compile-time-known identifiers supplied by the
// caller (e.g. "name", "slug"), never a value derived from request input —
// they are interpolated directly into SQL text. mustBeSafeColumn is defense
// in depth, not the primary safeguard.
func ApplySearch(query *gorm.DB, search string, columns ...string) *gorm.DB {
	search = strings.TrimSpace(search)
	if search == "" || len(columns) == 0 {
		return query
	}
	clauses := make([]string, 0, len(columns))
	args := make([]any, 0, len(columns))
	pattern := "%" + strings.ToLower(search) + "%"
	for _, column := range columns {
		mustBeSafeColumn(column)
		clauses = append(clauses, fmt.Sprintf("LOWER(%s) LIKE ?", column))
		args = append(args, pattern)
	}
	return query.Where(strings.Join(clauses, " OR "), args...)
}

// ApplySort adds a deterministic ORDER BY (the requested field, then its
// tiebreaker) to the query.
func ApplySort(query *gorm.DB, field SortField, order string) *gorm.DB {
	mustBeSafeColumn(field.Column)
	tiebreak := field.Tiebreak
	if tiebreak == "" {
		tiebreak = "id"
	}
	mustBeSafeColumn(tiebreak)
	direction := "ASC"
	if strings.EqualFold(order, "desc") {
		direction = "DESC"
	}
	return query.Order(fmt.Sprintf("%s %s, %s %s", field.Column, direction, tiebreak, direction))
}

// Page runs a count and the page fetch against the same filtered query, so
// callers get a real total without loading every matching row into memory
// just to slice off one page of it.
func Page[T any](query *gorm.DB, limit, offset int) ([]T, int64, error) {
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var rows []T
	if err := query.Limit(limit).Offset(offset).Find(&rows).Error; err != nil {
		return nil, 0, err
	}
	return rows, total, nil
}

func mustBeSafeColumn(column string) {
	if !safeColumnPattern.MatchString(column) {
		panic(fmt.Sprintf("db: unsafe column name in list query: %q", column))
	}
}
