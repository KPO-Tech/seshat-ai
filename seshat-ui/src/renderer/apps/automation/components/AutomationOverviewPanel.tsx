import { useMemo, useState } from 'react'
import { Delete as DeleteIcon, Edit as EditIcon, LoadingOne, PauseOne, Play, Plus, Search } from '@icon-park/react'
import type { AutomationJob as Job } from '../api/types'
import { RUN_STATUS_LABEL } from '../graph/types'

function describeTrigger(job: Job): string {
  switch (job.trigger_type) {
    case 'cron': return job.cron_expr ? `cron ${job.cron_expr}` : 'cron'
    case 'interval': return job.interval_seconds ? `every ${job.interval_seconds}s` : 'interval'
    case 'once': return job.run_at ? `once at ${new Date(job.run_at).toLocaleString()}` : 'once'
    default: return job.trigger_type
  }
}

// Tier 3.4 - a bridge toward the "Project" reorganization
// (docs/produits/platforms/automation/automation-app-pages.md) without
// introducing that concept yet: free-text tags + search over today's still-
// flat list, entirely client-side over the jobs already fetched by
// AutomationPage - same weight as TemplatesPanel's own filtering, no new
// backend calls.
export function AutomationOverviewPanel({
  jobs, loading, error, onOpen, onNew, onRun, onTogglePaused, onDelete,
  runningJobId, pausingJobId, deletingJobId,
}: {
  jobs: Job[]
  loading: boolean
  error: string | null
  onOpen: (id: string) => void
  onNew: () => void
  onRun: (job: Job) => void
  onTogglePaused: (job: Job) => void
  onDelete: (job: Job) => void
  runningJobId: string | null
  pausingJobId: string | null
  deletingJobId: string | null
}) {
  const [search, setSearch] = useState('')
  const [tag, setTag] = useState('')

  const tags = useMemo(() => [...new Set(jobs.flatMap((j) => j.tags ?? []))].sort(), [jobs])
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return jobs.filter((j) =>
      (!tag || (j.tags ?? []).includes(tag))
      && (!q || j.name.toLowerCase().includes(q) || (j.description ?? '').toLowerCase().includes(q) || (j.tags ?? []).some((t) => t.toLowerCase().includes(q))),
    )
  }, [jobs, search, tag])

  if (loading) return <div className="au-loading">Loading...</div>
  if (error) return <div className="au-loading au-loading-error">{error}</div>

  if (jobs.length === 0) {
    return (
      <div className="au-stub">
        <h2>No automations yet</h2>
        <p>Build a visual graph workflow - connectors, branching logic, database steps - and it'll show up here.</p>
        <button type="button" className="au-save-btn au-empty-action" onClick={onNew}>
          <Plus size={14} /> New automation
        </button>
      </div>
    )
  }

  return (
    <div className="au-overview">
      <style>{OVERVIEW_FILTER_CSS}</style>
      <div className="au-overview-toolbar">
        <div className="au-overview-search-row">
          <Search size={14} className="au-overview-search-icon" />
          <input
            className="au-overview-search"
            placeholder="Search automations…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            spellCheck={false}
          />
        </div>
        {tags.length > 0 && (
          <select className="au-overview-tag-select" value={tag} onChange={(e) => setTag(e.target.value)}>
            <option value="">All tags</option>
            {tags.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="au-stub">
          <h2>No matches</h2>
          <p>Try a different search or tag.</p>
        </div>
      ) : (
        filtered.map((job) => (
          <div key={job.id} className="au-overview-row" onClick={() => onOpen(job.id)} role="button" tabIndex={0}>
            <div className="au-overview-main">
              <div className="au-overview-name-row">
                <span className="au-overview-name">{job.name}</span>
                <span className={`au-overview-badge au-overview-badge--${job.status}`}>{job.status}</span>
                <span className="au-overview-badge au-overview-badge--target">{job.execution_target}</span>
              </div>
              {job.description && <div className="au-overview-desc">{job.description}</div>}
              {!!job.tags?.length && (
                <div className="au-overview-tags">
                  {job.tags.map((t) => <span key={t} className="au-overview-badge au-overview-badge--tag">{t}</span>)}
                </div>
              )}
              <div className="au-overview-meta">
                <span>{describeTrigger(job)}</span>
                {job.next_run_at && <span>next: {new Date(job.next_run_at).toLocaleString()}</span>}
                {job.last_run_status && <span>last: {RUN_STATUS_LABEL[job.last_run_status] ?? job.last_run_status}</span>}
                {job.updated_at && <span>modified: {new Date(job.updated_at).toLocaleString()}</span>}
              </div>
            </div>
            <div className="au-overview-actions">
              <button
                type="button" className="au-icon-btn" title="Run now"
                onClick={(e) => { e.stopPropagation(); onRun(job) }}
                disabled={runningJobId === job.id}
              >
                {runningJobId === job.id ? <LoadingOne size={13} className="spin" /> : <Play size={13} />}
              </button>
              <button
                type="button" className="au-icon-btn" title={job.status === 'active' ? 'Pause' : 'Resume'}
                onClick={(e) => { e.stopPropagation(); onTogglePaused(job) }}
                disabled={pausingJobId === job.id}
              >
                {pausingJobId === job.id ? <LoadingOne size={13} className="spin" /> : <PauseOne size={13} />}
              </button>
              <button type="button" className="au-icon-btn" title="Edit" onClick={(e) => { e.stopPropagation(); onOpen(job.id) }}>
                <EditIcon size={13} />
              </button>
              <button
                type="button" className="au-icon-btn" title="Delete"
                onClick={(e) => { e.stopPropagation(); onDelete(job) }}
                disabled={deletingJobId === job.id}
              >
                {deletingJobId === job.id ? <LoadingOne size={13} className="spin" /> : <DeleteIcon size={13} />}
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  )
}

const OVERVIEW_FILTER_CSS = `
.au-overview-toolbar {
  display: flex;
  gap: 8px;
  margin-bottom: 4px;
}

.au-overview-search-row {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 0 10px;
  height: 32px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg);
}

.au-overview-search-icon { color: var(--color-text-muted); flex-shrink: 0; }

.au-overview-search {
  flex: 1;
  height: 100%;
  background: none;
  border: none;
  outline: none;
  color: var(--color-text);
  font-size: var(--font-size-xs);
}

.au-overview-tag-select {
  height: 32px;
  padding: 0 9px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-bg);
  color: var(--color-text);
  font-size: var(--font-size-xs);
}

.au-overview-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 2px;
}

.au-overview-badge--tag {
  background: var(--color-surface-elevated);
  color: var(--color-text-secondary);
}
`
