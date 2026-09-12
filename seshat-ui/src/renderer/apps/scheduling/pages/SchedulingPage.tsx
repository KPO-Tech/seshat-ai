import { useEffect, useState, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router'
import { Plus, Play, PauseOne, Edit, Delete, History, Caution, LinkCloud, Search, Magic } from '@icon-park/react'
import { api, ApiError } from '@/api/client'
import type { Agent } from '@/api/types'
import { useProviders } from '@/hooks/useProviders'
import { useProvidersStore } from '@/stores/providers'
import { OverflowMenu } from '@/components/ui/OverflowMenu'
import type { Device, InspectorTab, Job, JobDraft, JobParams, Run, SystemStatus } from '../api/types'
import { JobDraftCard } from '../components/JobDraftCard'
import { JobTemplateGallery } from '../components/JobTemplateGallery'
import { JobFormModal } from '../components/JobFormModal'
import { RunInspectorPanel } from '../components/RunInspectorPanel'
import { RUN_STATUS_LABEL, describeTrigger, draftAutomation } from '../lib/schedulingJobs'
import { templateToDraft, type JobTemplate } from '../lib/jobTemplates'
import '../styles/scheduling.css'

// Same three prompts previously shown inside AutomationPlannerPanel's
// dedicated side panel - now rendered under the search/ask bar instead.
const ASK_AGENT_SUGGESTIONS = [
  'Every Monday at 8, send a weekly operations report.',
  'Monitor failures daily and summarize anything urgent.',
  'Summarize new documents every Friday afternoon.',
]

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
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [runsByJob, setRunsByJob] = useState<Record<string, Run[]>>({})
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('activity')
  const [searchQuery, setSearchQuery] = useState('')
  const [askingAgent, setAskingAgent] = useState(false)
  const [pendingDraft, setPendingDraft] = useState<JobDraft | null>(null)
  const [draftError, setDraftError] = useState<string | null>(null)
  const [confirmingDraft, setConfirmingDraft] = useState(false)

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

  async function handleAskAgent(request: string) {
    if (!request.trim() || askingAgent) return
    setAskingAgent(true)
    setDraftError(null)
    setPendingDraft(null)
    try {
      const nextDraft = await draftAutomation(request, agents, providers)
      setPendingDraft(nextDraft)
    } catch (err) {
      setDraftError(err instanceof ApiError ? err.message : 'Failed to draft a job from this request.')
    } finally {
      setAskingAgent(false)
    }
  }

  // Unlike an agent-drafted job (LLM output, gets the lightweight
  // JobDraftCard confirmation before anything is editable), a template is
  // curated, deterministic content - no "did the model get this right"
  // check needed. Opens the same full form "New Job" uses (openDraftForm,
  // pre-filled), so every field - including agent/provider/model, which
  // JobDraftCard never exposed - is right there to review or change.
  function handleUseTemplate(template: JobTemplate) {
    openDraftForm(templateToDraft(template, agents, providers))
  }

  function handleEditDraft() {
    if (!pendingDraft) return
    openDraftForm(pendingDraft)
    setPendingDraft(null)
  }

  // Confirm creates the job directly from the drafted fields - no modal
  // round-trip. Mirrors JobFormModal's own handleSubmit transformation from
  // agent_slug/provider_setting_id/model_id into configuration/model_override,
  // since JobDraft carries those flat (see draftAutomation's doc comment).
  async function handleConfirmDraft() {
    if (!pendingDraft) return
    setConfirmingDraft(true)
    setDraftError(null)
    try {
      const providerObj = providers.find((item) => item.id === pendingDraft.provider_setting_id)
      const params: JobParams = {
        name: pendingDraft.name ?? '',
        description: pendingDraft.description,
        trigger_type: pendingDraft.trigger_type ?? 'cron',
        cron_expr: pendingDraft.cron_expr,
        interval_seconds: pendingDraft.interval_seconds,
        run_at: pendingDraft.run_at,
        webhook_method: pendingDraft.webhook_method,
        webhook_response_mode: pendingDraft.webhook_response_mode,
        execution_target: pendingDraft.execution_target ?? 'cloud',
        target_device_id: pendingDraft.target_device_id,
        model_override: providerObj && pendingDraft.model_id ? `${providerObj.provider}:${pendingDraft.model_id}` : undefined,
        configuration: {
          ...(pendingDraft.agent_slug ? { agent_slug: pendingDraft.agent_slug } : {}),
          ...(pendingDraft.provider_setting_id ? { provider_setting_id: pendingDraft.provider_setting_id } : {}),
          ...(pendingDraft.model_id ? { model_id: pendingDraft.model_id } : {}),
        },
        prompt: pendingDraft.prompt ?? '',
      }
      await api.post('/automation/jobs', params)
      setPendingDraft(null)
      setSearchQuery('')
      await loadJobs()
    } catch (err) {
      setDraftError(err instanceof ApiError ? err.message : 'Failed to create this job.')
    } finally {
      setConfirmingDraft(false)
    }
  }

  // Client-side name/description filter, same weight class and pattern as
  // apps/automation/components/TemplatesPanel.tsx's own search-over-a-small-
  // fetched-list filter.
  const filteredJobs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return jobs
    return jobs.filter((job) => job.name.toLowerCase().includes(q) || (job.description ?? '').toLowerCase().includes(q))
  }, [jobs, searchQuery])
  const activeJobs = useMemo(() => filteredJobs.filter((job) => job.status === 'active'), [filteredJobs])
  const inactiveJobs = useMemo(() => filteredJobs.filter((job) => job.status !== 'active'), [filteredJobs])

  return (
    <div className="sch-root">

      <header className="sch-topbar">
        <span className="sch-topbar-title">Scheduling</span>
        <button className="sch-new-btn" onClick={openCreateForm} disabled={systemStatus?.mode !== 'connected'}>
          <Plus size={11} /> New Job
        </button>
      </header>

      <div className="sch-body">
        <div className={`sch-layout ${selectedJobId ? 'sch-layout--inspector' : 'sch-layout--full'}`}>
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

            <div className="sch-search-row">
              <Search size={13} />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey && searchQuery.trim()) {
                    event.preventDefault()
                    void handleAskAgent(searchQuery)
                  }
                }}
                placeholder="Search jobs, or describe one to create..."
              />
              {searchQuery.trim().length > 0 && (
                <button
                  type="button"
                  className="sch-ask-agent-btn"
                  onClick={() => void handleAskAgent(searchQuery)}
                  disabled={askingAgent}
                >
                  <Magic size={12} /> {askingAgent ? 'Thinking…' : 'Ask agent'}
                </button>
              )}
            </div>

            {!searchQuery.trim() && !pendingDraft && (
              <div className="sch-suggestions-row">
                {ASK_AGENT_SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    className="sch-planner-chip"
                    disabled={askingAgent}
                    onClick={() => { setSearchQuery(suggestion); void handleAskAgent(suggestion) }}
                  >
                    <History size={12} />
                    <span>{suggestion.split(',')[0]}</span>
                  </button>
                ))}
              </div>
            )}

            {!pendingDraft && (
              <>
                <span className="app-section-label sch-template-grid-label">Or start from a template</span>
                <JobTemplateGallery onUse={handleUseTemplate} />
              </>
            )}

            {draftError && (
              <div className="sch-error-banner">
                {draftError}
                <button type="button" className="sch-search-clear" onClick={() => setDraftError(null)}>Dismiss</button>
              </div>
            )}

            {pendingDraft && (
              <JobDraftCard
                draft={pendingDraft}
                confirming={confirmingDraft}
                onEdit={handleEditDraft}
                onConfirm={() => void handleConfirmDraft()}
                onDismiss={() => setPendingDraft(null)}
              />
            )}

            {jobs.length === 0 && !forbidden ? (
              // Deliberately not the big centered sch-empty treatment used
              // below for "no search match" - the search bar, suggestions,
              // and template grid right above already fully cover "what do
              // I do here," so a second, taller empty-state block under
              // them would just be redundant dead space, not more guidance.
              <div className="sch-empty-inline">
                <History size={13} />
                <span>No scheduled jobs yet — describe one above, pick a template, or create one by hand.</span>
              </div>
            ) : (
              <>
                {filteredJobs.length === 0 ? (
                  <div className="sch-empty">
                    <Search size={23} />
                    <h2>No jobs match "{searchQuery}"</h2>
                    <p>Try a different name, clear the search, or click "Ask agent" to create one.</p>
                  </div>
                ) : (
                  <>
                    {activeJobs.length > 0 && (
                      <div className="sch-section">
                        <div className="sch-section-header">
                          <span className="sch-section-title">Active</span>
                          <span className="sch-section-count">{activeJobs.length}</span>
                        </div>
                        <div className="sch-job-grid">
                          {activeJobs.map((job) => (
                            <JobCard
                              key={job.id}
                              job={job}
                              selected={selectedJobId === job.id}
                              runningJobId={runningJobId}
                              pausingJobId={pausingJobId}
                              deletingJobId={deletingJobId}
                              onSelect={selectJob}
                              onRunNow={handleRunNow}
                              onTogglePaused={handleTogglePaused}
                              onEdit={openEditForm}
                              onRequestDelete={setDeletingJobId}
                              onCancelDelete={() => setDeletingJobId(null)}
                              onConfirmDelete={handleDelete}
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    {inactiveJobs.length > 0 && (
                      <div className="sch-section">
                        <div className="sch-section-header">
                          <span className="sch-section-title">Inactive</span>
                          <span className="sch-section-count">{inactiveJobs.length}</span>
                        </div>
                        <div className="sch-job-grid">
                          {inactiveJobs.map((job) => (
                            <JobCard
                              key={job.id}
                              job={job}
                              selected={selectedJobId === job.id}
                              runningJobId={runningJobId}
                              pausingJobId={pausingJobId}
                              deletingJobId={deletingJobId}
                              onSelect={selectJob}
                              onRunNow={handleRunNow}
                              onTogglePaused={handleTogglePaused}
                              onEdit={openEditForm}
                              onRequestDelete={setDeletingJobId}
                              onCancelDelete={() => setDeletingJobId(null)}
                              onConfirmDelete={handleDelete}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </>
        )}
          </section>

          {selectedJobId && (
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

// ─── Job card ───────────────────────────────────────────────────────────────
// Extracted so it can be rendered once per section (Active/Inactive) without
// duplicating the card JSX. Selecting the card (anywhere outside the run
// button/overflow menu, both of which stop propagation) opens the fuller
// RunInspectorPanel on the right - the same panel already used to power
// Plan/Activities/Outputs, so there's no separate inline run history here.
type JobCardProps = {
  job: Job
  selected: boolean
  runningJobId: string | null
  pausingJobId: string | null
  deletingJobId: string | null
  onSelect: (job: Job) => void
  onRunNow: (job: Job) => void
  onTogglePaused: (job: Job) => void
  onEdit: (job: Job) => void
  onRequestDelete: (jobId: string) => void
  onCancelDelete: () => void
  onConfirmDelete: (jobId: string) => void
}

function JobCard({
  job, selected, runningJobId, pausingJobId, deletingJobId,
  onSelect, onRunNow, onTogglePaused, onEdit, onRequestDelete, onCancelDelete, onConfirmDelete,
}: JobCardProps) {
  return (
    <div className={`sch-job-card ${selected ? 'selected' : ''}`}>
      <div className="sch-job-row" onClick={() => onSelect(job)} role="button" tabIndex={0}>
        <div className="sch-job-main">
          <div className="sch-job-name-row">
            <span className="sch-job-name">{job.name}</span>
          </div>
          {job.description && <div className="sch-job-desc">{job.description}</div>}
          <div className="sch-meta-pills">
            <span className="sch-meta-pill"><History size={11} /><span>{describeTrigger(job)}</span></span>
            <span className="sch-meta-pill"><LinkCloud size={11} /><span>{job.execution_target}</span></span>
            {job.next_run_at && (
              <span className="sch-meta-pill"><span>next: {new Date(job.next_run_at).toLocaleString()}</span></span>
            )}
            {job.last_run_status && (
              <span className={`sch-badge sch-badge--run-${job.last_run_status}`}>
                {RUN_STATUS_LABEL[job.last_run_status] ?? job.last_run_status}
              </span>
            )}
          </div>
        </div>
        <div className="sch-job-card-footer">
          <button
            className="sch-job-run-btn"
            onClick={(event) => { event.stopPropagation(); onRunNow(job) }}
            disabled={runningJobId === job.id}
          >
            <Play size={12} /> Run now
          </button>
          <OverflowMenu
            ariaLabel={`More actions for ${job.name}`}
            items={[
              {
                label: job.status === 'active' ? 'Pause' : 'Resume',
                icon: job.status === 'active' ? <PauseOne size={13} /> : <Play size={13} />,
                disabled: pausingJobId === job.id,
                onClick: () => onTogglePaused(job),
              },
              { label: 'Edit', icon: <Edit size={13} />, onClick: () => onEdit(job) },
              { label: 'Delete', icon: <Delete size={13} />, danger: true, onClick: () => onRequestDelete(job.id) },
            ]}
          />
        </div>
      </div>

      {deletingJobId === job.id && (
        <div className="sch-confirm-row">
          <span>Delete "{job.name}"? This can't be undone.</span>
          <div className="sch-confirm-actions">
            <button className="sch-confirm-cancel" onClick={() => onCancelDelete()}>Cancel</button>
            <button className="sch-confirm-delete" onClick={() => onConfirmDelete(job.id)}>Delete</button>
          </div>
        </div>
      )}
    </div>
  )
}
