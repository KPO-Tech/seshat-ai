import { useMemo, useState, type CSSProperties } from 'react'
import { Connection, Copy, Delete as DeleteIcon, Edit as EditIcon, LoadingOne, PauseOne, Play, Plus, Right, Search } from '@icon-park/react'
import type { AutomationJob as Job } from '../api/types'
import { RUN_STATUS_LABEL } from '../graph/types'

// A small, stable "tone" per project - cycles through existing brand/
// semantic tokens keyed off the project's first tag (or its id, if
// untagged) so the same project always gets the same color, without a
// real per-department color concept (no such field exists on a job).
// Purely a categorization aid, not data - mirrors the folder pills' own
// "one tag ~= one department" approximation.
const TONES = ['var(--color-primary)', 'var(--color-accent)', 'var(--color-info)', 'var(--color-success)', 'var(--color-warning)']
function toneFor(key: string): string {
  let hash = 0
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0
  return TONES[hash % TONES.length]
}

// A project's at-a-glance state - always exactly one, same idea as the
// mockup's ever-present "Active Routine"/"Needs Reconnect" pill, but
// derived only from real fields (job.status, last_run_status) rather than
// invented alert types (no "approvals waiting"/"needs reconnect" concept
// exists in this engine).
function deriveState(job: Job): { label: string; color: string } {
  if (job.status === 'paused') return { label: 'Paused', color: 'var(--color-text-muted)' }
  if (job.last_run_status === 'failed') return { label: 'Failing', color: 'var(--color-error)' }
  return { label: 'Active', color: 'var(--color-success)' }
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return '—'
  const minutes = Math.round((Date.now() - then) / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
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
// sort control, tag-pill "folders", and Duplicate. A later pass (this one)
// took further structural cues from the Stitch mockup under docs/produits/
// platforms/automation/design/ - a colored accent bar + icon tile, an
// always-present state pill, and a labeled footer grid - but deliberately
// left out everything in that mockup we have no real data for (a run
// count/success-rate sparkline, an owner/team chip): see overview.go's own
// scope notes for why per-job success rate isn't invented here either.
// The folder pills are a deliberately reduced stand-in for §7's real
// folder tree: one free-text tag (added in an earlier "Tier 3.4" pass)
// isn't the same as a single-parent hierarchical folder, and there's no
// rename-independent-of-jobs - "moving" a job to a folder here just means
// editing its tags in the job's own settings drawer, which already works.
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
        jobs.length === 0 ? (
          <div className="au-stub au-stub--inline">
            <h2>No automations yet</h2>
            <p>Build a visual graph workflow - connectors, branching logic, database steps - and it'll show up here.</p>
            <button type="button" className="au-save-btn au-empty-action" onClick={onNew}>
              <Plus size={14} /> New automation
            </button>
          </div>
        ) : (
          <div className="au-stub au-stub--inline">
            <h2>No matches</h2>
            <p>Try a different search or folder.</p>
          </div>
        )
      ) : (
        <div className="au-project-cards">
          {filtered.map((job) => {
            const tone = toneFor(job.tags?.[0] ?? job.id)
            const state = deriveState(job)
            const [primaryTag, ...restTags] = job.tags ?? []
            return (
              <div
                key={job.id}
                className="au-project-card"
                style={{ '--tone': tone } as CSSProperties}
                onClick={() => onOpen(job.id)}
                role="button"
                tabIndex={0}
              >
                <span className="au-project-card-accent" />
                <div className="au-project-card-icon"><Connection size={19} /></div>
                <div className="au-overview-main">
                  <div className="au-overview-name-row">
                    <span className="au-overview-name">{job.name}</span>
                    {primaryTag && <span className="au-overview-badge au-overview-badge--tag">{primaryTag}</span>}
                    <span className="au-project-state-pill" style={{ color: state.color }}>
                      <span className="au-dash-status-dot" />
                      {state.label}
                    </span>
                    <span className="au-overview-badge au-overview-badge--target">{job.execution_target}</span>
                  </div>
                  {job.description && <div className="au-overview-desc">{job.description}</div>}
                  {restTags.length > 0 && (
                    <div className="au-overview-tags">
                      {restTags.map((t) => <span key={t} className="au-overview-badge au-overview-badge--tag">{t}</span>)}
                    </div>
                  )}
                  <div className="au-project-card-grid">
                    <div className="au-project-card-grid-col">
                      <span className="au-project-card-grid-label">Trigger</span>
                      <span>{describeTrigger(job)}</span>
                    </div>
                    <div className="au-project-card-grid-col">
                      <span className="au-project-card-grid-label">Last run</span>
                      {job.last_run_status ? (
                        <span style={{ color: RUN_STATUS_COLOR[job.last_run_status] ?? 'var(--color-text-muted)' }}>
                          <span className="au-dash-status-dot" />
                          {RUN_STATUS_LABEL[job.last_run_status] ?? job.last_run_status}
                          {job.last_run_at && ` · ${formatRelative(job.last_run_at)}`}
                        </span>
                      ) : <span>Never run</span>}
                    </div>
                    <div className="au-project-card-grid-col">
                      <span className="au-project-card-grid-label">{job.next_run_at ? 'Next run' : 'Modified'}</span>
                      <span>{job.next_run_at ? new Date(job.next_run_at).toLocaleString() : (job.updated_at ? formatRelative(job.updated_at) : '—')}</span>
                    </div>
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
                  <button type="button" className="au-project-card-open" onClick={(e) => { e.stopPropagation(); onOpen(job.id) }}>
                    <EditIcon size={13} /> Open <Right size={12} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// Text-only color for the "last run" grid cell (no pill background -
// unlike the shared .au-overview-badge--* pills, this sits inline in a
// labeled grid cell, so only the hue is reused, not the tinted background
// that comes bundled with those classes).
const RUN_STATUS_COLOR: Record<string, string> = {
  completed: 'var(--color-success)',
  failed: 'var(--color-error)',
  running: 'var(--color-accent)',
  claimed: 'var(--color-accent)',
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

/* .au-stub is normally a full-page takeover (height:100%, no card) - here
   it sits inline below the page header/search/pills instead of replacing
   them, so a "no jobs yet" or "no matches" account still shows a working
   search bar and New automation button, ready for the moment a job does
   exist, rather than a completely different blank-slate page. */
.au-stub--inline {
  height: auto;
  margin-top: 8px;
  padding: 48px 24px;
  border-radius: var(--radius-2xl);
  background: var(--color-surface-elevated);
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
   medium on hover, same idea as .au-dash-kpi but tuned for repetition.
   position:relative + overflow:hidden lets the accent bar below sit flush
   against the card's own rounded corners. --tone is set inline per card
   (see toneFor) and consumed by both the accent bar and the icon tile. */
.au-project-card {
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 16px 18px 16px 22px;
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

.au-project-card-accent {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  background: var(--tone);
}

.au-project-card-icon {
  flex-shrink: 0;
  width: 38px;
  height: 38px;
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--tone) 14%, transparent);
  color: var(--tone);
  display: flex;
  align-items: center;
  justify-content: center;
}

.au-overview-main {
  flex: 1;
  min-width: 0;
}

.au-project-state-pill {
  display: inline-flex;
  align-items: center;
  font-size: var(--font-size-2xs);
  font-weight: 700;
}

.au-project-card-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  margin-top: 12px;
  padding: 10px 12px;
  border-radius: var(--radius-md);
  background: var(--color-surface-elevated);
}

.au-project-card-grid-col {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  font-size: var(--font-size-2xs);
  color: var(--color-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.au-project-card-grid-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}

.au-project-card-open {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 10px;
  border: none;
  border-radius: var(--radius-sm);
  background: var(--color-text);
  color: var(--color-surface);
  font-size: var(--font-size-2xs);
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
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
