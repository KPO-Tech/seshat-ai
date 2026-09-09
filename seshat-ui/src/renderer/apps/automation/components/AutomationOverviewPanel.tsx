import { useEffect, useState } from 'react'
import { Attention, Plus } from '@icon-park/react'
import { api, ApiError } from '@/api/client'
import { RUN_STATUS_LABEL } from '../graph/types'
import type { Overview, AttentionItem, RecentActivityItem } from '../api/overview'

// Automation's real "Overview" (Phase 1 of docs/produits/platforms/
// automation/automation-app-pages.md's rollout, §6) - a KPI/attention/
// activity dashboard, not the job list (that's AutomationProjectsPanel now).
// Every number here is backed by a real query on seshat-server
// (automation.Service.GetOverview) - no fabricated "time saved"/ROI figure,
// since no such concept exists in the backend yet (see overview.go's own
// doc comments on what's deliberately out of scope this phase).
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

      <div className="au-dash-kpis">
        <KpiCard
          label="Active Projects"
          value={stats.active_projects}
          hint={stats.new_projects_this_month > 0 ? `+${stats.new_projects_this_month} this month` : undefined}
        />
        <KpiCard label="Executions" value={stats.executions_window} hint={`Last ${stats.window_days} days`} />
        <KpiCard
          label="Success Rate"
          value={stats.success_rate_percent != null ? `${stats.success_rate_percent.toFixed(1)}%` : '—'}
          hint={stats.success_rate_percent != null ? undefined : 'No finished runs yet'}
        />
      </div>

      <section className="au-dash-section">
        <header className="au-dash-section-head">
          <Attention size={14} />
          <h3>Attention required</h3>
        </header>
        {attention.length === 0 ? (
          <div className="au-dash-empty">Nothing needs attention right now.</div>
        ) : (
          attention.map((item) => <AttentionRow key={`${item.kind}-${item.job_id}`} item={item} onOpenJob={onOpenJob} onOpenRun={onOpenRun} />)
        )}
      </section>

      <section className="au-dash-section">
        <header className="au-dash-section-head">
          <h3>Recent activity</h3>
        </header>
        {activity.length === 0 ? (
          <div className="au-dash-empty">No executions yet.</div>
        ) : (
          activity.map((run) => <ActivityRow key={run.run_id} run={run} onOpenRun={onOpenRun} />)
        )}
      </section>

      <section className="au-dash-impact">
        <span className="au-dash-impact-label">Last {stats.window_days} days</span>
        <span>{stats.completed_window.toLocaleString()} tasks automated</span>
        {stats.failure_rate_percent != null && <span>{stats.failure_rate_percent.toFixed(1)}% failure rate</span>}
      </section>

      <button type="button" className="au-save-btn au-dash-new-btn" onClick={onNew}>
        <Plus size={14} /> New Project
      </button>
    </div>
  )
}

function KpiCard({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="au-dash-kpi">
      <span className="au-dash-kpi-label">{label}</span>
      <span className="au-dash-kpi-value">{typeof value === 'number' ? value.toLocaleString() : value}</span>
      {hint && <span className="au-dash-kpi-hint">{hint}</span>}
    </div>
  )
}

function AttentionRow({ item, onOpenJob, onOpenRun }: {
  item: AttentionItem
  onOpenJob: (jobId: string) => void
  onOpenRun: (jobId: string, runId: string) => void
}) {
  return (
    <div
      className="au-dash-row au-dash-row--attention"
      onClick={() => (item.last_run_id ? onOpenRun(item.job_id, item.last_run_id) : onOpenJob(item.job_id))}
      role="button"
      tabIndex={0}
    >
      <div className="au-dash-row-main">
        <span className="au-overview-name">{item.job_name}</span>
        <span className="au-dash-row-detail">{item.message}</span>
      </div>
      <span className="au-dash-row-action">View execution →</span>
    </div>
  )
}

function ActivityRow({ run, onOpenRun }: { run: RecentActivityItem; onOpenRun: (jobId: string, runId: string) => void }) {
  return (
    <div className="au-dash-row" onClick={() => onOpenRun(run.job_id, run.run_id)} role="button" tabIndex={0}>
      <div className="au-dash-row-main">
        <span className={`au-overview-badge au-overview-badge--${run.status}`}>{RUN_STATUS_LABEL[run.status]}</span>
        <span className="au-overview-name">{run.job_name}</span>
      </div>
      <span className="au-dash-row-detail">{new Date(run.queued_at).toLocaleString()}</span>
    </div>
  )
}

const OVERVIEW_DASH_CSS = `
.au-dash {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.au-dash-kpis {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.au-dash-kpi {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 14px 16px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
}

.au-dash-kpi-label {
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
}

.au-dash-kpi-value {
  font-size: var(--font-size-3xl);
  font-weight: 600;
  color: var(--color-text);
}

.au-dash-kpi-hint {
  font-size: var(--font-size-2xs);
  color: var(--color-text-muted);
}

.au-dash-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.au-dash-section-head {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--color-text-secondary);
}

.au-dash-section-head h3 {
  margin: 0;
  font-size: var(--font-size-sm);
  font-weight: 600;
}

.au-dash-empty {
  padding: 14px 16px;
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

.au-dash-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  cursor: pointer;
}

.au-dash-row + .au-dash-row {
  margin-top: 6px;
}

.au-dash-row:hover {
  background: var(--color-surface-elevated);
}

.au-dash-row--attention {
  border-color: rgba(255, 107, 107, 0.3);
}

.au-dash-row-main {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.au-dash-row-detail {
  flex-shrink: 0;
  font-size: var(--font-size-2xs);
  color: var(--color-text-muted);
}

.au-dash-row-action {
  flex-shrink: 0;
  font-size: var(--font-size-2xs);
  color: var(--color-primary);
}

.au-dash-impact {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 12px;
  border-radius: var(--radius-md);
  background: var(--color-surface-elevated);
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
}

.au-dash-impact-label {
  font-weight: 600;
  color: var(--color-text);
}

.au-dash-new-btn {
  align-self: flex-start;
}
`
