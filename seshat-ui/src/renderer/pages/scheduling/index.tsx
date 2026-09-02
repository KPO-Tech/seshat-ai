import { useEffect, useMemo, useState, useCallback, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import {
  Plus, Play, PauseOne, Edit, Delete, History, Caution, LinkCloud,
  CheckOne, Robot, Send, Download, PreviewOpen, Setting, RelationalGraph,
} from '@icon-park/react'
import { api, ApiError } from '@/api/client'
import { WindowCloseIcon } from '@/components/ui/WindowControlIcon'
import type { Agent, ProviderModel, ProviderSetting } from '@/api/types'
import { fetchProviderModels, useProviders } from '@/hooks/useProviders'
import { useProvidersStore } from '@/stores/providers'
import type { DataflowDefinition } from '../automation/graph/types'

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
  graph?: DataflowDefinition
  model_override?: string
  configuration?: Record<string, string>
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
  configuration?: Record<string, string>
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
type InspectorTab = 'plan' | 'activity' | 'outputs'
type InspectorPlanStep = {
  id: string
  title: string
  status?: 'pending' | 'in_progress' | 'completed' | 'failed'
  detail?: string
}

type JobDraft = Partial<JobParams> & {
  agent_slug?: string
  provider_setting_id?: string
  model_id?: string
}

const RUN_STATUS_LABEL: Record<RunStatus, string> = {
  queued: 'Queued', claimed: 'Claimed', running: 'Running',
  completed: 'Completed', failed: 'Failed', cancelled: 'Cancelled',
}

function titleFromRequest(request: string): string {
  const cleaned = request.replace(/\s+/g, ' ').trim()
  if (!cleaned) return 'Scheduled automation'
  const short = cleaned.length > 58 ? `${cleaned.slice(0, 55).trim()}...` : cleaned
  return short[0].toUpperCase() + short.slice(1)
}

function draftScheduleFromRequest(request: string): Pick<JobDraft, 'trigger_type' | 'cron_expr' | 'interval_seconds' | 'run_at'> {
  const text = request.toLowerCase()
  const hourMatch = text.match(/\b(?:a|à|at)\s*(\d{1,2})(?:h|:)?(\d{2})?\b/)
  const hour = hourMatch ? Math.min(23, Number(hourMatch[1])) : 9
  const minute = hourMatch?.[2] ? Math.min(59, Number(hourMatch[2])) : 0
  const minuteHour = `${minute} ${hour}`

  if (/\b(once|une fois|demain|tomorrow)\b/.test(text)) {
    const runAt = new Date()
    runAt.setDate(runAt.getDate() + (/\b(demain|tomorrow)\b/.test(text) ? 1 : 0))
    runAt.setHours(hour, minute, 0, 0)
    return { trigger_type: 'once', run_at: runAt.toISOString() }
  }
  if (/\b(hourly|chaque heure|toutes les heures)\b/.test(text)) return { trigger_type: 'interval', interval_seconds: 3600 }
  if (/\b(daily|tous les jours|chaque jour|quotidien)\b/.test(text)) return { trigger_type: 'cron', cron_expr: `${minuteHour} * * *` }
  if (/\b(monday|lundi)\b/.test(text)) return { trigger_type: 'cron', cron_expr: `${minuteHour} * * 1` }
  if (/\b(friday|vendredi)\b/.test(text)) return { trigger_type: 'cron', cron_expr: `${minuteHour} * * 5` }
  if (/\b(weekly|chaque semaine|hebdo|hebdomadaire)\b/.test(text)) return { trigger_type: 'cron', cron_expr: `${minuteHour} * * 1` }
  if (/\b(monthly|chaque mois|mensuel)\b/.test(text)) return { trigger_type: 'cron', cron_expr: `${minuteHour} 1 * *` }
  return { trigger_type: 'cron', cron_expr: '0 9 * * 1' }
}

// The planner's preferred provider/model is a per-device convenience, not
// job data - persisted in localStorage rather than sent anywhere, same
// pattern as other lightweight per-viewer preferences in this app.
const PLANNER_PREFERENCE_KEY = 'seshat.scheduling-planner-preferred-model.v1'

type PlannerPreference = { providerSettingId: string; modelId: string }

function loadPlannerPreference(): PlannerPreference | null {
  try {
    const raw = localStorage.getItem(PLANNER_PREFERENCE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (typeof parsed?.providerSettingId === 'string' && typeof parsed?.modelId === 'string') return parsed
    return null
  } catch {
    return null
  }
}

function savePlannerPreference(pref: PlannerPreference | null) {
  try {
    if (pref) localStorage.setItem(PLANNER_PREFERENCE_KEY, JSON.stringify(pref))
    else localStorage.removeItem(PLANNER_PREFERENCE_KEY)
  } catch {
    // best-effort only - a private window or blocked storage just means the
    // planner falls back to the org default provider every time, same as
    // before this preference existed at all.
  }
}

function draftAutomation(request: string, agents: Agent[], providers: ProviderSetting[], preference: PlannerPreference | null): JobDraft {
  const text = request.toLowerCase()
  const selectedAgent =
    agents.find((agent) => text.includes(agent.slug.toLowerCase())) ??
    agents.find((agent) => text.includes((agent.name || '').toLowerCase())) ??
    agents.find((agent) => agent.slug === 'automation-manager') ??
    agents.find((agent) => agent.source === 'user') ??
    agents[0]
  const preferredProvider = preference ? providers.find((item) => item.id === preference.providerSettingId) : undefined
  const provider = preferredProvider ?? providers.find((item) => item.is_default) ?? providers[0]
  const schedule = draftScheduleFromRequest(request)

  return {
    name: titleFromRequest(request),
    description: 'Drafted from the Scheduling assistant. Review every field before creating the job.',
    ...schedule,
    execution_target: 'cloud',
    prompt: `You are running a scheduled automation.\n\nUser request:\n${request.trim()}\n\nExecute the task carefully, summarize what was done, and include any errors or follow-up needed.`,
    agent_slug: selectedAgent?.slug,
    provider_setting_id: provider?.id,
    model_id: preferredProvider ? preference?.modelId : undefined,
  }
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
    if (job.graph) {
      navigate(`/automation/${job.id}`)
      return
    }
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
      <style>{CSS}</style>

      <header className="sch-topbar">
        <span className="sch-topbar-title">Scheduling</span>
        <button
          className="sch-new-btn sch-new-btn--ghost"
          onClick={() => navigate('/automation/new')}
          disabled={systemStatus?.mode !== 'connected'}
          title="Build a job as a visual graph instead of a single prompt"
        >
          <RelationalGraph size={11} /> Automation
        </button>
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
                          {job.graph && <span className="sch-badge sch-badge--graph">graph</span>}
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

function AutomationPlannerPanel({ disabled, agents, providers, onDraft }: {
  disabled: boolean
  agents: Agent[]
  providers: ProviderSetting[]
  onDraft: (draft: JobDraft) => void
}) {
  const [request, setRequest] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [preference, setPreference] = useState<PlannerPreference | null>(() => loadPlannerPreference())
  const canDraft = request.trim().length > 0 && !disabled
  const suggestions = [
    'Every Monday at 8, send a weekly operations report.',
    'Monitor failures daily and summarize anything urgent.',
    'Summarize new documents every Friday afternoon.',
  ]

  function handleDraft(value = request) {
    if (!value.trim() || disabled) return
    onDraft(draftAutomation(value, agents, providers, preference))
  }

  function handlePreferenceSaved(next: PlannerPreference | null) {
    setPreference(next)
    savePlannerPreference(next)
    setShowSettings(false)
  }

  return (
    <aside className="sch-planner">
      <div className="sch-planner-head">
        <div className="sch-planner-icon"><Robot size={18} /></div>
        <div className="sch-planner-head-copy">
          <h2>Automation Planner</h2>
          <p>Draft scheduled jobs with approval.</p>
        </div>
        <button
          type="button"
          className="sch-planner-settings-btn"
          onClick={() => setShowSettings(true)}
          title="Choose the provider and model used to draft automations"
        >
          <Setting size={15} />
        </button>
      </div>

      <div className="sch-planner-suggestions">
        <div className="sch-planner-section-label">Try a suggestion</div>
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            className="sch-planner-chip"
            disabled={disabled}
            onClick={() => {
              setRequest(suggestion)
              handleDraft(suggestion)
            }}
          >
            <History size={13} />
            <span>{suggestion.split(',')[0]}</span>
          </button>
        ))}
      </div>

      {disabled && (
        <div className="sch-planner-disabled">
          Connect to Seshat Server and make sure you have job permissions to create automations.
        </div>
      )}

      <div className="sch-planner-inputbar">
        <input
          value={request}
          onChange={(event) => setRequest(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              handleDraft()
            }
          }}
          disabled={disabled}
          placeholder="Describe the automation..."
        />
        <button type="button" onClick={() => handleDraft()} disabled={!canDraft} title="Draft job">
          <Send size={15} />
        </button>
      </div>

      {showSettings && (
        <PlannerSettingsModal
          providers={providers}
          preference={preference}
          onClose={() => setShowSettings(false)}
          onSaved={handlePreferenceSaved}
        />
      )}
    </aside>
  )
}

