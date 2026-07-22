import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Left, Plus, Play, PauseOne, Edit, Delete, History, Caution, CloseOne, LinkCloud,
} from '@icon-park/react'
import { api, ApiError } from '@/api/client'

type JobStatus = 'active' | 'paused'
type TriggerType = 'cron' | 'interval' | 'once'
type ExecutionTarget = 'cloud' | 'device'
type RunStatus = 'queued' | 'claimed' | 'running' | 'completed' | 'failed' | 'cancelled'

type Job = {
  id: string
  name: string
  description?: string
  status: JobStatus
  trigger_type: TriggerType
  cron_expr?: string
  interval_seconds?: number
  run_at?: string
  next_run_at?: string
  last_run_at?: string
  last_run_status?: RunStatus
  execution_target: ExecutionTarget
  target_device_id?: string
  prompt: string
  model_override?: string
}

type JobParams = {
  name: string
  description?: string
  trigger_type: TriggerType
  cron_expr?: string
  interval_seconds?: number
  run_at?: string
  execution_target: ExecutionTarget
  target_device_id?: string
  prompt: string
  model_override?: string
}

type Run = {
  id: string
  status: RunStatus
  queued_at?: string
  started_at?: string
  finished_at?: string
  output_text?: string
  error_text?: string
}

type Device = { id: string; name: string; status: string }

type SystemStatus = { mode: 'standalone' | 'connected'; server_url?: string }

const RUN_STATUS_LABEL: Record<RunStatus, string> = {
  queued: 'Queued', claimed: 'Claimed', running: 'Running',
  completed: 'Completed', failed: 'Failed', cancelled: 'Cancelled',
}

function describeTrigger(job: Job): string {
  switch (job.trigger_type) {
    case 'cron': return job.cron_expr ? `cron ${job.cron_expr}` : 'cron'
    case 'interval': return job.interval_seconds ? `every ${job.interval_seconds}s` : 'interval'
    case 'once': return job.run_at ? `once at ${new Date(job.run_at).toLocaleString()}` : 'once'
    default: return job.trigger_type
  }
}

