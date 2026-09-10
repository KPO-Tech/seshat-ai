package automation

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"time"

	"gorm.io/gorm"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
)

const (
	// overviewWindowDays is the fixed "recent" window backing every 30-day
	// stat on Overview (Executions, Success Rate, Impact) - see
	// automation-app-pages.md §6.
	overviewWindowDays = 30
	// consecutiveFailureThreshold - an active job whose N most recent runs
	// are ALL "failed" surfaces in Attention Required. A deliberate,
	// documented choice: low enough to catch a genuinely broken job
	// quickly, high enough that a couple of unlucky transient failures on
	// an otherwise-fine job don't page.
	consecutiveFailureThreshold = 3
	// recentActivityLimit caps the Activity feed - a dashboard glance, not
	// a full history (that's a job's own Runs tab).
	recentActivityLimit = 20
)

// AttentionItemKind is a typed string (not embedded ad hoc in AttentionItem)
// so more kinds - pending human approval, expired connection, unreachable
// webhook (see automation-app-pages.md §6's fuller example list) - can be
// added later purely by adding a new const and a new detection query,
// without changing this response shape or requiring frontend consumers to
// branch on anything but Kind.
type AttentionItemKind string

// AttentionKindConsecutiveFailures is the only kind implemented this phase.
// The others from the doc's example (pending approvals, expired
// connections, unreachable webhooks, unusual consumption, missing expected
// execution) have no backing data source yet:
//   - pending human approval: no Human Approval node exists in the dataflow
//     engine at all (see templates.go's own comment).
//   - expired connection / unreachable webhook: no link from a job's graph
//     nodes to the ConnectorAccount rows it depends on exists.
//
// Both are explicit future backend work, not implemented here.
const AttentionKindConsecutiveFailures AttentionItemKind = "consecutive_failures"

// AttentionItem is one actionable row in Overview's "Attention Required"
// section (automation-app-pages.md §6).
type AttentionItem struct {
	Kind       AttentionItemKind `json:"kind"`
	JobID      string            `json:"job_id"`
	JobName    string            `json:"job_name"`
	Message    string            `json:"message"` // e.g. "3 consecutive failures"
	LastRunID  string            `json:"last_run_id,omitempty"`
	DetectedAt time.Time         `json:"detected_at"`
}

// RecentActivityItem is one row in Overview's Activity feed - a thin,
// dashboard-sized projection of JobRun with the job's name already joined
// in, so the frontend needs no second request to render "Invoice
// Processing - failed - 2m ago". This is NOT a change to the shared Run
// type used by RunsPanel/the device protocol elsewhere.
type RecentActivityItem struct {
	RunID      string     `json:"run_id"`
	JobID      string     `json:"job_id"`
	JobName    string     `json:"job_name"`
	Status     string     `json:"status"`
	QueuedAt   time.Time  `json:"queued_at"`
	StartedAt  *time.Time `json:"started_at,omitempty"`
	FinishedAt *time.Time `json:"finished_at,omitempty"`
}

// OverviewStats backs both the KPI strip and the Impact section (Impact
// deliberately reuses these same real numbers rather than a fabricated
// "hours saved" - see automation-app-pages.md §6's Impact section).
type OverviewStats struct {
	ActiveProjects       int64 `json:"active_projects"`
	TotalProjects        int64 `json:"total_projects"`
	NewProjectsThisMonth int64 `json:"new_projects_this_month"`
	WindowDays           int   `json:"window_days"`
	ExecutionsWindow     int64 `json:"executions_window"` // all runs queued in the window, any status
	CompletedWindow      int64 `json:"completed_window"`  // = "tasks automated" in Impact
	FailedWindow         int64 `json:"failed_window"`
	// SuccessRatePercent/FailureRatePercent are nil when there is no
	// finished run in the window at all (completed+failed == 0) - an
	// undefined rate must render as "no data yet", never as a fabricated 0%
	// or 100%.
	SuccessRatePercent *float64 `json:"success_rate_percent,omitempty"`
	FailureRatePercent *float64 `json:"failure_rate_percent,omitempty"`
}

