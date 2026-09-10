import { useEffect, useState } from 'react'
import { CheckOne, ChartHistogram, FolderOpen, Rocket, Right, Plus, TrendingUp } from '@icon-park/react'
import { api, ApiError } from '@/api/client'
import { RUN_STATUS_LABEL } from '../graph/types'
import type { Overview, AttentionItem, RecentActivityItem } from '../api/overview'

// Automation's real "Overview" (Phase 1 of docs/produits/platforms/
// automation/automation-app-pages.md's rollout, §6) - a KPI/attention/
// activity dashboard, not the job list (that's AutomationProjectsPanel now).
// Every number here is backed by a real query on seshat-server
// (automation.Service.GetOverview) - no fabricated "time saved"/ROI figure,
// since no such concept exists in the backend yet (see overview.go's own
// doc comments on what's deliberately out of scope this phase). Layout
// follows the Stitch-generated mockup's structure under docs/produits/
// platforms/automation/design/ (icon-chip KPI cards, a two-column Attention
// + Impact section, a real activity table) - colors/type/shape stay
// Seshat's own existing design tokens, not that mockup's own generated
// palette (see automation-app-pages.md §38/42/44). Anything the mockup
// shows that we have no real data for (Business Impact's €/ROI/human-
// touch figures, per-node "Agent Routing Flow", a "Human Step" column) is
// left out rather than faked.
export function AutomationOverviewPanel({
  organizationId, onNew, onOpenJob, onOpenRun,
}: {
  organizationId: string
  onNew: () => void
  onOpenJob: (jobId: string) => void
  onOpenRun: (jobId: string, runId: string) => void
}) {
  const [overview, setOverview] = useState<Overview | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!organizationId) return
    let cancelled = false
    setOverview(null)
    setError(null)
    api.get<Overview>(`/automation/overview?organization_id=${encodeURIComponent(organizationId)}`)
      .then((res) => { if (!cancelled) setOverview(res) })
      .catch((err) => { if (!cancelled) setError(err instanceof ApiError ? err.message : 'Failed to load overview.') })
    return () => { cancelled = true }
  }, [organizationId])

  // organizationId can stay empty indefinitely if AuthGuard's own /auth/me
  // call failed at boot (network error or 5xx - see AuthGuard.tsx, which
  // still sets status 'ok' without populating the organization store in
  // that path) - a distinct message here, same fix already applied to
  // VariablesPanel, instead of hanging on a generic "Loading…" forever with
  // no visible explanation.
  if (!organizationId) return <div className="au-loading">Waiting for your organization…</div>
  if (error) return <div className="au-loading au-loading-error">{error}</div>
  if (!overview) return <div className="au-loading">Loading…</div>

  const { stats, attention, recent_activity: activity } = overview

  return (
    <div className="au-dash">
      <style>{OVERVIEW_DASH_CSS}</style>

      <header className="au-dash-header">
        <div>
          <span className="au-dash-eyebrow">{stats.total_projects} project{stats.total_projects === 1 ? '' : 's'} total</span>
          <h1>Overview</h1>
          <p className="au-dash-subtitle">What's happening across your automations right now.</p>
        </div>
        <button type="button" className="au-save-btn" onClick={onNew}>
          <Plus size={14} /> New automation
        </button>
      </header>

      <div className="au-dash-kpis">
        <KpiCard
          icon={<FolderOpen size={20} />}
          label="Active Projects"
          value={stats.active_projects}
          secondary={`/ ${stats.total_projects} total`}
          footText={stats.new_projects_this_month > 0 ? `+${stats.new_projects_this_month} deployed this month` : 'No new projects this month'}
          trend={stats.new_projects_this_month > 0 ? 'up' : undefined}
        />
        <KpiCard
          icon={<ChartHistogram size={20} />}
          label="Executions"
          value={stats.executions_window}
          footText={`Last ${stats.window_days} days`}
        />
        <KpiCard
          icon={<CheckOne size={20} />}
          label="Success Rate"
          value={stats.success_rate_percent != null ? `${stats.success_rate_percent.toFixed(1)}%` : '—'}
          footText={stats.success_rate_percent != null ? `${stats.failure_rate_percent?.toFixed(1) ?? '0.0'}% failure` : 'No finished runs yet'}
          trend={stats.success_rate_percent != null && stats.success_rate_percent >= 90 ? 'up' : undefined}
        />
      </div>

      <div className="au-dash-columns">
        <section className="au-dash-card">
          <header className="au-dash-card-head">
            <div className="au-dash-card-head-title">
              <span className="au-dash-pulse-dot" />
              <h2>Attention required</h2>
            </div>
            {attention.length > 0 && <span className="au-dash-count-pill">{attention.length} item{attention.length === 1 ? '' : 's'} need action</span>}
          </header>
          {attention.length === 0 ? (
            <EmptyState icon={<CheckOne size={18} />} text="Nothing needs attention right now." />
          ) : (
            <div className="au-dash-alerts">
              {attention.map((item) => (
                <AttentionRow key={`${item.kind}-${item.job_id}`} item={item} onOpenJob={onOpenJob} onOpenRun={onOpenRun} />
              ))}
            </div>
          )}
        </section>

        <aside className="au-dash-impact">
          <div className="au-dash-impact-head">
            <div>
              <h2>Impact</h2>
              <span className="au-dash-impact-sub">Last {stats.window_days} days</span>
            </div>
            <Rocket size={17} className="au-dash-impact-head-icon" />
          </div>
          <div className="au-dash-impact-tiles">
            <div className="au-dash-impact-tile">
              <span className="au-dash-impact-tile-label">Tasks automated</span>
              <span className="au-dash-impact-tile-value">{stats.completed_window.toLocaleString()}</span>
              <span className="au-dash-impact-tile-caption">Completed runs</span>
            </div>
            <div className="au-dash-impact-tile">
              <span className="au-dash-impact-tile-label">Failure rate</span>
              <span className="au-dash-impact-tile-value">
                {stats.failure_rate_percent != null ? `${stats.failure_rate_percent.toFixed(1)}%` : '—'}
              </span>
              <span className="au-dash-impact-tile-caption">{stats.failure_rate_percent != null ? `${stats.failed_window} failed` : 'No data yet'}</span>
            </div>
          </div>
        </aside>
      </div>

      <section className="au-dash-card">
        <header className="au-dash-card-head">
          <div>
            <h2>Recent activity</h2>
            <span className="au-dash-impact-sub">Recent executions across every project</span>
          </div>
        </header>
        {activity.length === 0 ? (
          <EmptyState icon={<ChartHistogram size={18} />} text="No executions yet." />
        ) : (
          <div className="au-dash-table-wrap">
            <table className="au-dash-table">
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Status</th>
                  <th>Duration</th>
                  <th>When</th>
                  <th aria-label="Action" />
                </tr>
              </thead>
              <tbody>
                {activity.map((run) => <ActivityRow key={run.run_id} run={run} onOpenRun={onOpenRun} />)}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

function KpiCard({ icon, label, value, secondary, footText, trend }: {
  icon: React.ReactNode
  label: string
  value: number | string
  secondary?: string
  footText: string
  trend?: 'up'
}) {
  return (
    <div className="au-dash-kpi">
      <div className="au-dash-kpi-top">
        <span className="au-dash-kpi-label">{label}</span>
        <div className="au-dash-kpi-icon">{icon}</div>
      </div>
      <div className="au-dash-kpi-value-row">
        <span className="au-dash-kpi-value">{typeof value === 'number' ? value.toLocaleString() : value}</span>
        {secondary && <span className="au-dash-kpi-secondary">{secondary}</span>}
      </div>
      <div className={`au-dash-kpi-foot ${trend ? 'au-dash-kpi-foot--up' : ''}`}>
        {trend === 'up' && <TrendingUp size={12} />}
        <span>{footText}</span>
      </div>
    </div>
  )
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="au-dash-empty">
      <span className="au-dash-empty-icon">{icon}</span>
      {text}
    </div>
  )
}

function AttentionRow({ item, onOpenJob, onOpenRun }: {
  item: AttentionItem
  onOpenJob: (jobId: string) => void
  onOpenRun: (jobId: string, runId: string) => void
}) {
  const open = () => (item.last_run_id ? onOpenRun(item.job_id, item.last_run_id) : onOpenJob(item.job_id))
  return (
    <div className="au-dash-alert">
      <div className="au-dash-alert-top">
        <span className="au-dash-kind-pill">Repeated failures</span>
        <span className="au-dash-alert-title">{item.job_name}</span>
        <span className="au-dash-alert-time">{formatRelativeTime(item.detected_at)}</span>
      </div>
      <p className="au-dash-alert-message">{item.message}</p>
      <div className="au-dash-alert-foot">
        <span className="au-dash-alert-meta">Job {item.job_id}</span>
        <button type="button" className="au-dash-alert-btn" onClick={open}>
          Inspect execution <Right size={12} />
        </button>
      </div>
    </div>
  )
}

function ActivityRow({ run, onOpenRun }: { run: RecentActivityItem; onOpenRun: (jobId: string, runId: string) => void }) {
  return (
    <tr>
      <td>
        <div className="au-dash-table-name">{run.job_name}</div>
        <div className="au-dash-table-id">{run.run_id}</div>
      </td>
      <td>
        <span className={`au-overview-badge au-overview-badge--${run.status}`}>
          <span className="au-dash-status-dot" />
          {RUN_STATUS_LABEL[run.status]}
        </span>
      </td>
      <td className="au-dash-table-muted">{formatDuration(run.started_at, run.finished_at)}</td>
      <td className="au-dash-table-muted">{formatRelativeTime(run.queued_at)}</td>
      <td className="au-dash-table-action">
        <button type="button" className="au-dash-table-link" onClick={() => onOpenRun(run.job_id, run.run_id)}>
          View run <Right size={11} />
        </button>
      </td>
    </tr>
  )
}

function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return '—'
  const diffMs = Date.now() - then
  const minutes = Math.round(diffMs / 60000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.round(hours / 24)
  return `${days} d ago`
}

function formatDuration(startedAt?: string, finishedAt?: string): string {
  if (!startedAt || !finishedAt) return '—'
  const ms = new Date(finishedAt).getTime() - new Date(startedAt).getTime()
  if (!Number.isFinite(ms) || ms < 0) return '—'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

const OVERVIEW_DASH_CSS = `
.au-dash {
  height: 100%;
  overflow-y: auto;
  padding: 24px 28px 32px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.au-dash-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
}

.au-dash-eyebrow {
  font-size: var(--font-size-2xs);
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-primary);
}

.au-dash-header h1 {
  margin: 2px 0 0;
  font-size: var(--font-size-3xl);
  font-weight: 700;
  color: var(--color-text);
  letter-spacing: -0.01em;
}

.au-dash-subtitle {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.au-dash-kpis {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.au-dash-kpi {
  display: flex;
  flex-direction: column;
  padding: 18px 20px;
  border-radius: var(--radius-2xl);
  background: var(--color-surface);
  box-shadow: var(--shadow-medium);
  transition: box-shadow 0.15s ease, transform 0.15s ease;
}

.au-dash-kpi:hover {
  box-shadow: var(--shadow-large);
  transform: translateY(-1px);
}

.au-dash-kpi-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.au-dash-kpi-label {
  font-size: var(--font-size-2xs);
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--color-text-secondary);
}

.au-dash-kpi-icon {
  flex-shrink: 0;
  width: 42px;
  height: 42px;
  border-radius: var(--radius-lg);
  background: var(--color-text);
  color: var(--color-surface);
  box-shadow: var(--shadow-soft);
  display: flex;
  align-items: center;
  justify-content: center;
}

.au-dash-kpi-value-row {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin-top: 8px;
}

.au-dash-kpi-value {
  font-size: var(--font-size-3xl);
  font-weight: 700;
  color: var(--color-text);
  line-height: 1.1;
}

.au-dash-kpi-secondary {
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
}

.au-dash-kpi-foot {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--color-border-subtle);
  font-size: var(--font-size-2xs);
  font-weight: 600;
  color: var(--color-text-muted);
}

.au-dash-kpi-foot--up {
  color: var(--color-success);
}

/* Attention and Impact share one fixed row height (420px, roughly 4 alert
   rows before scrolling) instead of each sizing to its own content - a
   handful of alerts must not make the page taller than Impact's fixed,
   compact content, and a long streak of alerts must scroll inside its own
   card rather than push the rest of the page down indefinitely. */
.au-dash-columns {
  display: grid;
  grid-template-columns: 1.4fr 1fr;
  gap: 16px;
  height: 420px;
}

.au-dash-columns > .au-dash-card,
.au-dash-columns > .au-dash-impact {
  height: 100%;
  min-height: 0;
}

.au-dash-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 20px 22px;
  border-radius: var(--radius-2xl);
  background: var(--color-surface);
  box-shadow: var(--shadow-medium);
}

.au-dash-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.au-dash-card-head-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.au-dash-card-head h2 {
  margin: 0;
  font-size: var(--font-size-md);
  font-weight: 700;
  color: var(--color-text);
}

.au-dash-impact-sub {
  font-size: var(--font-size-2xs);
  color: var(--color-text-muted);
}

.au-dash-pulse-dot {
  width: 8px;
  height: 8px;
  border-radius: var(--radius-full);
  background: var(--color-error);
}

.au-dash-count-pill {
  padding: 3px 10px;
  border-radius: var(--radius-full);
  background: rgba(var(--color-error-rgb), 0.12);
  color: var(--color-error);
  font-size: var(--font-size-2xs);
  font-weight: 700;
  white-space: nowrap;
}

.au-dash-empty {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px;
  border-radius: var(--radius-md);
  background: var(--color-surface-elevated);
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

.au-dash-empty-icon {
  display: inline-flex;
  color: var(--color-success);
}

.au-dash-alerts {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.au-dash-alert {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 14px;
  border-radius: var(--radius-md);
  background: var(--color-surface-elevated);
}

.au-dash-alert-top {
  display: flex;
  align-items: center;
  gap: 8px;
}

.au-dash-kind-pill {
  flex-shrink: 0;
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  background: rgba(var(--color-error-rgb), 0.12);
  color: var(--color-error);
  font-size: var(--font-size-2xs);
  font-weight: 700;
}

.au-dash-alert-title {
  flex: 1;
  min-width: 0;
  font-size: var(--font-size-sm);
  font-weight: 700;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.au-dash-alert-time {
  flex-shrink: 0;
  font-size: var(--font-size-2xs);
  color: var(--color-text-muted);
}

.au-dash-alert-message {
  margin: 0;
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
}

.au-dash-alert-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 2px;
}

.au-dash-alert-meta {
  font-size: var(--font-size-2xs);
  color: var(--color-text-muted);
}

.au-dash-alert-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 10px;
  border: none;
  border-radius: var(--radius-sm);
  background: var(--color-primary);
  color: white;
  font-size: var(--font-size-2xs);
  font-weight: 700;
  cursor: pointer;
}

.au-dash-alert-btn:hover {
  background: var(--color-primary-hover);
}

.au-dash-impact {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 20px 22px;
  border-radius: var(--radius-2xl);
  background: var(--color-surface);
  box-shadow: var(--shadow-medium);
}

.au-dash-impact-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}

.au-dash-impact-head h2 {
  margin: 0;
  font-size: var(--font-size-md);
  font-weight: 700;
  color: var(--color-text);
}

.au-dash-impact-head-icon {
  color: var(--color-primary);
}

.au-dash-impact-tiles {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.au-dash-impact-tile {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 12px 14px;
  border-radius: var(--radius-md);
  background: var(--color-surface-elevated);
}

.au-dash-impact-tile-label {
  font-size: var(--font-size-2xs);
  font-weight: 600;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: var(--color-text-secondary);
}

.au-dash-impact-tile-value {
  font-size: var(--font-size-xl);
  font-weight: 700;
  color: var(--color-text);
  margin-top: 2px;
}

.au-dash-impact-tile-caption {
  font-size: var(--font-size-2xs);
  color: var(--color-text-muted);
}

/* Capped the same way as Attention/Impact (see .au-dash-columns) - roughly
   7 rows before it scrolls internally, so a busy org's activity feed can't
   push the rest of the page down indefinitely either. */
.au-dash-table-wrap {
  max-height: 380px;
  overflow-y: auto;
  overflow-x: auto;
}

.au-dash-table {
  width: 100%;
  border-collapse: collapse;
}

.au-dash-table thead th {
  position: sticky;
  top: 0;
  padding: 8px 12px;
  text-align: left;
  font-size: var(--font-size-2xs);
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--color-text-muted);
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border-subtle);
}

.au-dash-table tbody td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--color-border-subtle);
  font-size: var(--font-size-xs);
  vertical-align: middle;
}

.au-dash-table tbody tr:hover {
  background: var(--color-surface-elevated);
}

.au-dash-table tbody tr:last-child td {
  border-bottom: none;
}

.au-dash-table-name {
  font-size: var(--font-size-sm);
  font-weight: 700;
  color: var(--color-text);
}

.au-dash-table-id {
  font-size: var(--font-size-2xs);
  color: var(--color-text-muted);
}

.au-dash-table-muted {
  color: var(--color-text-secondary);
}

.au-dash-table-action {
  text-align: right;
}

.au-dash-table-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: none;
  background: transparent;
  color: var(--color-primary);
  font-size: var(--font-size-2xs);
  font-weight: 700;
  cursor: pointer;
}

.au-dash-status-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: var(--radius-full);
  background: currentColor;
  margin-right: 4px;
}

@media (max-width: 900px) {
  .au-dash-columns {
    grid-template-columns: minmax(0, 1fr);
  }
}
`