export function SchedulingPage() {
  const navigate = useNavigate()
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null)
  const [jobs, setJobs] = useState<Job[]>([])
  const [devices, setDevices] = useState<Device[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [forbidden, setForbidden] = useState(false)

  const [showForm, setShowForm] = useState(false)
  const [editingJob, setEditingJob] = useState<Job | null>(null)
  const [deletingJobId, setDeletingJobId] = useState<string | null>(null)
  const [runningJobId, setRunningJobId] = useState<string | null>(null)
  const [pausingJobId, setPausingJobId] = useState<string | null>(null)
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null)
  const [runsByJob, setRunsByJob] = useState<Record<string, Run[]>>({})

  const loadJobs = useCallback(async () => {
    try {
      const result = await api.get<{ jobs: Job[] }>('/automation/jobs')
      setJobs(result.jobs ?? [])
      setForbidden(false)
      setLoadError(null)
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setForbidden(true)
      } else {
        setLoadError(err instanceof ApiError ? err.message : 'Failed to load scheduled jobs.')
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    api.get<SystemStatus>('/system/status').then(setSystemStatus).catch(() => setSystemStatus(null))
    void loadJobs()
    api.get<{ devices: Device[] }>('/automation/devices').then((r) => setDevices(r.devices ?? [])).catch(() => {})
  }, [loadJobs])

  async function handleRunNow(job: Job) {
    setRunningJobId(job.id)
    setActionError(null)
    try {
      await api.post(`/automation/jobs/${job.id}/run`, {})
      await loadJobs()
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Failed to trigger this job.')
    } finally {
      setRunningJobId(null)
    }
  }

  async function handleTogglePaused(job: Job) {
    setPausingJobId(job.id)
    setActionError(null)
    try {
      const action = job.status === 'active' ? 'pause' : 'resume'
      await api.post(`/automation/jobs/${job.id}/${action}`, {})
      await loadJobs()
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Failed to update this job.')
    } finally {
      setPausingJobId(null)
    }
  }

  async function handleDelete(jobID: string) {
    setActionError(null)
    try {
      await api.delete(`/automation/jobs/${jobID}`)
      setDeletingJobId(null)
      await loadJobs()
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Failed to delete this job.')
    }
  }

  async function toggleRuns(job: Job) {
    if (expandedJobId === job.id) {
      setExpandedJobId(null)
      return
    }
    setExpandedJobId(job.id)
    if (!runsByJob[job.id]) {
      try {
        const result = await api.get<{ runs: Run[] }>(`/automation/jobs/${job.id}/runs`)
        setRunsByJob((current) => ({ ...current, [job.id]: result.runs ?? [] }))
      } catch {
        setRunsByJob((current) => ({ ...current, [job.id]: [] }))
      }
    }
  }

  function openCreateForm() {
    setEditingJob(null)
    setShowForm(true)
  }

  function openEditForm(job: Job) {
    setEditingJob(job)
    setShowForm(true)
  }

  async function handleFormSaved() {
    setShowForm(false)
    setEditingJob(null)
    await loadJobs()
  }

  return (
    <div className="sch-root">
      <style>{CSS}</style>

      <header className="sch-topbar">
        <button className="sch-back-chip" onClick={() => navigate('/')}>
          <Left size={14} /> Home
        </button>
        <span className="sch-topbar-sep">/</span>
        <span className="sch-topbar-title">Scheduling</span>
        <button className="sch-new-btn" onClick={openCreateForm} disabled={systemStatus?.mode !== 'connected'}>
          <Plus size={14} /> New Job
        </button>
      </header>

      <div className="sch-body">
        {systemStatus?.mode !== 'connected' ? (
          <div className="sch-empty">
            <Caution size={28} />
            <h2>Scheduling requires an organization server</h2>
            <p>
              Jobs run through your organization's Seshat Server. Connect this machine to one in
              Settings → Cloud Automation to create and manage scheduled jobs.
            </p>
            <button className="sch-empty-cta" onClick={() => navigate('/settings?tab=cloud-automation')}>
              <LinkCloud size={14} /> Go to Cloud Automation settings
            </button>
          </div>
        ) : loading ? (
          <div className="sch-loading">Loading…</div>
        ) : loadError ? (
          <div className="sch-error-banner">{loadError}</div>
        ) : (
          <>
            {forbidden && (
              <div className="sch-notice">
                <Caution size={14} />
                You don't have permission to manage scheduled jobs in this organization. Ask an admin
                to grant you the jobs.manage role.
              </div>
            )}
            {actionError && <div className="sch-error-banner">{actionError}</div>}

            {jobs.length === 0 && !forbidden ? (
              <div className="sch-empty">
                <History size={28} />
                <h2>No scheduled jobs yet</h2>
                <p>Create a job to run a prompt on a schedule, on a timer, or once at a specific time.</p>
                <button className="sch-empty-cta" onClick={openCreateForm}>
                  <Plus size={14} /> New Job
                </button>
              </div>
            ) : (
              <div className="sch-job-list">
                {jobs.map((job) => (
                  <div key={job.id} className="sch-job-card">
                    <div className="sch-job-row">
                      <div className="sch-job-main">
                        <div className="sch-job-name-row">
                          <span className="sch-job-name">{job.name}</span>
                          <span className={`sch-badge sch-badge--${job.status}`}>{job.status}</span>
                          <span className="sch-badge sch-badge--target">{job.execution_target}</span>
                        </div>
                        {job.description && <div className="sch-job-desc">{job.description}</div>}
                        <div className="sch-job-meta">
                          <span>{describeTrigger(job)}</span>
                          {job.next_run_at && <span>next: {new Date(job.next_run_at).toLocaleString()}</span>}
                          {job.last_run_status && (
                            <span>last: {RUN_STATUS_LABEL[job.last_run_status] ?? job.last_run_status}</span>
                          )}
                        </div>
                      </div>
                      <div className="sch-job-actions">
                        <button
                          className="sch-icon-btn"
                          title="Run now"
                          onClick={() => void handleRunNow(job)}
                          disabled={runningJobId === job.id}
                        >
                          <Play size={15} />
                        </button>
                        <button
                          className="sch-icon-btn"
                          title={job.status === 'active' ? 'Pause' : 'Resume'}
                          onClick={() => void handleTogglePaused(job)}
                          disabled={pausingJobId === job.id}
                        >
                          {job.status === 'active' ? <PauseOne size={15} /> : <Play size={15} />}
                        </button>
                        <button className="sch-icon-btn" title="View runs" onClick={() => void toggleRuns(job)}>
                          <History size={15} />
                        </button>
                        <button className="sch-icon-btn" title="Edit" onClick={() => openEditForm(job)}>
                          <Edit size={15} />
                        </button>
                        <button
                          className="sch-icon-btn sch-icon-btn--danger"
                          title="Delete"
                          onClick={() => setDeletingJobId(job.id)}
                        >
                          <Delete size={15} />
                        </button>
                      </div>
                    </div>

                    {expandedJobId === job.id && (
                      <div className="sch-runs-panel">
                        {!runsByJob[job.id] ? (
                          <div className="sch-runs-loading">Loading runs…</div>
                        ) : runsByJob[job.id].length === 0 ? (
                          <div className="sch-runs-empty">No runs yet.</div>
                        ) : (
                          runsByJob[job.id].map((run) => (
                            <div key={run.id} className="sch-run-row">
                              <span className={`sch-badge sch-badge--run-${run.status}`}>
                                {RUN_STATUS_LABEL[run.status] ?? run.status}
                              </span>
                              <span className="sch-run-time">
                                {run.started_at ? new Date(run.started_at).toLocaleString() : (run.queued_at ? new Date(run.queued_at).toLocaleString() : '')}
                              </span>
                              {run.error_text && <span className="sch-run-error">{run.error_text}</span>}
                            </div>
                          ))
                        )}
                      </div>
                    )}

                    {deletingJobId === job.id && (
                      <div className="sch-confirm-row">
                        <span>Delete "{job.name}"? This can't be undone.</span>
                        <div className="sch-confirm-actions">
                          <button className="sch-confirm-cancel" onClick={() => setDeletingJobId(null)}>Cancel</button>
                          <button className="sch-confirm-delete" onClick={() => void handleDelete(job.id)}>Delete</button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {showForm && (
        <JobFormModal
          job={editingJob}
          devices={devices}
          onClose={() => { setShowForm(false); setEditingJob(null) }}
          onSaved={() => void handleFormSaved()}
        />
      )}
    </div>
  )
}

// ─── Create/Edit modal ──────────────────────────────────────────────────────

function JobFormModal({
  job, devices, onClose, onSaved,
}: {
  job: Job | null
  devices: Device[]
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = !!job
  const [name, setName] = useState(job?.name ?? '')
  const [description, setDescription] = useState(job?.description ?? '')
  const [triggerType, setTriggerType] = useState<TriggerType>(job?.trigger_type ?? 'cron')
  const [cronExpr, setCronExpr] = useState(job?.cron_expr ?? '0 0 * * *')
  const [intervalSeconds, setIntervalSeconds] = useState(job?.interval_seconds ?? 3600)
  const [runAt, setRunAt] = useState(job?.run_at ? job.run_at.slice(0, 16) : '')
  const [executionTarget, setExecutionTarget] = useState<ExecutionTarget>(job?.execution_target ?? 'cloud')
  const [targetDeviceId, setTargetDeviceId] = useState(job?.target_device_id ?? '')
  const [modelOverride, setModelOverride] = useState(job?.model_override ?? '')
  const [prompt, setPrompt] = useState(job?.prompt ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const params: JobParams = {
        name: name.trim(),
        description: description.trim() || undefined,
        trigger_type: triggerType,
        cron_expr: triggerType === 'cron' ? cronExpr.trim() : undefined,
        interval_seconds: triggerType === 'interval' ? intervalSeconds : undefined,
        run_at: triggerType === 'once' && runAt ? new Date(runAt).toISOString() : undefined,
        execution_target: executionTarget,
        target_device_id: executionTarget === 'device' ? targetDeviceId : undefined,
        model_override: executionTarget === 'cloud' ? modelOverride.trim() : undefined,
        prompt: prompt.trim(),
      }
      if (isEdit) {
        await api.put(`/automation/jobs/${job!.id}`, params)
      } else {
        await api.post('/automation/jobs', params)
      }
      onSaved()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save this job.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="sch-modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="sch-modal" role="dialog" aria-modal="true">
        <div className="sch-modal-header">
          <h2>{isEdit ? 'Edit Job' : 'New Job'}</h2>
          <button className="sch-modal-close" onClick={onClose}><CloseOne size={16} /></button>
        </div>
        <form className="sch-modal-body" onSubmit={(e) => void handleSubmit(e)}>
          {error && <div className="sch-error-banner">{error}</div>}

          <div className="sch-field">
            <label>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>

          <div className="sch-field">
            <label>Description (optional)</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          <div className="sch-field">
            <label>Trigger</label>
            <select value={triggerType} onChange={(e) => setTriggerType(e.target.value as TriggerType)}>
              <option value="cron">Recurring (cron)</option>
              <option value="interval">Every N seconds</option>
              <option value="once">Once, at a specific time</option>
            </select>
          </div>

          {triggerType === 'cron' && (
            <div className="sch-field">
              <label>Cron expression (5 fields: minute hour day month weekday)</label>
              <input value={cronExpr} onChange={(e) => setCronExpr(e.target.value)} placeholder="0 0 * * *" required />
            </div>
          )}
          {triggerType === 'interval' && (
            <div className="sch-field">
              <label>Interval (seconds)</label>
              <input
                type="number" min={60} value={intervalSeconds}
                onChange={(e) => setIntervalSeconds(Number(e.target.value))} required
              />
            </div>
          )}
          {triggerType === 'once' && (
            <div className="sch-field">
              <label>Run at</label>
              <input type="datetime-local" value={runAt} onChange={(e) => setRunAt(e.target.value)} required />
            </div>
          )}

          <div className="sch-field">
            <label>Execution target</label>
            <select value={executionTarget} onChange={(e) => setExecutionTarget(e.target.value as ExecutionTarget)}>
              <option value="cloud">Cloud (Seshat Server's own provider credentials)</option>
              <option value="device">A specific paired device</option>
            </select>
          </div>

          {executionTarget === 'cloud' && (
            <div className="sch-field">
              <label>Model override</label>
              <input
                value={modelOverride} onChange={(e) => setModelOverride(e.target.value)}
                placeholder="anthropic:claude-sonnet-5" required
              />
            </div>
          )}
          {executionTarget === 'device' && (
            <div className="sch-field">
              <label>Device</label>
              <select value={targetDeviceId} onChange={(e) => setTargetDeviceId(e.target.value)} required>
                <option value="" disabled>Select a device…</option>
                {devices.map((d) => (
                  <option key={d.id} value={d.id} disabled={d.status !== 'active'}>
                    {d.name}{d.status !== 'active' ? ` (${d.status})` : ''}
                  </option>
                ))}
              </select>
              {devices.length === 0 && (
                <div className="sch-field-hint">No devices registered yet in this organization.</div>
              )}
            </div>
          )}

          <div className="sch-field">
            <label>Prompt</label>
            <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={5} required />
          </div>

          <div className="sch-modal-footer">
            <button type="button" className="sch-modal-btn-cancel" onClick={onClose}>Cancel</button>
            <button type="submit" className="sch-modal-btn-submit" disabled={saving}>
              {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create job'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

const CSS = `
.sch-root {
  display: flex; flex-direction: column;
  width: 100%; height: 100%;
  background: var(--color-surface);
  color: var(--color-text);
  overflow: hidden;
}

.sch-topbar {
  display: flex; align-items: center; gap: 8px;
  padding: 0 24px; height: 52px; flex-shrink: 0;
  background: var(--color-bg);
  border-bottom: 1px solid var(--color-border-subtle);
}
.sch-back-chip {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 5px 10px; border-radius: 7px; border: none;
  background: var(--color-hover); color: var(--color-text-secondary);
  font-size: 12px; font-weight: 600; cursor: pointer;
}
.sch-back-chip:hover { background: var(--color-border); color: var(--color-text); }
.sch-topbar-sep { color: var(--color-text-muted); font-size: 14px; }
.sch-topbar-title { font-size: 15px; font-weight: 700; }
.sch-new-btn {
  margin-left: auto;
  display: inline-flex; align-items: center; gap: 6px;
  padding: 7px 14px; border-radius: 9px; border: none;
  background: var(--color-cta); color: white;
  font-size: 12px; font-weight: 700; cursor: pointer;
}
.sch-new-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.sch-body { flex: 1; overflow-y: auto; padding: 28px 32px; }

.sch-loading, .sch-error-banner {
  padding: 14px 16px; border-radius: 10px; font-size: 13px;
}
.sch-loading { color: var(--color-text-muted); }
.sch-error-banner {
  background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.25);
  color: #f87171; margin-bottom: 16px;
}
.sch-notice {
  display: flex; align-items: center; gap: 8px;
  padding: 12px 16px; border-radius: 10px; margin-bottom: 16px;
  background: rgba(239, 124, 47, 0.08); border: 1px solid rgba(239, 124, 47, 0.25);
  color: var(--color-accent); font-size: 13px;
}

.sch-empty {
  display: flex; flex-direction: column; align-items: center; text-align: center;
  gap: 12px; max-width: 420px; margin: 60px auto 0; color: var(--color-text-muted);
}
.sch-empty h2 { font-size: 17px; font-weight: 700; color: var(--color-text); margin: 4px 0 0; }
.sch-empty p { font-size: 13px; line-height: 1.6; margin: 0; }
.sch-empty-cta {
  margin-top: 8px;
  display: inline-flex; align-items: center; gap: 6px;
  padding: 8px 16px; border-radius: 9px; border: none;
  background: var(--color-cta); color: white; font-size: 12px; font-weight: 700; cursor: pointer;
}

.sch-job-list { display: flex; flex-direction: column; gap: 10px; }
.sch-job-card {
  border: 1px solid var(--color-border-subtle); border-radius: 14px;
  background: var(--color-bg);
}
.sch-job-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding: 16px 18px; }
.sch-job-main { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.sch-job-name-row { display: flex; align-items: center; gap: 8px; }
.sch-job-name { font-size: 14px; font-weight: 700; }
.sch-job-desc { font-size: 12px; color: var(--color-text-muted); }
.sch-job-meta { display: flex; gap: 14px; font-size: 11px; color: var(--color-text-muted); flex-wrap: wrap; }

.sch-badge {
  font-size: 10px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase;
  padding: 2px 8px; border-radius: 999px; flex-shrink: 0;
}
.sch-badge--active { background: rgba(52, 211, 153, 0.12); color: #34d399; }
.sch-badge--paused { background: rgba(148, 163, 184, 0.15); color: var(--color-text-muted); }
.sch-badge--target { background: rgba(239, 124, 47, 0.1); color: var(--color-accent); }
.sch-badge--run-completed { background: rgba(52, 211, 153, 0.12); color: #34d399; }
.sch-badge--run-failed { background: rgba(239, 68, 68, 0.1); color: #f87171; }
.sch-badge--run-cancelled { background: rgba(148, 163, 184, 0.15); color: var(--color-text-muted); }
.sch-badge--run-queued, .sch-badge--run-claimed, .sch-badge--run-running { background: rgba(96, 165, 250, 0.12); color: #60a5fa; }

.sch-job-actions { display: flex; gap: 4px; flex-shrink: 0; }
.sch-icon-btn {
  width: 30px; height: 30px; border-radius: 8px; border: 1px solid var(--color-border-subtle);
  background: transparent; color: var(--color-text-muted); display: flex; align-items: center; justify-content: center;
  cursor: pointer;
}
.sch-icon-btn:hover:not(:disabled) { background: var(--color-hover); color: var(--color-text); }
.sch-icon-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.sch-icon-btn--danger:hover:not(:disabled) { background: rgba(239, 68, 68, 0.1); color: #f87171; }

.sch-runs-panel {
  border-top: 1px solid var(--color-border-subtle); padding: 10px 18px 14px;
  display: flex; flex-direction: column; gap: 6px;
}
.sch-runs-loading, .sch-runs-empty { font-size: 12px; color: var(--color-text-muted); }
.sch-run-row { display: flex; align-items: center; gap: 10px; font-size: 12px; }
.sch-run-time { color: var(--color-text-muted); }
.sch-run-error { color: #f87171; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.sch-confirm-row {
  border-top: 1px solid var(--color-border-subtle); padding: 10px 18px;
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  font-size: 12px; color: var(--color-text);
}
.sch-confirm-actions { display: flex; gap: 8px; flex-shrink: 0; }
.sch-confirm-cancel {
  background: transparent; border: 1px solid var(--color-border-subtle); color: var(--color-text-muted);
  padding: 5px 12px; border-radius: 8px; font-size: 12px; cursor: pointer;
}
.sch-confirm-delete {
  background: rgba(239, 68, 68, 0.12); border: 1px solid rgba(239, 68, 68, 0.3); color: #f87171;
  padding: 5px 12px; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer;
}

/* Modal */
.sch-modal-backdrop {
  position: fixed; inset: 0; z-index: 900;
  display: flex; align-items: center; justify-content: center; padding: 24px;
  background: rgba(0, 0, 0, 0.55); backdrop-filter: blur(6px);
}
.sch-modal {
  background: var(--color-surface); border: 1px solid var(--color-border-subtle);
  border-radius: 16px; width: 100%; max-width: 520px; max-height: calc(100vh - 80px);
  display: flex; flex-direction: column; overflow: hidden;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5);
}
.sch-modal-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px; border-bottom: 1px solid var(--color-border-subtle);
}
.sch-modal-header h2 { font-size: 16px; margin: 0; font-weight: 700; }
.sch-modal-close { background: none; border: none; color: var(--color-text-muted); cursor: pointer; display: flex; }
.sch-modal-body { padding: 18px 20px; overflow-y: auto; flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 14px; }
.sch-field { display: flex; flex-direction: column; gap: 6px; }
.sch-field label { font-size: 12px; font-weight: 600; color: var(--color-text-secondary); }
.sch-field input, .sch-field select, .sch-field textarea {
  background: var(--color-bg); border: 1px solid var(--color-border);
  padding: 9px 12px; border-radius: 10px; color: var(--color-text); font-size: 13px;
  outline: none; font-family: inherit; resize: vertical;
}
.sch-field input:focus, .sch-field select:focus, .sch-field textarea:focus { border-color: var(--color-primary); }
.sch-field-hint { font-size: 11px; color: var(--color-text-muted); }
.sch-modal-footer { display: flex; justify-content: flex-end; gap: 10px; padding-top: 4px; }
.sch-modal-btn-cancel {
  background: var(--color-bg); border: 1px solid var(--color-border); color: var(--color-text);
  padding: 8px 18px; border-radius: 10px; font-weight: 700; cursor: pointer; font-size: 13px;
}
.sch-modal-btn-submit {
  background: var(--color-cta); color: white; border: none;
  padding: 8px 18px; border-radius: 10px; font-weight: 700; cursor: pointer; font-size: 13px;
}
.sch-modal-btn-submit:disabled { opacity: 0.5; cursor: not-allowed; }
`