// Overview is the full payload for GET /api/v1/automation/overview.
type Overview struct {
	Stats          OverviewStats        `json:"stats"`
	Attention      []AttentionItem      `json:"attention"`
	RecentActivity []RecentActivityItem `json:"recent_activity"`
}

// GetOverview computes Automation's dashboard: KPI counts, attention
// signals and a recent-activity feed, all scoped to one organization.
// Requires jobs.read, jobs.manage or organization.manage - same visibility
// posture as ListJobs/ListRuns (empty-shaped result for a caller lacking
// permission, not a 403).
func (s *Service) GetOverview(ctx context.Context, principal *iam.Principal, organizationID string) (*Overview, error) {
	if principal == nil {
		return nil, ErrUnauthorized("authentication required")
	}
	organizationID = strings.TrimSpace(organizationID)
	if organizationID == "" {
		return nil, ErrInvalidInput("organization_id is required")
	}
	tx := s.db.Gorm().WithContext(ctx)
	if !principal.User.IsAdmin {
		if err := s.iam.CheckOrganizationPermission(tx, principal, organizationID, "jobs.read", "jobs.manage", "organization.manage"); err != nil {
			return &Overview{Attention: []AttentionItem{}, RecentActivity: []RecentActivityItem{}}, nil
		}
	}

	stats, err := computeOverviewStats(tx, organizationID)
	if err != nil {
		return nil, err
	}
	attention, err := computeAttentionItems(tx, organizationID)
	if err != nil {
		return nil, err
	}
	activity, err := computeRecentActivity(tx, organizationID)
	if err != nil {
		return nil, err
	}
	return &Overview{Stats: stats, Attention: attention, RecentActivity: activity}, nil
}

func computeOverviewStats(tx *gorm.DB, organizationID string) (OverviewStats, error) {
	stats := OverviewStats{WindowDays: overviewWindowDays}

	if err := tx.Model(&sdb.ScheduledJob{}).Where("organization_id = ?", organizationID).Count(&stats.TotalProjects).Error; err != nil {
		return stats, err
	}
	if err := tx.Model(&sdb.ScheduledJob{}).Where("organization_id = ? AND status = ?", organizationID, JobStatusActive).Count(&stats.ActiveProjects).Error; err != nil {
		return stats, err
	}
	monthStart := startOfCurrentMonthUTC(time.Now())
	if err := tx.Model(&sdb.ScheduledJob{}).Where("organization_id = ? AND created_at >= ?", organizationID, monthStart).Count(&stats.NewProjectsThisMonth).Error; err != nil {
		return stats, err
	}

	cutoff := time.Now().UTC().AddDate(0, 0, -overviewWindowDays)
	if err := tx.Model(&sdb.JobRun{}).Where("organization_id = ? AND queued_at >= ?", organizationID, cutoff).Count(&stats.ExecutionsWindow).Error; err != nil {
		return stats, err
	}
	if err := tx.Model(&sdb.JobRun{}).Where("organization_id = ? AND queued_at >= ? AND status = ?", organizationID, cutoff, RunStatusCompleted).Count(&stats.CompletedWindow).Error; err != nil {
		return stats, err
	}
	if err := tx.Model(&sdb.JobRun{}).Where("organization_id = ? AND queued_at >= ? AND status = ?", organizationID, cutoff, RunStatusFailed).Count(&stats.FailedWindow).Error; err != nil {
		return stats, err
	}

	if finished := stats.CompletedWindow + stats.FailedWindow; finished > 0 {
		success := float64(stats.CompletedWindow) / float64(finished) * 100
		failure := float64(stats.FailedWindow) / float64(finished) * 100
		stats.SuccessRatePercent = &success
		stats.FailureRatePercent = &failure
	}
	return stats, nil
}

