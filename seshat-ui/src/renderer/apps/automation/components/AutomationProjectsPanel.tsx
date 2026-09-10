import { useMemo, useState } from 'react'
import { Copy, Delete as DeleteIcon, Edit as EditIcon, LoadingOne, PauseOne, Play, Plus, Search } from '@icon-park/react'
import type { AutomationJob as Job } from '../api/types'
import { RUN_STATUS_LABEL } from '../graph/types'

// Text-only color for the footer's last-run indicator (no pill background -
// unlike the shared .au-overview-badge--* pills, this sits inline among
// plain muted meta text, so only the hue is reused, not the tinted
// background that comes bundled with those classes).
const RUN_STATUS_COLOR: Record<string, string> = {
  completed: 'var(--color-success)',
  failed: 'var(--color-error)',
  running: 'var(--color-accent)',
  claimed: 'var(--color-accent)',
}

function describeTrigger(job: Job): string {
  switch (job.trigger_type) {
    case 'cron': return job.cron_expr ? `cron ${job.cron_expr}` : 'cron'
    case 'interval': return job.interval_seconds ? `every ${job.interval_seconds}s` : 'interval'
    case 'once': return job.run_at ? `once at ${new Date(job.run_at).toLocaleString()}` : 'once'
    default: return job.trigger_type
  }
}

type SortKey = 'name' | 'updated' | 'last_run'

const UNTAGGED = '__untagged__'

// The Projects list - split out from Overview (Phase 1 of
// docs/produits/platforms/automation/automation-app-pages.md's rollout) so
// Overview could become the real KPI/attention/activity dashboard the spec
// describes without losing the only existing way to browse/search/filter/
// run/pause/delete jobs. Filtering here is still entirely client-side over
// the jobs already fetched by AutomationPage - same weight as
// TemplatesPanel's own filtering, no new backend calls.
//
// Phase 2 adds: a card layout matching Overview's visual language (same
// tokens - radius-2xl, no border, lift-on-hover shadow - not a new one), a
// sort control, tag-pill "folders", and Duplicate. The pills are a
// deliberately reduced stand-in for §7's real folder tree: one free-text
// tag (added in an earlier "Tier 3.4" pass) isn't the same as a single-
// parent hierarchical folder, and there's no rename-independent-of-jobs -
// "moving" a job to a folder here just means editing its tags in the job's
// own settings drawer, which already works. A real folder concept is a
// later phase, not faked here.
export function AutomationProjectsPanel({
  jobs, loading, error, onOpen, onNew, onRun, onTogglePaused, onDelete, onDuplicate,
  runningJobId, pausingJobId, deletingJobId, duplicatingJobId,
}: {
  jobs: Job[]
  loading: boolean
  error: string | null
  onOpen: (id: string) => void
  onNew: () => void
  onRun: (job: Job) => void
  onTogglePaused: (job: Job) => void
  onDelete: (job: Job) => void
  onDuplicate: (job: Job) => void
  runningJobId: string | null
  pausingJobId: string | null
  deletingJobId: string | null
  duplicatingJobId: string | null
}) {
  const [search, setSearch] = useState('')
  const [folder, setFolder] = useState('')
  const [sort, setSort] = useState<SortKey>('updated')

  const folders = useMemo(() => {
    const counts = new Map<string, number>()
    let untagged = 0
    for (const j of jobs) {
      if (!j.tags?.length) { untagged++; continue }
      for (const t of j.tags) counts.set(t, (counts.get(t) ?? 0) + 1)
    }
    return {
      untagged,
      tags: [...counts.entries()].sort(([a], [b]) => a.localeCompare(b)),
    }
  }, [jobs])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const bySearchAndFolder = jobs.filter((j) => {
      const matchesFolder = !folder
        || (folder === UNTAGGED ? !j.tags?.length : (j.tags ?? []).includes(folder))
      const matchesSearch = !q || j.name.toLowerCase().includes(q) || (j.description ?? '').toLowerCase().includes(q) || (j.tags ?? []).some((t) => t.toLowerCase().includes(q))
      return matchesFolder && matchesSearch
    })
    const sorted = [...bySearchAndFolder]
    switch (sort) {
      case 'name':
        sorted.sort((a, b) => a.name.localeCompare(b.name))
        break
      case 'last_run':
        sorted.sort((a, b) => new Date(b.last_run_at ?? 0).getTime() - new Date(a.last_run_at ?? 0).getTime())
        break
      case 'updated':
      default:
        sorted.sort((a, b) => new Date(b.updated_at ?? 0).getTime() - new Date(a.updated_at ?? 0).getTime())
    }
    return sorted
  }, [jobs, search, folder, sort])

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
      <div className="au-overview-page-head">
        <div>
          <h1>Projects</h1>
          <p>Browse, search, and manage every automation.</p>
        </div>
        <button type="button" className="au-save-btn" onClick={onNew}>
          <Plus size={14} /> New automation
        </button>
      </div>

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
        <select className="au-overview-sort-select" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
          <option value="updated">Last modified</option>
          <option value="name">Name A–Z</option>
          <option value="last_run">Last run</option>
        </select>
      </div>

      {(folders.tags.length > 0 || folders.untagged > 0) && (
        <div className="au-folder-pills">
          <button type="button" className={`au-folder-pill ${folder === '' ? 'active' : ''}`} onClick={() => setFolder('')}>
            All <span className="au-folder-pill-count">{jobs.length}</span>
          </button>
          {folders.tags.map(([t, count]) => (
            <button type="button" key={t} className={`au-folder-pill ${folder === t ? 'active' : ''}`} onClick={() => setFolder(t)}>
              {t} <span className="au-folder-pill-count">{count}</span>
            </button>
          ))}
          {folders.untagged > 0 && (
            <button type="button" className={`au-folder-pill ${folder === UNTAGGED ? 'active' : ''}`} onClick={() => setFolder(UNTAGGED)}>
              Untagged <span className="au-folder-pill-count">{folders.untagged}</span>
            </button>
          )}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="au-stub">
          <h2>No matches</h2>
          <p>Try a different search or folder.</p>
        </div>
      ) : (
        <div className="au-project-cards">
          {filtered.map((job) => (
            <div key={job.id} className="au-project-card" onClick={() => onOpen(job.id)} role="button" tabIndex={0}>
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
                <div className="au-project-card-foot">
                  <span>{describeTrigger(job)}</span>
                  {job.next_run_at && <span>next: {new Date(job.next_run_at).toLocaleString()}</span>}
                  {job.last_run_status && (
                    <span className="au-project-card-foot-run" style={{ color: RUN_STATUS_COLOR[job.last_run_status] ?? 'var(--color-text-muted)' }}>
                      <span className="au-dash-status-dot" />
                      {RUN_STATUS_LABEL[job.last_run_status] ?? job.last_run_status}
                    </span>
                  )}
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
                  type="button" className="au-icon-btn" title="Duplicate"
                  onClick={(e) => { e.stopPropagation(); onDuplicate(job) }}
                  disabled={duplicatingJobId === job.id}
                >
                  {duplicatingJobId === job.id ? <LoadingOne size={13} className="spin" /> : <Copy size={13} />}
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
          ))}
        </div>
      )}
    </div>
  )
}