function PlannerSettingsModal({ providers, preference, onClose, onSaved }: {
  providers: ProviderSetting[]
  preference: PlannerPreference | null
  onClose: () => void
  onSaved: (next: PlannerPreference | null) => void
}) {
  const [providerId, setProviderId] = useState(preference?.providerSettingId ?? '')
  const [modelId, setModelId] = useState(preference?.modelId ?? '')
  const [models, setModels] = useState<ProviderModel[]>([])
  const [loadingModels, setLoadingModels] = useState(false)

  useEffect(() => {
    if (!providerId) { setModels([]); return }
    let cancelled = false
    setLoadingModels(true)
    fetchProviderModels(providerId)
      .then((result) => { if (!cancelled) setModels(result) })
      .catch(() => { if (!cancelled) setModels([]) })
      .finally(() => { if (!cancelled) setLoadingModels(false) })
    return () => { cancelled = true }
  }, [providerId])

  useEffect(() => {
    if (modelId && models.some((model) => model.model_id === modelId)) return
    const def = models.find((model) => model.is_default) ?? models[0]
    setModelId(def?.model_id ?? '')
  }, [modelId, models])

  function handleSave() {
    onSaved(providerId && modelId ? { providerSettingId: providerId, modelId } : null)
  }

  function handleUseDefault() {
    onSaved(null)
  }

  return (
    <div className="sch-modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="sch-planner-settings-modal" role="dialog" aria-modal="true">
        <div className="sch-modal-header">
          <div>
            <h2>Planner model</h2>
            <p>Provider and model used to draft new automations. Leave unset to use your organization's default.</p>
          </div>
          <button className="sch-modal-close" onClick={onClose}><WindowCloseIcon size={13} /></button>
        </div>
        <div className="sch-planner-settings-body">
          <div className="sch-field">
            <label>Provider</label>
            <select value={providerId} onChange={(e) => { setProviderId(e.target.value); setModelId('') }}>
              <option value="">Organization default</option>
              {providers.map((provider) => (
                <option key={provider.id} value={provider.id}>{provider.name}</option>
              ))}
            </select>
          </div>
          <div className="sch-field">
            <label>Model</label>
            <select
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              disabled={!providerId || loadingModels || models.length === 0}
            >
              <option value="" disabled>
                {!providerId ? 'Select a provider first' : loadingModels ? 'Loading models...' : 'Select a model...'}
              </option>
              {models.map((model) => (
                <option key={model.model_id} value={model.model_id}>{model.display_name || model.model_id}</option>
              ))}
            </select>
            {providerId && !loadingModels && models.length === 0 && (
              <div className="sch-field-hint">No models found for this provider.</div>
            )}
          </div>
        </div>
        <div className="sch-modal-footer">
          <button type="button" className="sch-modal-btn-cancel" onClick={handleUseDefault}>Use organization default</button>
          <button type="button" className="sch-modal-btn-submit" disabled={!providerId || !modelId} onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>
  )
}

function formatRunTime(run: Run): string {
  const raw = run.started_at ?? run.queued_at ?? run.finished_at
  return raw ? new Date(raw).toLocaleString() : 'Not started'
}

function latestRun(runs: Run[]): Run | null {
  return [...runs].sort((a, b) => {
    const at = new Date(a.started_at ?? a.queued_at ?? a.finished_at ?? 0).getTime()
    const bt = new Date(b.started_at ?? b.queued_at ?? b.finished_at ?? 0).getTime()
    return bt - at
  })[0] ?? null
}

function readPlanSteps(job: Job): InspectorPlanStep[] {
  const raw =
    job.configuration?.agent_plan ??
    job.configuration?.plan ??
    job.configuration?.tasks ??
    job.configuration?.task_plan

  if (!raw) return []

  let parsed: unknown = raw
  try {
    parsed = JSON.parse(raw)
  } catch {
    parsed = raw
  }

  const list = Array.isArray(parsed)
    ? parsed
    : typeof parsed === 'object' && parsed !== null && Array.isArray((parsed as { items?: unknown }).items)
      ? (parsed as { items: unknown[] }).items
      : []

  return list.flatMap<InspectorPlanStep>((item, index) => {
    if (typeof item === 'string') {
      return [{ id: `${index}-${item}`, title: item, status: 'pending' as const }]
    }
    if (!item || typeof item !== 'object') return []
    const value = item as Record<string, unknown>
    const title = String(value.title ?? value.task ?? value.label ?? '').trim()
    if (!title) return []
    const rawStatus = String(value.status ?? value.state ?? 'pending')
    const status: InspectorPlanStep['status'] =
      rawStatus === 'completed' || rawStatus === 'done' ? 'completed'
        : rawStatus === 'in_progress' || rawStatus === 'running' ? 'in_progress'
          : rawStatus === 'failed' || rawStatus === 'error' ? 'failed'
            : 'pending'
    const detail = typeof value.detail === 'string'
      ? value.detail
      : typeof value.description === 'string'
        ? value.description
        : undefined
    return [{ id: String(value.id ?? `${index}-${title}`), title, status, detail }]
  })
}

