import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router'
import { Plus, Play, PauseOne, Edit, Delete, History, Caution, LinkCloud } from '@icon-park/react'
import { api, ApiError } from '@/api/client'
import type { Agent } from '@/api/types'
import { useProviders } from '@/hooks/useProviders'
import { useProvidersStore } from '@/stores/providers'
import type { Device, InspectorTab, Job, JobDraft, Run, SystemStatus } from '../api/types'
import { AutomationPlannerPanel } from '../components/AutomationPlannerPanel'
import { JobFormModal } from '../components/JobFormModal'
import { RunInspectorPanel } from '../components/RunInspectorPanel'
import { RUN_STATUS_LABEL, describeTrigger } from '../lib/schedulingJobs'
import '../styles/scheduling.css'

export function SchedulingPage() {
  const navigate = useNavigate()
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null)
  const [statusLoading, setStatusLoading] = useState(true)
  const [jobs, setJobs] = useState<Job[]>([])
  const [devices, setDevices] = useState<Device[]>([])
  const [agents, setAgents] = useState<Agent[]>([])
  const { loading: providersLoading } = useProviders()
  const providers = useProvidersStore((s) => s.providers)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [forbidden, setForbidden] = useState(false)

  const [showForm, setShowForm] = useState(false)
  const [editingJob, setEditingJob] = useState<Job | null>(null)
  const [draft, setDraft] = useState<JobDraft | null>(null)
  const [deletingJobId, setDeletingJobId] = useState<string | null>(null)
  const [runningJobId, setRunningJobId] = useState<string | null>(null)
  const [pausingJobId, setPausingJobId] = useState<string | null>(null)
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null)
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [runsByJob, setRunsByJob] = useState<Record<string, Run[]>>({})
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('activity')

  const loadJobs = useCallback(async () => {
    try {
      const result = await api.get<{ jobs: Job[] }>('/automation/jobs')
      // Graph jobs live exclusively in Automation's own Overview now - this
      // list is Prompt-only, matching Scheduling and Automation being two
      // separate homes instead of one list with a "graph" badge on some rows.
      setJobs((result.jobs ?? []).filter((job) => !job.graph))
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
    api.get<SystemStatus>('/system/status')
      .then(setSystemStatus)
      .catch(() => setSystemStatus(null))
      .finally(() => setStatusLoading(false))
    void loadJobs()
    api.get<{ devices: Device[] }>('/automation/devices').then((r) => setDevices(r.devices ?? [])).catch(() => {})
    api.get<{ agents: Agent[] }>('/agents').then((r) => setAgents((r.agents ?? []).filter((a) => a.enabled !== false))).catch(() => {})
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

  async function ensureRunsLoaded(job: Job) {
    if (runsByJob[job.id]) return
    try {
      const result = await api.get<{ runs: Run[] }>(`/automation/jobs/${job.id}/runs`)
      setRunsByJob((current) => ({ ...current, [job.id]: result.runs ?? [] }))
    } catch {
      setRunsByJob((current) => ({ ...current, [job.id]: [] }))
    }
  }

  function selectJob(job: Job) {
    setSelectedJobId(job.id)
    setInspectorTab('plan')
    void ensureRunsLoaded(job)
  }

  function openCreateForm() {
    setEditingJob(null)
    setDraft(null)
    setShowForm(true)
  }

  function openEditForm(job: Job) {
    setEditingJob(job)
    setDraft(null)
    setShowForm(true)
  }

  function openDraftForm(nextDraft: JobDraft) {
    setEditingJob(null)
    setDraft(nextDraft)
    setShowForm(true)
  }

  async function handleFormSaved() {
    setShowForm(false)
    setEditingJob(null)
    setDraft(null)
    await loadJobs()
  }

  return (
    <div className="sch-root">

      <header className="sch-topbar">
        <span className="sch-topbar-title">Scheduling</span>
        <button className="sch-new-btn" onClick={openCreateForm} disabled={systemStatus?.mode !== 'connected'}>
          <Plus size={11} /> New Job
        </button>
      </header>

      <div className="sch-body">
        <div className={`sch-layout ${selectedJobId ? 'sch-layout--inspector' : 'sch-layout--planner'}`}>
          <section className="sch-main-panel">
        {statusLoading ? (
          <div className="sch-loading">Loading…</div>
        ) : systemStatus?.mode !== 'connected' ? (
          <div className="sch-empty">
            <Caution size={23} />
            <h2>Scheduling requires an organization server</h2>
            <p>
              Jobs run through your organization's Seshat Server. Connect this machine to one in
              Settings → Cloud Automation to create and manage scheduled jobs.
            </p>
            <button className="sch-empty-cta" onClick={() => navigate('/settings?tab=runtime')}>
              <LinkCloud size={11} /> Go to Cloud Automation settings
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
                <Caution size={11} />
                You don't have permission to manage scheduled jobs in this organization. Ask an admin
                to grant you the jobs.manage role.
              </div>
            )}
            {actionError && <div className="sch-error-banner">{actionError}</div>}

            {jobs.length === 0 && !forbidden ? (
              <div className="sch-empty">
                <History size={23} />
                <h2>No scheduled jobs yet</h2>
                <p>Create a job to run a prompt on a schedule, on a timer, or once at a specific time.</p>
                <button className="sch-empty-cta" onClick={openCreateForm}>
                  <Plus size={11} /> New Job
                </button>
              </div>
            ) : (
              <div className="sch-job-list">
                {jobs.map((job) => (
                  <div key={job.id} className={`sch-job-card ${selectedJobId === job.id ? 'selected' : ''}`}>
                    <div className="sch-job-row" onClick={() => selectJob(job)} role="button" tabIndex={0}>
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
                          onClick={(event) => { event.stopPropagation(); void handleRunNow(job) }}
                          disabled={runningJobId === job.id}
                        >
                          <Play size={12} />
                        </button>
                        <button
                          className="sch-icon-btn"
                          title={job.status === 'active' ? 'Pause' : 'Resume'}
                          onClick={(event) => { event.stopPropagation(); void handleTogglePaused(job) }}
                          disabled={pausingJobId === job.id}
                        >
                          {job.status === 'active' ? <PauseOne size={12} /> : <Play size={12} />}
                        </button>
                        <button className="sch-icon-btn" title="View runs" onClick={(event) => { event.stopPropagation(); void toggleRuns(job) }}>
                          <History size={12} />
                        </button>
                        <button className="sch-icon-btn" title="Edit" onClick={(event) => { event.stopPropagation(); openEditForm(job) }}>
                          <Edit size={12} />
                        </button>
                        <button
                          className="sch-icon-btn sch-icon-btn--danger"
                          title="Delete"
                          onClick={(event) => { event.stopPropagation(); setDeletingJobId(job.id) }}
                        >
                          <Delete size={12} />
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
          </section>

          {selectedJobId ? (
            <RunInspectorPanel
              job={jobs.find((job) => job.id === selectedJobId) ?? null}
              runs={runsByJob[selectedJobId] ?? []}
              tab={inspectorTab}
              onTabChange={setInspectorTab}
              onClose={() => setSelectedJobId(null)}
              onRunNow={(job) => void handleRunNow(job)}
              onTogglePaused={(job) => void handleTogglePaused(job)}
              onEdit={openEditForm}
            />
          ) : (
            <AutomationPlannerPanel
              disabled={statusLoading || systemStatus?.mode !== 'connected' || forbidden}
              agents={agents}
              providers={providers}
              onDraft={openDraftForm}
            />
          )}
        </div>
      </div>

      {showForm && (
        <JobFormModal
          job={editingJob}
          draft={draft}
          devices={devices}
          agents={agents}
          providers={providers}
          providersLoading={providersLoading}
          onClose={() => { setShowForm(false); setEditingJob(null); setDraft(null) }}
          onSaved={() => void handleFormSaved()}
        />
      )}
    </div>
  )
}

// ─── Create/Edit modal ──────────────────────────────────────────────────────