const OVERVIEW_FILTER_CSS = `
.au-overview-page-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 6px;
}

.au-overview-page-head h1 {
  margin: 0;
  font-size: var(--font-size-3xl);
  font-weight: 700;
  color: var(--color-text);
  letter-spacing: -0.01em;
}

.au-overview-page-head p {
  margin: 4px 0 0;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

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

.au-overview-sort-select {
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

.au-folder-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 4px;
}

.au-folder-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 12px;
  border: none;
  border-radius: var(--radius-full);
  background: var(--color-surface-elevated);
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
  font-weight: 600;
  cursor: pointer;
}

.au-folder-pill:hover {
  color: var(--color-text);
}

.au-folder-pill.active {
  background: var(--color-primary);
  color: white;
}

.au-folder-pill-count {
  font-size: var(--font-size-2xs);
  opacity: 0.75;
}

.au-project-cards {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* Same visual vocabulary Overview's dashboard cards already established -
   radius-2xl, no border, lift-on-hover - applied here as its own class so
   RunsPanel/VariablesPanel, which still share the plain .au-overview-row
   look, are unaffected. Resting shadow is soft rather than Overview's
   medium: Overview has a handful of standalone panel cards, but this is a
   repeated list row - a strong shadow on every single one would look
   heavy stacked many times over, so it starts soft and only lifts to
   medium on hover, same idea as .au-dash-kpi but tuned for repetition. */
.au-project-card {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  padding: 16px 18px;
  border-radius: var(--radius-2xl);
  background: var(--color-surface);
  box-shadow: var(--shadow-soft);
  cursor: pointer;
  transition: box-shadow 0.15s ease, transform 0.15s ease;
}

.au-project-card:hover {
  box-shadow: var(--shadow-medium);
  transform: translateY(-1px);
}

.au-project-card-foot {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--color-border-subtle);
  font-size: var(--font-size-2xs);
  color: var(--color-text-muted);
}

.au-project-card-foot-run {
  display: inline-flex;
  align-items: center;
}

.au-dash-status-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: var(--radius-full);
  background: currentColor;
  margin-right: 4px;
}
`