function RunInspectorPanel({ job, runs, tab, onTabChange, onClose, onRunNow, onTogglePaused, onEdit }: {
  job: Job | null
  runs: Run[]
  tab: InspectorTab
  onTabChange: (tab: InspectorTab) => void
  onClose: () => void
  onRunNow: (job: Job) => void
  onTogglePaused: (job: Job) => void
  onEdit: (job: Job) => void
}) {
  if (!job) {
    return (
      <aside className="sch-inspector">
        <button className="sch-inspector-close" onClick={onClose}><WindowCloseIcon size={13} /></button>
        <div className="sch-runs-empty">This job is no longer available.</div>
      </aside>
    )
  }
  const run = latestRun(runs)
  const planSteps = readPlanSteps(job)
  const outputs = runs.filter((item) => item.output_text || item.error_text)

  return (
    <aside className="sch-inspector">
      <div className="sch-inspector-topstrip">
        <div className="sch-inspector-titleline">
          <strong>{job.name}</strong>
          <span className={`sch-status-dot ${run?.status ?? job.status}`} />
          <span className="sch-mini-pill running">{run ? RUN_STATUS_LABEL[run.status] : job.status}</span>
          <span className="sch-mini-pill target">{job.execution_target}</span>
        </div>
        <div className="sch-inspector-icon-actions">
          <button onClick={() => onRunNow(job)} title="Run"><Play size={14} /><span>Run</span></button>
          <button onClick={() => onTogglePaused(job)} title={job.status === 'active' ? 'Pause' : 'Resume'}>{job.status === 'active' ? <PauseOne size={14} /> : <Play size={14} />}<span>{job.status === 'active' ? 'Pause' : 'Resume'}</span></button>
          <button onClick={() => onEdit(job)} title="Config"><Edit size={14} /><span>Config</span></button>
          <button onClick={onClose} title="Close"><WindowCloseIcon size={14} /><span>Close</span></button>
        </div>
      </div>

      <div className="sch-inspector-metarow">
        <div>
          <span>Next run</span>
          <strong>{job.next_run_at ? new Date(job.next_run_at).toLocaleString() : 'Not scheduled'}</strong>
        </div>
        <div>
          <span>Last run</span>
          <strong>{job.last_run_at ? new Date(job.last_run_at).toLocaleString() : 'Never'}</strong>
        </div>
        <div>
          <span>Retention</span>
          <strong>30 days</strong>
        </div>
      </div>

      <div className="sch-inspector-tabs wide">
        <button className={tab === 'plan' ? 'active' : ''} onClick={() => onTabChange('plan')}>Plan</button>
        <button className={tab === 'activity' ? 'active' : ''} onClick={() => onTabChange('activity')}>Activities</button>
        <button className={tab === 'outputs' ? 'active' : ''} onClick={() => onTabChange('outputs')}>Outputs</button>
      </div>

      {tab === 'activity' ? (
        <section className="sch-inspector-tabbody">
          {runs.length === 0 ? (
            <InspectorEmpty
              icon={<History size={18} />}
              title="No activity yet"
              description="Run this job manually or wait for the next scheduled execution. Agent activity and timestamps will appear here."
            />
          ) : (
            <div className="sch-activity-list">
              {runs.map((item) => (
                <div key={item.id} className="sch-activity-row">
                  <span>{formatRunTime(item)}</span>
                  <strong>{RUN_STATUS_LABEL[item.status]}</strong>
                  {item.error_text && <p>{item.error_text}</p>}
                </div>
              ))}
            </div>
          )}
        </section>
      ) : tab === 'outputs' ? (
        <section className="sch-inspector-tabbody">
          {outputs.length === 0 ? (
          <InspectorEmpty
            icon={<PreviewOpen size={18} />}
            title="No outputs yet"
            description="The final answer and generated artifacts will appear here after a completed run. Old outputs are retained for 30 days."
          />
        ) : (
          <div className="sch-output-list">
            {outputs.map((item) => (
              <div key={item.id} className="sch-output-row">
                <div>
                  <strong>{item.error_text ? 'Error log' : 'Run output'}</strong>
                  <span>{formatRunTime(item)}</span>
                </div>
                <div className="sch-output-actions">
                  <button title="View"><PreviewOpen size={12} /></button>
                  <button title="Download"><Download size={12} /></button>
                  <button title="Delete"><Delete size={12} /></button>
                </div>
              </div>
            ))}
            <div className="sch-output-note">Outputs older than 30 days are deleted unless pinned.</div>
          </div>
          )}
        </section>
      ) : (
        <div className="sch-plan-split">
          <section className="sch-plan-pane">
            <div className="sch-plan-heading">Plan <span>Agent-generated plan</span></div>
            {planSteps.length === 0 ? (
              <InspectorEmpty
                icon={<Robot size={18} />}
                title="No live plan yet"
                description="When the scheduled agent emits task_create or task_update events, its plan will be tracked here instead of being guessed in advance."
              />
            ) : (
            <div className="sch-plan-list visual">
              {planSteps.map((step, index) => (
                <div key={step.id} className={`sch-plan-step visual ${step.status ?? 'pending'}`}>
                  <span>{index + 1}</span>
                  <div>
                    <strong>{step.title}</strong>
                    <small>{(step.status ?? 'pending').replace('_', ' ')}</small>
                    {step.detail && <p>{step.detail}</p>}
                  </div>
                </div>
              ))}
            </div>
            )}
          </section>
          <section className="sch-activity-output-preview">
            <div className="sch-plan-heading">Activity output <span>{run ? formatRunTime(run) : 'Preview'}</span></div>
            {run?.output_text || run?.error_text ? (
              <p>{run.output_text || run.error_text}</p>
            ) : (
              <InspectorEmpty
                icon={<PreviewOpen size={18} />}
                title="Nothing selected"
                description="Select an activity after a run to preview its output and artifacts here."
              />
            )}
          </section>
        </div>
      )}
    </aside>
  )
}