// computeAttentionItems detects a "consecutive run failures" signal per
// active job. Efficiency: a first cheap in-memory filter using the
// already-denormalized ScheduledJob.LastRunStatus (no extra query - a job
// whose most recent run wasn't "failed" cannot be mid-failure-streak) cuts
// the candidate set before the one query-per-job that follows. N+1 over
// that reduced "actively failing" set is accepted deliberately: typical
// orgs have at most a handful of jobs failing at once, and a single SQL
// query per candidate (LIMIT 3) is cheap and trivially correct, versus a
// window-function query that would need separate SQL for the sqlite vs
// postgres drivers this service already supports - not worth the
// portability cost at this scale.
func computeAttentionItems(tx *gorm.DB, organizationID string) ([]AttentionItem, error) {
	var candidates []sdb.ScheduledJob
	if err := tx.Where("organization_id = ? AND status = ? AND last_run_status = ?",
		organizationID, JobStatusActive, RunStatusFailed).Find(&candidates).Error; err != nil {
		return nil, err
	}

	items := make([]AttentionItem, 0, len(candidates))
	for _, job := range candidates {
		var recent []sdb.JobRun
		if err := tx.Where("job_id = ?", job.ID).
			Order("queued_at desc").
			Limit(consecutiveFailureThreshold).
			Find(&recent).Error; err != nil {
			return nil, err
		}
		if len(recent) < consecutiveFailureThreshold {
			continue // not enough run history yet to call it a "streak"
		}
		allFailed := true
		for _, r := range recent {
			if r.Status != RunStatusFailed {
				allFailed = false
				break
			}
		}
		if !allFailed {
			continue
		}
		items = append(items, AttentionItem{
			Kind:       AttentionKindConsecutiveFailures,
			JobID:      job.ID,
			JobName:    job.Name,
			Message:    fmt.Sprintf("%d consecutive failures", len(recent)),
			LastRunID:  recent[0].ID,
			DetectedAt: recent[0].QueuedAt,
		})
	}
	sort.Slice(items, func(i, j int) bool { return items[i].DetectedAt.After(items[j].DetectedAt) })
	return items, nil
}

// computeRecentActivity returns the most recent org-wide runs with each
// job's name already joined in - two queries total (never N+1): one for
// the run page, one batched IN(...) lookup for the distinct job names.
func computeRecentActivity(tx *gorm.DB, organizationID string) ([]RecentActivityItem, error) {
	var runs []sdb.JobRun
	if err := tx.Where("organization_id = ?", organizationID).
		Order("queued_at desc").
		Limit(recentActivityLimit).
		Find(&runs).Error; err != nil {
		return nil, err
	}
	if len(runs) == 0 {
		return []RecentActivityItem{}, nil
	}

	jobIDSet := make(map[string]struct{}, len(runs))
	for _, r := range runs {
		jobIDSet[r.JobID] = struct{}{}
	}
	jobIDs := make([]string, 0, len(jobIDSet))
	for id := range jobIDSet {
		jobIDs = append(jobIDs, id)
	}
	var jobRecords []sdb.ScheduledJob
	if err := tx.Where("id IN ?", jobIDs).Find(&jobRecords).Error; err != nil {
		return nil, err
	}
	nameByID := make(map[string]string, len(jobRecords))
	for _, j := range jobRecords {
		nameByID[j.ID] = j.Name
	}

	items := make([]RecentActivityItem, 0, len(runs))
	for _, r := range runs {
		name := nameByID[r.JobID]
		if name == "" {
			// A run can't currently outlive its job (DeleteJob cascades
			// JobRun too) - defensive only, never expected in practice.
			name = "(deleted job)"
		}
		items = append(items, RecentActivityItem{
			RunID: r.ID, JobID: r.JobID, JobName: name, Status: r.Status,
			QueuedAt: r.QueuedAt, StartedAt: r.StartedAt, FinishedAt: r.FinishedAt,
		})
	}
	return items, nil
}

func startOfCurrentMonthUTC(now time.Time) time.Time {
	y, m, _ := now.UTC().Date()
	return time.Date(y, m, 1, 0, 0, 0, 0, time.UTC)
}
