import { Delete as DeleteIcon, Edit as EditIcon, LoadingOne, PauseOne, Play, Plus } from '@icon-park/react'
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
      {jobs.map((job) => (
        <div key={job.id} className="au-overview-row" onClick={() => onOpen(job.id)} role="button" tabIndex={0}>
          <div className="au-overview-main">
            <div className="au-overview-name-row">
              <span className="au-overview-name">{job.name}</span>
              <span className={`au-overview-badge au-overview-badge--${job.status}`}>{job.status}</span>
              <span className="au-overview-badge au-overview-badge--target">{job.execution_target}</span>
            </div>
            {job.description && <div className="au-overview-desc">{job.description}</div>}
            <div className="au-overview-meta">
              <span>{describeTrigger(job)}</span>
              {job.next_run_at && <span>next: {new Date(job.next_run_at).toLocaleString()}</span>}
              {job.last_run_status && <span>last: {RUN_STATUS_LABEL[job.last_run_status] ?? job.last_run_status}</span>}
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
      ))}
    </div>
  )
}