function InspectorEmpty({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return (
    <div className="sch-inspector-empty">
      <span>{icon}</span>
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  )
}

function JobFormModal({
  job, draft, devices, agents, providers, providersLoading, onClose, onSaved,
}: {
  job: Job | null
  draft: JobDraft | null
  devices: Device[]
  agents: Agent[]
  providers: ProviderSetting[]
  providersLoading: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const navigate = useNavigate()
  const isEdit = !!job
  const [name, setName] = useState(job?.name ?? draft?.name ?? '')
  const [description, setDescription] = useState(job?.description ?? draft?.description ?? '')
  const [triggerType, setTriggerType] = useState<TriggerType>(job?.trigger_type ?? draft?.trigger_type ?? 'cron')
  const [cronExpr, setCronExpr] = useState(job?.cron_expr ?? draft?.cron_expr ?? '0 0 * * *')
  const [intervalSeconds, setIntervalSeconds] = useState(job?.interval_seconds ?? draft?.interval_seconds ?? 3600)
  const [runAt, setRunAt] = useState(job?.run_at ? job.run_at.slice(0, 16) : draft?.run_at ? draft.run_at.slice(0, 16) : '')
  const [executionTarget, setExecutionTarget] = useState<ExecutionTarget>(job?.execution_target ?? draft?.execution_target ?? 'cloud')
  const [targetDeviceId, setTargetDeviceId] = useState(job?.target_device_id ?? draft?.target_device_id ?? '')
  const [agentSlug, setAgentSlug] = useState(job?.configuration?.agent_slug ?? draft?.agent_slug ?? '')
  const [selectedProviderId, setSelectedProviderId] = useState(job?.configuration?.provider_setting_id ?? draft?.provider_setting_id ?? '')
  const [selectedModelId, setSelectedModelId] = useState(job?.configuration?.model_id ?? draft?.model_id ?? '')
  const [modelsByProvider, setModelsByProvider] = useState<Record<string, ProviderModel[]>>({})
  const [loadingModelsFor, setLoadingModelsFor] = useState<string | null>(null)
  const [prompt, setPrompt] = useState(job?.prompt ?? draft?.prompt ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const selectedAgent = agents.find((agent) => agent.slug === agentSlug)
  const availableProviders = useMemo(() => {
    if (executionTarget !== 'cloud') return providers
    return providers.filter((provider) => provider.has_api_key || provider.auth_kind === 'oauth' || provider.connection_status === 'connected')
  }, [executionTarget, providers])
  const selectedProvider = availableProviders.find((provider) => provider.id === selectedProviderId)
    ?? providers.find((provider) => provider.id === selectedProviderId)
    ?? null
  const selectedModels = useMemo(
    () => (selectedProviderId ? (modelsByProvider[selectedProviderId] ?? []) : []),
    [modelsByProvider, selectedProviderId],
  )
  const selectedModel = selectedModels.find((model) => model.model_id === selectedModelId) ?? null
  const modelOverride = selectedProvider && selectedModelId ? `${selectedProvider.provider}:${selectedModelId}` : ''
  const scheduleSummary = triggerType === 'cron'
    ? cronExpr || 'Cron not set'
    : triggerType === 'interval'
      ? `Every ${intervalSeconds}s`
      : runAt
        ? new Date(runAt).toLocaleString()
        : 'Date not set'
  const validationItems = [
    { label: 'Name is valid', ok: name.trim().length > 0 },
    { label: 'Schedule configured', ok: triggerType === 'cron' ? cronExpr.trim().length > 0 : triggerType === 'interval' ? intervalSeconds >= 60 : runAt.length > 0 },
    { label: 'Execution target selected', ok: executionTarget === 'cloud' || targetDeviceId.length > 0 },
    { label: 'Agent selected', ok: agentSlug.length > 0 },
    { label: 'Model selected', ok: !!selectedProviderId && !!selectedModelId },
    { label: 'Prompt is not empty', ok: prompt.trim().length > 0 },
  ]

  useEffect(() => {
    if (!selectedProviderId && availableProviders.length > 0) {
      const def = availableProviders.find((provider) => provider.is_default) ?? availableProviders[0]
      setSelectedProviderId(def.id)
      return
    }
    if (selectedProviderId && availableProviders.length > 0 && !availableProviders.some((provider) => provider.id === selectedProviderId)) {
      const def = availableProviders.find((provider) => provider.is_default) ?? availableProviders[0]
      setSelectedProviderId(def.id)
      setSelectedModelId('')
    }
  }, [availableProviders, selectedProviderId])

  useEffect(() => {
    if (!selectedProviderId || Object.prototype.hasOwnProperty.call(modelsByProvider, selectedProviderId)) return
    let cancelled = false
    setLoadingModelsFor(selectedProviderId)
    fetchProviderModels(selectedProviderId)
      .then((models) => {
        if (!cancelled) setModelsByProvider((current) => ({ ...current, [selectedProviderId]: models }))
      })
      .catch(() => {
        if (!cancelled) setModelsByProvider((current) => ({ ...current, [selectedProviderId]: [] }))
      })
      .finally(() => {
        if (!cancelled) setLoadingModelsFor((current) => (current === selectedProviderId ? null : current))
      })
    return () => { cancelled = true }
  }, [modelsByProvider, selectedProviderId])

  useEffect(() => {
    if (!selectedProviderId || !Object.prototype.hasOwnProperty.call(modelsByProvider, selectedProviderId)) return
    if (selectedModelId && selectedModels.some((model) => model.model_id === selectedModelId)) return
    const def = selectedModels.find((model) => model.is_default) ?? selectedModels[0]
    setSelectedModelId(def?.model_id ?? '')
  }, [modelsByProvider, selectedModelId, selectedModels, selectedProviderId])

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
        model_override: executionTarget === 'cloud' ? modelOverride : undefined,
        configuration: {
          ...job?.configuration,
          ...(agentSlug ? { agent_slug: agentSlug } : {}),
          ...(selectedProviderId ? { provider_setting_id: selectedProviderId } : {}),
          ...(selectedModelId ? { model_id: selectedModelId } : {}),
        },
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
          <div>
            <h2>{isEdit ? 'Edit scheduled job' : 'New scheduled job'}</h2>
            <p>{isEdit ? 'Update cadence, agent, and execution settings.' : 'Configure the automation run before creating it.'}</p>
          </div>
          <button className="sch-modal-close" onClick={onClose}><WindowCloseIcon size={13} /></button>
        </div>
        <form className="sch-modal-body" onSubmit={(e) => void handleSubmit(e)}>
          <div className="sch-modal-main">
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
            <label>Agent</label>
            <select value={agentSlug} onChange={(e) => setAgentSlug(e.target.value)} required>
              <option value="" disabled>Select an agent...</option>
              {agents.map((agent) => (
                <option key={agent.slug} value={agent.slug}>
                  {agent.name || agent.slug} ({agent.source})
                </option>
              ))}
            </select>
            {selectedAgent && (
              <div className="sch-field-hint">
                {selectedAgent.model || 'Default model'} / {selectedAgent.permission_mode || 'default permissions'}
              </div>
            )}
          </div>

          <div className="sch-field">
            <label>Trigger</label>
            <div className="sch-segmented">
              {(['cron', 'interval', 'once'] as TriggerType[]).map((type) => (
                <button
                  key={type}
                  type="button"
                  className={`sch-segment ${triggerType === type ? 'active' : ''}`}
                  onClick={() => setTriggerType(type)}
                >
                  {type === 'cron' ? 'Cron' : type === 'interval' ? 'Interval' : 'Once'}
                </button>
              ))}
            </div>
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
            <div className="sch-target-grid">
              <button type="button" className={`sch-target-card ${executionTarget === 'cloud' ? 'active' : ''}`} onClick={() => setExecutionTarget('cloud')}>
                <span className="sch-target-radio" />
                <span className="sch-target-copy">
                  <span>Cloud</span>
                  <small>Seshat Server credentials and infrastructure</small>
                </span>
              </button>
              <button type="button" className={`sch-target-card ${executionTarget === 'device' ? 'active' : ''}`} onClick={() => setExecutionTarget('device')}>
                <span className="sch-target-radio" />
                <span className="sch-target-copy">
                  <span>Device</span>
                  <small>A specific paired local machine</small>
                </span>
              </button>
            </div>
          </div>

          <div className="sch-field-grid">
            <div className="sch-field">
              <label>Provider</label>
              <select
                value={selectedProviderId}
                onChange={(e) => { setSelectedProviderId(e.target.value); setSelectedModelId('') }}
                disabled={providersLoading || availableProviders.length === 0}
                required
              >
                <option value="" disabled>{providersLoading ? 'Loading providers...' : 'Select a provider...'}</option>
                {availableProviders.map((provider) => (
                  <option key={provider.id} value={provider.id}>{provider.name}</option>
                ))}
              </select>
              {availableProviders.length === 0 && !providersLoading && (
                <div className="sch-field-hint">
                  {executionTarget === 'cloud'
                    ? 'No configured cloud provider is available for this user.'
                    : 'No local provider configuration is available.'}
                </div>
              )}
            </div>
            <div className="sch-field">
              <label>Model</label>
              <select
                value={selectedModelId}
                onChange={(e) => setSelectedModelId(e.target.value)}
                disabled={!selectedProviderId || loadingModelsFor === selectedProviderId || selectedModels.length === 0}
                required
              >
                <option value="" disabled>
                  {loadingModelsFor === selectedProviderId ? 'Loading models...' : 'Select a model...'}
                </option>
                {selectedModels.map((model) => (
                  <option key={model.model_id} value={model.model_id}>
                    {model.display_name || model.model_id}
                  </option>
                ))}
              </select>
              {selectedProviderId && loadingModelsFor !== selectedProviderId && selectedModels.length === 0 && (
                <div className="sch-field-hint">No models found for this provider.</div>
              )}
            </div>
          </div>
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
            <textarea className="sch-prompt-editor" value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={7} required />
            {!isEdit && (
              <button type="button" className="sch-graph-link" onClick={() => navigate('/automation/new')}>
                Build with a visual graph instead →
              </button>
            )}
          </div>
          </div>

          <aside className="sch-modal-summary">
            <div className="sch-summary-card">
              <div className="sch-summary-title">Summary</div>
              <dl className="sch-summary-list">
                <div><dt>Status</dt><dd>Active</dd></div>
                <div><dt>Schedule</dt><dd>{scheduleSummary}</dd></div>
                <div><dt>Target</dt><dd>{executionTarget}</dd></div>
                <div><dt>Agent</dt><dd>{selectedAgent?.name || agentSlug || 'Not selected'}</dd></div>
                <div><dt>Provider</dt><dd>{selectedProvider?.name || 'Default'}</dd></div>
                <div><dt>Model</dt><dd>{selectedModel?.display_name || selectedModelId || selectedAgent?.model || 'Default'}</dd></div>
              </dl>
            </div>
            <div className="sch-summary-card">
              <div className="sch-summary-title">Validation</div>
              <div className="sch-validation-list">
                {validationItems.map((item) => (
                  <div key={item.label} className={`sch-validation-row ${item.ok ? 'ok' : ''}`}>
                    <CheckOne size={11} />
                    <span>{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </aside>

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
  display: flex; align-items: center; gap: var(--space-3);
  padding: 0 17px; height: 52px; flex-shrink: 0;
  background: var(--color-bg);
  border-bottom: 1px solid var(--color-border-subtle);
}
.sch-back-chip {
  display: inline-flex; align-items: center; gap: var(--space-2);
  padding: var(--space-2) 7px; border-radius: var(--radius-sm); border: none;
  background: var(--color-hover); color: var(--color-text-secondary);
  font-size: var(--font-size-2xs); font-weight: 600; cursor: pointer;
}
.sch-back-chip:hover { background: var(--color-border); color: var(--color-text); }
.sch-topbar-sep { color: var(--color-text-muted); font-size: var(--font-size-sm); }
.sch-topbar-title { font-size: var(--font-size-base); font-weight: 700; }
.sch-new-btn {
  display: inline-flex; align-items: center; gap: var(--space-3);
  padding: var(--space-3) var(--space-5); border-radius: var(--radius-sm); border: none;
  background: var(--color-cta); color: white;
  font-size: var(--font-size-2xs); font-weight: 700; cursor: pointer;
}
.sch-new-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.sch-new-btn--ghost {
  margin-left: auto;
  background: transparent; color: var(--color-text-secondary);
  border: 1px solid var(--color-border);
}
.sch-new-btn--ghost:hover:not(:disabled) { background: var(--color-hover); color: var(--color-text); }

.sch-body { flex: 1; overflow: hidden; padding: var(--space-8) 22px; }
.sch-layout {
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
  gap: var(--font-size-md);
}
.sch-main-panel {
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
}

.sch-loading, .sch-error-banner {
  padding: var(--space-5) 11px; border-radius: var(--radius-md); font-size: var(--font-size-xs);
}
.sch-loading { color: var(--color-text-muted); }
.sch-error-banner {
  background: rgba(var(--color-error-rgb), 0.08); border: 1px solid rgba(var(--color-error-rgb), 0.25);
  color: var(--color-error); margin-bottom: var(--space-7);
}
.sch-notice {
  display: flex; align-items: center; gap: var(--space-3);
  padding: var(--space-4) 11px; border-radius: var(--radius-md); margin-bottom: var(--space-7);
  background: rgba(239, 124, 47, 0.08); border: 1px solid rgba(239, 124, 47, 0.25);
  color: var(--color-accent); font-size: var(--font-size-xs);
}

.sch-empty {
  display: flex; flex-direction: column; align-items: center; text-align: center;
  gap: 9px; max-width: 420px; margin: 60px auto 0; color: var(--color-text-muted);
}
.sch-empty h2 { font-size: var(--font-size-lg); font-weight: 700; color: var(--color-text); margin: var(--space-2) 0 0; }
.sch-empty p { font-size: var(--font-size-xs); line-height: 1.6; margin: 0; }
.sch-empty-cta {
  margin-top: var(--space-4);
  display: inline-flex; align-items: center; gap: var(--space-3);
  padding: var(--space-3) 11px; border-radius: var(--radius-sm); border: none;
  background: var(--color-cta); color: white; font-size: var(--font-size-2xs); font-weight: 700; cursor: pointer;
}

.sch-job-list { display: flex; flex-direction: column; gap: var(--space-4); }
.sch-job-card {
  border: 1px solid var(--color-border-subtle); border-radius: var(--radius-lg);
  background: var(--color-bg);
}
.sch-job-card.selected {
  border-color: rgba(239, 124, 47, 0.55);
  box-shadow: inset 3px 0 0 var(--color-cta);
}
.sch-job-row { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-6); padding: 11px 13px; }
.sch-job-row { cursor: pointer; }
.sch-job-main { display: flex; flex-direction: column; gap: var(--space-3); min-width: 0; }
.sch-job-name-row { display: flex; align-items: center; gap: var(--space-3); }
.sch-job-name { font-size: var(--font-size-sm); font-weight: 700; }
.sch-job-desc { font-size: var(--font-size-2xs); color: var(--color-text-muted); }
.sch-job-meta { display: flex; gap: 11px; font-size: var(--font-size-2xs); color: var(--color-text-muted); flex-wrap: wrap; }

.sch-badge {
  font-size: var(--font-size-2xs); font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase;
  padding: 2px var(--space-3); border-radius: var(--radius-full); flex-shrink: 0;
}
.sch-badge--active { background: rgba(var(--color-success-rgb), 0.12); color: var(--color-success); }
.sch-badge--paused { background: rgba(148, 163, 184, 0.15); color: var(--color-text-muted); }
.sch-badge--target { background: rgba(239, 124, 47, 0.1); color: var(--color-accent); }
.sch-badge--graph { background: rgba(76, 154, 255, 0.14); color: #4C9AFF; }
.sch-badge--run-completed { background: rgba(var(--color-success-rgb), 0.12); color: var(--color-success); }
.sch-badge--run-failed { background: rgba(var(--color-error-rgb), 0.1); color: var(--color-error); }
.sch-badge--run-cancelled { background: rgba(148, 163, 184, 0.15); color: var(--color-text-muted); }
.sch-badge--run-queued, .sch-badge--run-claimed, .sch-badge--run-running { background: rgba(var(--color-info-rgb), 0.12); color: var(--color-info); }

.sch-job-actions { display: flex; gap: var(--space-2); flex-shrink: 0; }
.sch-icon-btn {
  width: 30px; height: 30px; border-radius: var(--radius-sm); border: 1px solid var(--color-border-subtle);
  background: transparent; color: var(--color-text-muted); display: flex; align-items: center; justify-content: center;
  cursor: pointer;
}
.sch-icon-btn:hover:not(:disabled) { background: var(--color-hover); color: var(--color-text); }
.sch-icon-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.sch-icon-btn--danger:hover:not(:disabled) { background: rgba(var(--color-error-rgb), 0.1); color: var(--color-error); }

.sch-runs-panel {
  border-top: 1px solid var(--color-border-subtle); padding: 7px 13px var(--space-5);
  display: flex; flex-direction: column; gap: var(--space-3);
}
.sch-runs-loading, .sch-runs-empty { font-size: var(--font-size-2xs); color: var(--color-text-muted); }
.sch-run-row { display: flex; align-items: center; gap: var(--space-4); font-size: var(--font-size-2xs); }
.sch-run-time { color: var(--color-text-muted); }
.sch-run-error { color: var(--color-error); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.sch-confirm-row {
  border-top: 1px solid var(--color-border-subtle); padding: 7px 13px;
  display: flex; align-items: center; justify-content: space-between; gap: 9px;
  font-size: var(--font-size-2xs); color: var(--color-text);
}
.sch-confirm-actions { display: flex; gap: var(--space-3); flex-shrink: 0; }
.sch-confirm-cancel {
  background: transparent; border: 1px solid var(--color-border-subtle); color: var(--color-text-muted);
  padding: var(--space-2) var(--space-4); border-radius: var(--radius-sm); font-size: var(--font-size-2xs); cursor: pointer;
}
.sch-confirm-delete {
  background: rgba(var(--color-error-rgb), 0.12); border: 1px solid rgba(var(--color-error-rgb), 0.3); color: var(--color-error);
  padding: var(--space-2) var(--space-4); border-radius: var(--radius-sm); font-size: var(--font-size-2xs); font-weight: 600; cursor: pointer;
}

.sch-planner {
  min-width: 0;
  min-height: 0;
  border: 1px solid var(--color-border-subtle);
  border-radius: 0;
  background: var(--color-bg);
  padding: var(--font-size-md);
  display: flex;
  flex-direction: column;
  gap: var(--font-size-md);
  overflow: hidden;
}
.sch-planner-head {
  display: flex;
  align-items: flex-start;
  gap: 11px;
}
.sch-planner-head-copy {
  flex: 1;
  min-width: 0;
}
.sch-planner-settings-btn {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border-subtle);
  background: transparent;
  color: var(--color-text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.sch-planner-settings-btn:hover {
  background: var(--color-hover);
  color: var(--color-text);
}
.sch-planner-settings-modal {
  background: var(--color-surface); border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-xl); width: min(420px, calc(100vw - 48px));
  display: flex; flex-direction: column; overflow: hidden;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5);
}
.sch-planner-settings-body {
  padding: 15px 18px;
  display: flex;
  flex-direction: column;
  gap: 13px;
}
.sch-planner-icon {
  width: 36px;
  height: 36px;
  border-radius: 9px;
  border: 1px solid var(--color-border-subtle);
  background: var(--color-surface);
  color: var(--color-cta);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.sch-planner h2 {
  margin: 0 0 var(--space-2);
  font-size: var(--font-size-md);
  font-weight: 800;
}
.sch-planner p {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
  line-height: 1.5;
}

.sch-planner-thread {
  flex: 1;
  min-height: 160px;
  overflow-y: auto;
  padding-top: var(--space-2);
}
.sch-planner-message {
  display: flex;
  align-items: flex-start;
  gap: var(--space-4);
}
.sch-planner-message-icon {
  width: 24px;
  height: 24px;
  border-radius: 7px;
  color: var(--color-cta);
  background: rgba(239, 124, 47, 0.08);
  border: 1px solid rgba(239, 124, 47, 0.22);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.sch-planner-bubble {
  max-width: 260px;
  padding: var(--space-5) 11px;
  border-radius: 9px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
  line-height: 1.5;
}
.sch-planner-suggestions {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
.sch-planner-section-label {
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
  font-weight: 700;
}
.sch-planner-chip {
  min-height: 38px;
  padding: var(--space-4) var(--space-5);
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text-secondary);
  display: flex;
  align-items: center;
  gap: var(--space-4);
  cursor: pointer;
  font-size: var(--font-size-sm);
  font-weight: 650;
  text-align: left;
}
.sch-planner-chip:hover:not(:disabled) {
  border-color: rgba(239, 124, 47, 0.45);
  color: var(--color-text);
  background: rgba(239, 124, 47, 0.06);
}
.sch-planner-chip svg {
  color: var(--color-cta);
}
.sch-planner-chip:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.sch-planner-disabled {
  padding: var(--space-5);
  border-radius: var(--radius-md);
  border: 1px solid rgba(239, 124, 47, 0.25);
  background: rgba(239, 124, 47, 0.07);
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
  line-height: 1.5;
}
.sch-planner-inputbar {
  margin-top: auto;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 42px;
  gap: var(--space-4);
  padding-top: var(--space-6);
  border-top: 1px solid var(--color-border-subtle);
}
.sch-planner-inputbar input {
  min-width: 0;
  height: 42px;
  border-radius: 9px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text);
  padding: 0 var(--space-6);
  outline: none;
  font-family: inherit;
  font-size: var(--font-size-sm);
}
.sch-planner-inputbar input:focus {
  border-color: var(--color-primary);
}
.sch-planner-inputbar input:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.sch-planner-inputbar button {
  width: 42px;
  height: 42px;
  border: none;
  border-radius: 9px;
  background: var(--color-cta);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.sch-planner-inputbar button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.sch-inspector {
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  border: 1px solid var(--color-border-subtle);
  background: var(--color-bg);
  padding: var(--font-size-md);
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}
.sch-inspector-header {
  display: flex;
  justify-content: space-between;
  gap: var(--space-5);
}
.sch-inspector-kicker {
  color: var(--color-text-muted);
  font-size: var(--font-size-2xs);
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.sch-inspector h2 {
  margin: var(--space-3) 0 var(--space-2);
  display: flex;
  align-items: center;
  gap: var(--space-4);
  font-size: var(--font-size-lg);
  line-height: 1.25;
}
.sch-inspector p {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
  line-height: 1.45;
}
.sch-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-text-muted);
  flex-shrink: 0;
}
.sch-status-dot.running,
.sch-status-dot.claimed,
.sch-status-dot.queued { background: var(--color-cta); }
.sch-status-dot.completed,
.sch-status-dot.active { background: var(--color-success); }
.sch-status-dot.failed { background: var(--color-error); }
.sch-inspector-close {
  width: 28px;
  height: 28px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.sch-inspector-close:hover { background: var(--color-hover); color: var(--color-text); }
.sch-inspector-actions {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-3);
}
.sch-inspector-actions button {
  min-height: 32px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  font-size: var(--font-size-xs);
  font-weight: 700;
  cursor: pointer;
}
.sch-inspector-actions button:hover { border-color: rgba(239, 124, 47, 0.45); color: var(--color-text); }
.sch-inspector-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  overflow: hidden;
}
.sch-inspector-stats div {
  padding: 9px;
  border-left: 1px solid var(--color-border-subtle);
}
.sch-inspector-stats div:first-child { border-left: none; }
.sch-inspector-stats span {
  display: block;
  color: var(--color-text-muted);
  font-size: var(--font-size-2xs);
}
.sch-inspector-stats strong {
  display: block;
  color: var(--color-text);
  font-size: var(--font-size-xs);
  margin-top: var(--space-2);
}
.sch-inspector-card {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  overflow: hidden;
}
.sch-inspector-section-title {
  padding: var(--space-5) 11px;
  border-bottom: 1px solid var(--color-border-subtle);
  color: var(--color-text);
  font-size: var(--font-size-sm);
  font-weight: 800;
}
.sch-plan-list { display: flex; flex-direction: column; }
.sch-plan-step {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr) auto;
  gap: 9px;
  align-items: center;
  padding: 9px 11px;
  border-top: 1px solid var(--color-border-subtle);
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
}
.sch-plan-step:first-child { border-top: none; }
.sch-plan-step span {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-border);
  color: var(--color-text);
  font-size: var(--font-size-2xs);
  font-weight: 800;
}
.sch-plan-step.done span { background: rgba(var(--color-success-rgb), 0.18); color: var(--color-success); }
.sch-plan-step.running span { background: rgba(239, 124, 47, 0.18); color: var(--color-cta); }
.sch-plan-step.failed span { background: rgba(var(--color-error-rgb), 0.16); color: var(--color-error); }
.sch-plan-step.completed span { background: rgba(var(--color-success-rgb), 0.18); color: var(--color-success); }
.sch-plan-step.in_progress span { background: rgba(239, 124, 47, 0.18); color: var(--color-cta); }
.sch-plan-step strong {
  color: var(--color-text-muted);
  font-size: var(--font-size-2xs);
  text-transform: capitalize;
}
.sch-inspector-tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  overflow: hidden;
}
.sch-inspector-tabs button {
  height: 34px;
  border: none;
  border-left: 1px solid var(--color-border-subtle);
  background: var(--color-surface);
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
  font-weight: 800;
  cursor: pointer;
}
.sch-inspector-tabs button:first-child { border-left: none; }
.sch-inspector-tabs button.active {
  color: var(--color-cta);
  background: rgba(239, 124, 47, 0.08);
  box-shadow: inset 0 -2px 0 var(--color-cta);
}
.sch-inspector-tabbody {
  min-height: 160px;
}
.sch-activity-row {
  padding: 9px 11px;
  border-top: 1px solid var(--color-border-subtle);
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--space-4);
  font-size: var(--font-size-xs);
}
.sch-activity-row:first-child { border-top: none; }
.sch-activity-row span { color: var(--color-text-muted); }
.sch-activity-row strong { color: var(--color-text); }
.sch-activity-row p {
  grid-column: 1 / -1;
  color: var(--color-error);
  margin: 0;
}
.sch-output-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-5);
  padding: 9px var(--space-5);
  border-top: 1px solid var(--color-border-subtle);
}
.sch-output-row:first-child { border-top: none; }
.sch-output-row strong {
  display: block;
  font-size: var(--font-size-xs);
}
.sch-output-row span {
  display: block;
  margin-top: 2px;
  color: var(--color-text-muted);
  font-size: var(--font-size-2xs);
}
.sch-output-actions {
  display: flex;
  gap: var(--space-2);
}
.sch-output-actions button {
  width: 26px;
  height: 26px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.sch-output-actions button:hover { background: var(--color-hover); color: var(--color-text); }
.sch-output-empty,
.sch-output-note {
  padding: var(--space-5) 11px;
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
  line-height: 1.5;
}
.sch-output-note { border-top: 1px solid var(--color-border-subtle); }

/* Modal */
.sch-modal-backdrop {
  position: fixed; inset: 0; z-index: 900;
  display: flex; align-items: center; justify-content: center; padding: 56px 24px;
  background: rgba(0, 0, 0, 0.55); backdrop-filter: blur(6px);
}
.sch-modal {
  background: var(--color-surface); border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-xl); width: min(1040px, calc(100vw - 48px)); max-height: min(820px, calc(100vh - 128px));
  display: flex; flex-direction: column; overflow: hidden;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5);
}
.sch-modal-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 13px 18px; border-bottom: 1px solid var(--color-border-subtle);
}
.sch-modal-header h2 { font-size: var(--font-size-md); margin: 0; font-weight: 700; }
.sch-modal-header p { margin: var(--space-2) 0 0; font-size: var(--font-size-xs); color: var(--color-text-muted); }
.sch-modal-close { background: none; border: none; color: var(--color-text-muted); cursor: pointer; display: flex; }
.sch-modal-body {
  padding: 0;
  overflow: hidden;
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 330px;
}
.sch-modal-main {
  min-height: 0;
  overflow-y: auto;
  padding: 15px 18px;
  display: flex;
  flex-direction: column;
  gap: 13px;
}
.sch-modal-summary {
  border-left: 1px solid var(--color-border-subtle);
  background: rgba(255, 255, 255, 0.018);
  padding: 15px;
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  overflow-y: auto;
}
.sch-summary-card {
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-md);
  background: rgba(255, 255, 255, 0.025);
  padding: var(--space-6);
}
.sch-summary-title {
  font-size: var(--font-size-xs);
  font-weight: 700;
  color: var(--color-text);
  margin-bottom: var(--space-5);
}
.sch-summary-list {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0;
}
.sch-summary-list div {
  display: flex;
  justify-content: space-between;
  gap: var(--space-6);
  padding: var(--space-4) 0;
  border-top: 1px solid var(--color-border-subtle);
}
.sch-summary-list div:first-child { border-top: none; }
.sch-summary-list dt { font-size: var(--font-size-2xs); color: var(--color-text-muted); }
.sch-summary-list dd {
  margin: 0;
  font-size: var(--font-size-xs);
  color: var(--color-text);
  text-align: right;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sch-validation-list { display: flex; flex-direction: column; gap: var(--space-4); }
.sch-validation-row {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
}
.sch-validation-row.ok { color: var(--color-success); }
.sch-field-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 11px; }
.sch-field { display: flex; flex-direction: column; gap: var(--space-3); }
.sch-field label { font-size: var(--font-size-2xs); font-weight: 600; color: var(--color-text-secondary); }
.sch-field input, .sch-field select, .sch-field textarea {
  background: var(--color-bg); border: 1px solid var(--color-border);
  padding: var(--space-3) var(--space-4); border-radius: var(--radius-md); color: var(--color-text); font-size: var(--font-size-xs);
  outline: none; font-family: inherit; resize: vertical;
}
.sch-field input:focus, .sch-field select:focus, .sch-field textarea:focus { border-color: var(--color-primary); }
.sch-field-hint { font-size: var(--font-size-2xs); color: var(--color-text-muted); }
.sch-segmented {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  overflow: hidden;
  background: var(--color-bg);
}
.sch-segment {
  height: 31px;
  border: none;
  border-left: 1px solid var(--color-border-subtle);
  background: transparent;
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
  cursor: pointer;
}
.sch-segment:first-child { border-left: none; }
.sch-segment.active {
  background: rgba(239, 124, 47, 0.12);
  color: var(--color-accent);
  box-shadow: inset 0 0 0 1px rgba(239, 124, 47, 0.45);
}
.sch-target-grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-5); }
.sch-target-card {
  min-height: 72px;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-md);
  background: var(--color-bg);
  color: var(--color-text);
  display: flex;
  align-items: flex-start;
  gap: var(--space-5);
  padding: 11px;
  cursor: pointer;
  text-align: left;
}
.sch-target-card.active {
  border-color: var(--color-accent);
  background: rgba(239, 124, 47, 0.06);
}
.sch-target-radio {
  width: 13px;
  height: 13px;
  border-radius: 50%;
  border: 1px solid var(--color-border);
  margin-top: 2px;
  flex-shrink: 0;
}
.sch-target-card.active .sch-target-radio {
  border-color: var(--color-accent);
  box-shadow: inset 0 0 0 3px var(--color-bg);
  background: var(--color-accent);
}
.sch-target-copy { display: flex; flex-direction: column; gap: var(--space-2); min-width: 0; }
.sch-target-copy span { font-size: var(--font-size-sm); font-weight: 700; }
.sch-target-copy small { font-size: var(--font-size-2xs); line-height: 1.45; color: var(--color-text-muted); }
.sch-prompt-editor {
  min-height: 150px;
  font-family: var(--font-mono, ui-monospace, monospace);
  line-height: 1.55;
}
.sch-graph-link {
  align-self: flex-start;
  margin-top: 6px;
  padding: 0;
  border: none;
  background: none;
  color: var(--color-cta);
  font-size: var(--font-size-xs);
  font-weight: 700;
  cursor: pointer;
}
.sch-graph-link:hover {
  text-decoration: underline;
}
.sch-modal-footer {
  grid-column: 1 / -1;
  display: flex;
  justify-content: flex-end;
  gap: var(--space-4);
  padding: 13px 18px;
  border-top: 1px solid var(--color-border-subtle);
  background: var(--color-surface);
}
.sch-modal-btn-cancel {
  background: var(--color-bg); border: 1px solid var(--color-border); color: var(--color-text);
  padding: var(--space-3) 13px; border-radius: var(--radius-md); font-weight: 700; cursor: pointer; font-size: var(--font-size-xs);
}
.sch-modal-btn-submit {
  background: var(--color-cta); color: white; border: none;
  padding: var(--space-3) 13px; border-radius: var(--radius-md); font-weight: 700; cursor: pointer; font-size: var(--font-size-xs);
}
.sch-modal-btn-submit:disabled { opacity: 0.5; cursor: not-allowed; }

@media (max-width: 1120px) {
  .sch-body { overflow-y: auto; }
  .sch-layout { height: auto; grid-template-columns: 1fr; }
  .sch-main-panel { overflow: visible; }
  .sch-planner { min-height: 280px; }
}

.sch-layout--inspector {
  grid-template-columns: minmax(420px, 1fr) minmax(620px, 0.92fr);
}
.sch-layout--planner {
  grid-template-columns: minmax(0, 1fr) 420px;
}
.sch-layout--planner .sch-planner {
  align-self: stretch;
  height: 100%;
  min-height: 0;
  max-height: none;
}

.sch-inspector {
  padding: 0;
  gap: 0;
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--color-bg) 92%, #05080c);
  box-shadow: inset 1px 0 0 var(--color-border-subtle);
}

.sch-inspector-topstrip {
  min-height: 54px;
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: var(--space-5);
  border-bottom: 1px solid var(--color-border-subtle);
  background: color-mix(in srgb, var(--color-bg) 88%, #070b10);
}
.sch-inspector-titleline {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--space-5);
  padding: 0 var(--font-size-md);
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}
.sch-inspector-titleline strong {
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-text);
  font-size: var(--font-size-sm);
}
.sch-mini-pill {
  display: inline-flex;
  align-items: center;
  height: 22px;
  padding: 0 var(--space-4);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-2xs);
  font-weight: 800;
  text-transform: capitalize;
}
.sch-mini-pill.running {
  color: var(--color-success);
  background: rgba(var(--color-success-rgb), 0.12);
  border: 1px solid rgba(var(--color-success-rgb), 0.18);
}
.sch-mini-pill.target {
  color: #8bbcff;
  background: rgba(70, 130, 220, 0.12);
  border: 1px solid rgba(70, 130, 220, 0.22);
}
.sch-inspector-icon-actions {
  display: flex;
  align-items: stretch;
  border-left: 1px solid var(--color-border-subtle);
}
.sch-inspector-icon-actions button {
  width: 54px;
  border: 0;
  border-left: 1px solid var(--color-border-subtle);
  background: transparent;
  color: var(--color-text-secondary);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  font-size: 9px;
  font-weight: 700;
  cursor: pointer;
}
.sch-inspector-icon-actions button:hover {
  background: var(--color-hover);
  color: var(--color-text);
}

.sch-inspector-metarow {
  display: grid;
  grid-template-columns: 1.2fr 1fr 0.75fr;
  gap: 0;
  border-bottom: 1px solid var(--color-border-subtle);
  background: color-mix(in srgb, var(--color-bg) 94%, #10151e);
}
.sch-inspector-metarow div {
  min-width: 0;
  padding: var(--space-5) var(--font-size-md);
  border-left: 1px solid var(--color-border-subtle);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.sch-inspector-metarow div:first-child {
  border-left: 0;
}
.sch-inspector-metarow span {
  color: var(--color-text-muted);
  font-size: var(--font-size-2xs);
}
.sch-inspector-metarow strong {
  color: var(--color-text);
  font-size: var(--font-size-xs);
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sch-inspector-tabs.wide {
  display: flex;
  border: 0;
  border-bottom: 1px solid var(--color-border-subtle);
  border-radius: 0;
  background: transparent;
  overflow: visible;
}
.sch-inspector-tabs.wide button {
  width: 118px;
  height: 48px;
  border: 0;
  background: transparent;
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
}
.sch-inspector-tabs.wide button.active {
  color: var(--color-text);
  background: transparent;
  box-shadow: inset 0 -2px 0 var(--color-cta);
}

.sch-plan-split {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(260px, 0.9fr);
  overflow: hidden;
}
.sch-plan-pane,
.sch-activity-output-preview {
  min-width: 0;
  overflow-y: auto;
  padding: 18px;
}
.sch-activity-output-preview {
  border-left: 1px solid var(--color-border-subtle);
  background: rgba(0, 0, 0, 0.08);
}
.sch-plan-heading {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin-bottom: var(--font-size-md);
  color: var(--color-text);
  font-size: var(--font-size-md);
  font-weight: 800;
}
.sch-plan-heading span {
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
  font-weight: 500;
}
.sch-plan-list.visual {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}
.sch-plan-step.visual {
  grid-template-columns: 34px minmax(0, 1fr);
  min-height: 70px;
  padding: var(--space-6);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--color-surface) 80%, #061018);
}
.sch-plan-step.visual.running {
  border-color: rgba(239, 124, 47, 0.8);
  box-shadow: inset 3px 0 0 var(--color-cta);
}
.sch-plan-step.visual.in_progress {
  border-color: rgba(239, 124, 47, 0.8);
  box-shadow: inset 3px 0 0 var(--color-cta);
}
.sch-plan-step.visual span {
  width: 28px;
  height: 28px;
  background: rgba(148, 163, 184, 0.18);
}
.sch-plan-step.visual.done span {
  background: rgba(var(--color-success-rgb), 0.2);
}
.sch-plan-step.visual.completed span {
  background: rgba(var(--color-success-rgb), 0.2);
}
.sch-plan-step.visual.running span {
  background: rgba(239, 124, 47, 0.22);
}
.sch-plan-step.visual.in_progress span {
  background: rgba(239, 124, 47, 0.22);
}
.sch-plan-step.visual strong {
  display: block;
  color: var(--color-text);
  font-size: var(--font-size-sm);
  text-transform: none;
}
.sch-plan-step.visual small {
  display: block;
  margin-top: var(--space-4);
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
  text-transform: capitalize;
}
.sch-plan-step.visual.running small {
  color: var(--color-cta);
}
.sch-plan-step.visual.in_progress small {
  color: var(--color-cta);
}
.sch-plan-step.visual em {
  color: var(--color-text-muted);
  font-style: normal;
  font-size: var(--font-size-xs);
}
.sch-plan-step.visual p {
  margin: 7px 0 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
  line-height: 1.45;
}
.sch-activity-list,
.sch-output-list {
  margin: 18px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  overflow: hidden;
  background: color-mix(in srgb, var(--color-surface) 78%, #061018);
}
.sch-inspector-empty {
  min-height: 210px;
  margin: 18px;
  padding: 24px;
  border: 1px dashed rgba(239, 124, 47, 0.28);
  border-radius: var(--radius-md);
  background:
    linear-gradient(135deg, rgba(239, 124, 47, 0.08), transparent 45%),
    color-mix(in srgb, var(--color-surface) 80%, #061018);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-5);
  text-align: center;
}
.sch-inspector-empty > span {
  width: 38px;
  height: 38px;
  border-radius: var(--radius-md);
  border: 1px solid rgba(239, 124, 47, 0.28);
  background: rgba(239, 124, 47, 0.1);
  color: var(--color-cta);
  display: flex;
  align-items: center;
  justify-content: center;
}
.sch-inspector-empty strong {
  color: var(--color-text);
  font-size: var(--font-size-md);
}
.sch-inspector-empty p {
  max-width: 360px;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
  line-height: 1.55;
}
.sch-activity-output-preview p {
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
  line-height: 1.65;
  white-space: pre-wrap;
}
.sch-artifact-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  margin-top: 18px;
}
.sch-artifact-list button {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  min-height: 38px;
  padding: 0 var(--space-5);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-text);
  cursor: pointer;
}
.sch-artifact-list button span {
  margin-left: auto;
  color: var(--color-text-muted);
  font-size: var(--font-size-2xs);
}

@media (max-width: 1400px) {
  .sch-layout--inspector { grid-template-columns: minmax(360px, 1fr) minmax(520px, 0.95fr); }
  .sch-layout--planner { grid-template-columns: minmax(0, 1fr) 380px; }
  .sch-plan-split { grid-template-columns: 1fr; overflow-y: auto; }
  .sch-activity-output-preview { border-left: 0; border-top: 1px solid var(--color-border-subtle); }
}
`
