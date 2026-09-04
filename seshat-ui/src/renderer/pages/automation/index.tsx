import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router'
import {
  Left, Setting, Close, CheckOne, Home, ApplicationOne, DataOne, Help as HelpIcon,
  Plus, Play, PauseOne, Edit as EditIcon, Delete as DeleteIcon, LoadingOne,
} from '@icon-park/react'
import { api, ApiError } from '@/api/client'
import type { Agent, ProviderModel } from '@/api/types'
import { fetchProviderModels, useProviders } from '@/hooks/useProviders'
import { useProvidersStore } from '@/stores/providers'
import { GraphEditor } from './graph/GraphEditor'
import type { DataflowDefinition, NodeDescription } from './graph/types'

type TriggerType = 'cron' | 'interval' | 'once'
type ExecutionTarget = 'cloud' | 'device'
type JobStatus = 'active' | 'paused'
type RunStatus = 'queued' | 'claimed' | 'running' | 'completed' | 'failed' | 'cancelled'
type Device = { id: string; name: string; status: string }
type RailView = 'overview' | 'graph' | 'templates' | 'variables' | 'help'

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

// Placeholder for the three rail items that don't have a real backend yet
// (no template library, no instance/project variable store, no docs site
// to link out to - confirmed none exists anywhere else in this app). Not
// wired up now on purpose; the rail exists so the shape is there to fill
// in later without another layout pass.
function StubPanel({ title, description }: { title: string; description: string }) {
  return (
    <div className="au-stub">
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
  )
}

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
  graph?: DataflowDefinition
  model_override?: string
  configuration?: Record<string, string>
}

// Automation is its own home, separate from Scheduling, though both are
// thin UIs over the same ScheduledJob list/API - Scheduling manages Prompt
// jobs, this page manages Graph jobs exclusively (see isOverview/isNew
// below for how one component covers the list AND the editor). Kept as two
// separate pages rather than one shared form: the canvas needs the window, a
// prompt textarea doesn't, and cramming both into one shell would have made
// the simple case worse to make room for the complex one.
export function AutomationPage() {
  const { jobId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  // The bare /automation route (no :jobId segment) is Overview - the list of
  // built automations, Automation's own home instead of a dead-end back to
  // Scheduling. /automation/new and /automation/:jobId are the graph editor.
  const isOverview = !jobId && location.pathname === '/automation'
  const isNew = !jobId && !isOverview

  const [loading, setLoading] = useState(!isNew)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [railView, setRailView] = useState<RailView>(isOverview ? 'overview' : 'graph')

  const [jobs, setJobs] = useState<Job[]>([])
  const [jobsLoading, setJobsLoading] = useState(true)
  const [jobsError, setJobsError] = useState<string | null>(null)
  const [runningJobId, setRunningJobId] = useState<string | null>(null)
  const [pausingJobId, setPausingJobId] = useState<string | null>(null)
  const [deletingJobId, setDeletingJobId] = useState<string | null>(null)

  const [name, setName] = useState('Untitled automation')
  const [description, setDescription] = useState('')
  const [triggerType, setTriggerType] = useState<TriggerType>('cron')
  const [cronExpr, setCronExpr] = useState('0 0 * * *')
  const [intervalSeconds, setIntervalSeconds] = useState(3600)
  const [runAt, setRunAt] = useState('')
  const [executionTarget, setExecutionTarget] = useState<ExecutionTarget>('cloud')
  const [targetDeviceId, setTargetDeviceId] = useState('')
  const [agentSlug, setAgentSlug] = useState('')
  const [selectedProviderId, setSelectedProviderId] = useState('')
  const [selectedModelId, setSelectedModelId] = useState('')
  const [modelsByProvider, setModelsByProvider] = useState<Record<string, ProviderModel[]>>({})
  const [loadingModelsFor, setLoadingModelsFor] = useState<string | null>(null)

  const [graph, setGraph] = useState<DataflowDefinition | null>(null)
  const [nodeTypes, setNodeTypes] = useState<NodeDescription[]>([])
  const [nodeTypesLoading, setNodeTypesLoading] = useState(true)
  const [nodeTypesError, setNodeTypesError] = useState<string | null>(null)

  const [agents, setAgents] = useState<Agent[]>([])
  const [devices, setDevices] = useState<Device[]>([])
  const { loading: providersLoading } = useProviders()
  const providers = useProvidersStore((s) => s.providers)

  const selectedAgent = agents.find((a) => a.slug === agentSlug)
  const availableProviders = useMemo(() => {
    if (executionTarget !== 'cloud') return providers
    return providers.filter((p) => p.has_api_key || p.auth_kind === 'oauth' || p.connection_status === 'connected')
  }, [executionTarget, providers])
  const selectedProvider = availableProviders.find((p) => p.id === selectedProviderId) ?? providers.find((p) => p.id === selectedProviderId) ?? null
  const selectedModels = useMemo(() => (selectedProviderId ? (modelsByProvider[selectedProviderId] ?? []) : []), [modelsByProvider, selectedProviderId])
  const modelOverride = selectedProvider && selectedModelId ? `${selectedProvider.provider}:${selectedModelId}` : ''

  // Reset the rail to match the route whenever it changes - e.g. navigating
  // from Overview to a specific job (or "New automation") should land on the
  // canvas, not leave a stub panel showing from the previous context.
  useEffect(() => {
    setRailView(isOverview ? 'overview' : 'graph')
  }, [isOverview])

  const loadJobs = useCallback(async () => {
    setJobsLoading(true)
    try {
      const result = await api.get<{ jobs: Job[] }>('/automation/jobs')
      // Automation Overview is graph jobs' only home now - Scheduling's own
      // list is Prompt-only, mirroring that page's own filter.
      setJobs((result.jobs ?? []).filter((job) => !!job.graph))
      setJobsError(null)
    } catch (err) {
      setJobsError(err instanceof ApiError ? err.message : 'Failed to load automations.')
    } finally {
      setJobsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isOverview) void loadJobs()
  }, [isOverview, loadJobs])

  async function handleRunNow(job: Job) {
    setRunningJobId(job.id)
    try {
      await api.post(`/automation/jobs/${job.id}/run`, {})
      await loadJobs()
    } catch (err) {
      setJobsError(err instanceof ApiError ? err.message : 'Failed to trigger this automation.')
    } finally {
      setRunningJobId(null)
    }
  }

  async function handleTogglePaused(job: Job) {
    setPausingJobId(job.id)
    try {
      const action = job.status === 'active' ? 'pause' : 'resume'
      await api.post(`/automation/jobs/${job.id}/${action}`, {})
      await loadJobs()
    } catch (err) {
      setJobsError(err instanceof ApiError ? err.message : 'Failed to update this automation.')
    } finally {
      setPausingJobId(null)
    }
  }

  async function handleDeleteJob(job: Job) {
    if (!window.confirm(`Delete "${job.name}"? This cannot be undone.`)) return
    setDeletingJobId(job.id)
    try {
      await api.delete(`/automation/jobs/${job.id}`)
      await loadJobs()
    } catch (err) {
      setJobsError(err instanceof ApiError ? err.message : 'Failed to delete this automation.')
    } finally {
      setDeletingJobId(null)
    }
  }

  // Load agents/devices/node types once - independent of whether this is a
  // new or existing job, unlike Scheduling's page-level fetch which this
  // page doesn't share (separate route, own mount). Skipped entirely on
  // Overview, which needs none of this.
  useEffect(() => {
    if (isOverview) return
    api.get<{ agents: Agent[] }>('/agents').then((r) => setAgents((r.agents ?? []).filter((a) => a.enabled !== false))).catch(() => {})
    api.get<{ devices: Device[] }>('/automation/devices').then((r) => setDevices(r.devices ?? [])).catch(() => {})
    setNodeTypesLoading(true)
    api.get<{ node_types: NodeDescription[] }>('/automation/dataflow/node-types')
      .then((res) => setNodeTypes(res.node_types ?? []))
      .catch((err) => setNodeTypesError(err instanceof ApiError ? err.message : 'Unable to load node types.'))
      .finally(() => setNodeTypesLoading(false))
  }, [isOverview])

  // Load the existing job when editing - redirects back if it turns out to
  // be a Prompt job (this page is graph-only; Scheduling's modal owns that
  // case), rather than silently showing an empty canvas for it.
  useEffect(() => {
    if (isNew || !jobId) return
    setLoading(true)
    api.get<Job>(`/automation/jobs/${jobId}`)
      .then((job) => {
        if (!job.graph) {
          navigate('/scheduling', { replace: true })
          return
        }
        setName(job.name)
        setDescription(job.description ?? '')
        setTriggerType(job.trigger_type)
        setCronExpr(job.cron_expr ?? '0 0 * * *')
        setIntervalSeconds(job.interval_seconds ?? 3600)
        setRunAt(job.run_at ? job.run_at.slice(0, 16) : '')
        setExecutionTarget(job.execution_target)
        setTargetDeviceId(job.target_device_id ?? '')
        setAgentSlug(job.configuration?.agent_slug ?? '')
        setSelectedProviderId(job.configuration?.provider_setting_id ?? '')
        setSelectedModelId(job.configuration?.model_id ?? '')
        setGraph(job.graph)
      })
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : 'Unable to load this job.'))
      .finally(() => setLoading(false))
  }, [jobId, isNew, navigate])

  // Provider/Model are optional (see validationItems' comment) - only
  // reconciles an already-chosen selection that's become invalid (e.g.
  // switching Execution target dropped it from availableProviders), never
  // auto-picks a default into an empty field the user deliberately left
  // unset.
  useEffect(() => {
    if (selectedProviderId && availableProviders.length > 0 && !availableProviders.some((p) => p.id === selectedProviderId)) {
      setSelectedProviderId('')
      setSelectedModelId('')
    }
  }, [availableProviders, selectedProviderId])

  useEffect(() => {
    if (!selectedProviderId || Object.prototype.hasOwnProperty.call(modelsByProvider, selectedProviderId)) return
    let cancelled = false
    setLoadingModelsFor(selectedProviderId)
    fetchProviderModels(selectedProviderId)
      .then((models) => { if (!cancelled) setModelsByProvider((c) => ({ ...c, [selectedProviderId]: models })) })
      .catch(() => { if (!cancelled) setModelsByProvider((c) => ({ ...c, [selectedProviderId]: [] })) })
      .finally(() => { if (!cancelled) setLoadingModelsFor((c) => (c === selectedProviderId ? null : c)) })
    return () => { cancelled = true }
  }, [modelsByProvider, selectedProviderId])

  useEffect(() => {
    if (!selectedProviderId || !Object.prototype.hasOwnProperty.call(modelsByProvider, selectedProviderId)) return
    if (selectedModelId && selectedModels.some((m) => m.model_id === selectedModelId)) return
    const def = selectedModels.find((m) => m.is_default) ?? selectedModels[0]
    setSelectedModelId(def?.model_id ?? '')
  }, [modelsByProvider, selectedModelId, selectedModels, selectedProviderId])

  // Agent/Provider/Model are deliberately NOT required here: a graph node of
  // type "agent" carries its own optional `agent` parameter and falls back
  // to these only when unset (see pkg/dataflow's agentNode) - a graph with
  // no agent node at all (e.g. Gmail poll -> Postgres insert) has no use for
  // any of the three, so blocking every graph on picking them was a bug, not
  // a real requirement.
  const validationItems = [
    { label: 'Name is valid', ok: name.trim().length > 0 },
    { label: 'Schedule configured', ok: triggerType === 'cron' ? cronExpr.trim().length > 0 : triggerType === 'interval' ? intervalSeconds >= 60 : runAt.length > 0 },
    { label: 'Execution target selected', ok: executionTarget === 'cloud' || targetDeviceId.length > 0 },
    { label: 'Graph has at least one node', ok: (graph?.nodes.length ?? 0) > 0 },
  ]
  const canSave = validationItems.every((item) => item.ok)

  // Device-targeted job execution doesn't wire up a SecretResolver (or even
  // carry a Graph) at all yet - a node with a secretRef-typed parameter set
  // would silently have nothing to resolve on a Device-targeted run. This is
  // informational only, not a validation blocker - fixing device execution
  // itself is a separate chantier.
  const usesDeviceIncompatibleSecret = (graph?.nodes ?? []).some((node) => {
    const props = nodeTypes.find((nt) => nt.type === node.type)?.properties ?? []
    return props.some((p) => p.type === 'secretRef' && !!node.parameters?.[p.name])
  })

  async function handleSave() {
    if (!canSave || !graph) return
    setSaving(true)
    setSaveError(null)
    try {
      const params = {
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
          ...(agentSlug ? { agent_slug: agentSlug } : {}),
          ...(selectedProviderId ? { provider_setting_id: selectedProviderId } : {}),
          ...(selectedModelId ? { model_id: selectedModelId } : {}),
        },
        graph: { ...graph, name: name.trim() || graph.name },
      }
      if (isNew) {
        await api.post('/automation/jobs', params)
      } else {
        await api.put(`/automation/jobs/${jobId}`, params)
      }
      navigate('/automation')
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'Failed to save this automation.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="au-root">
      <style>{AUTOMATION_CSS}</style>
      <header className="au-topbar">
        <button type="button" className="au-icon-btn" onClick={() => navigate(isOverview ? '/scheduling' : '/automation')} title={isOverview ? 'Back to Scheduling' : 'Back to Automation'}>
          <Left size={15} />
        </button>
        {isOverview ? (
          <span className="au-topbar-title">Automation</span>
        ) : (
          <input className="au-name-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Untitled automation" />
        )}
        <div className="au-topbar-spacer" />
        {saveError && <span className="au-topbar-error">{saveError}</span>}
        {isOverview ? (
          <button type="button" className="au-save-btn" onClick={() => navigate('/automation/new')}>
            <Plus size={14} /> New automation
          </button>
        ) : (
          <>
            <button type="button" className={`au-icon-btn ${settingsOpen ? 'active' : ''}`} onClick={() => setSettingsOpen((o) => !o)} title="Job settings">
              <Setting size={15} />
            </button>
            <button type="button" className="au-save-btn" onClick={() => void handleSave()} disabled={saving || !canSave} title={!canSave ? 'Finish job settings before saving' : undefined}>
              {saving ? 'Saving…' : isNew ? 'Create job' : 'Save changes'}
            </button>
          </>
        )}
      </header>

      <div className="au-body">
        <nav className="au-rail">
          <button
            type="button"
            className={`au-rail-btn ${railView === 'overview' ? 'active' : ''}`}
            onClick={() => {
              // Templates/Variables/Help never navigate, just flip railView
              // locally - Overview needs to match when we're already on
              // /automation (e.g. coming back from Templates). Navigating to
              // the current route is a no-op (no location change), so the
              // isOverview-driven reset effect never re-fires and railView
              // would stay stuck on whatever panel was open. Only navigate
              // when actually leaving the editor route.
              setRailView('overview')
              if (!isOverview) navigate('/automation')
            }}
            title="Overview"
          >
            <Home size={16} />
            <span>Overview</span>
          </button>
          <button type="button" className={`au-rail-btn ${railView === 'templates' ? 'active' : ''}`} onClick={() => setRailView('templates')} title="Templates">
            <ApplicationOne size={16} />
            <span>Templates</span>
          </button>
          <button type="button" className={`au-rail-btn ${railView === 'variables' ? 'active' : ''}`} onClick={() => setRailView('variables')} title="Variables">
            <DataOne size={16} />
            <span>Variables</span>
          </button>
          <button type="button" className={`au-rail-btn ${railView === 'help' ? 'active' : ''}`} onClick={() => setRailView('help')} title="Help">
            <HelpIcon size={16} />
            <span>Help</span>
          </button>
        </nav>

        <div className="au-main">
          {railView === 'overview' ? (
            <AutomationOverviewPanel
              jobs={jobs}
              loading={jobsLoading}
              error={jobsError}
              onOpen={(id) => navigate(`/automation/${id}`)}
              onNew={() => navigate('/automation/new')}
              onRun={(job) => void handleRunNow(job)}
              onTogglePaused={(job) => void handleTogglePaused(job)}
              onDelete={(job) => void handleDeleteJob(job)}
              runningJobId={runningJobId}
              pausingJobId={pausingJobId}
              deletingJobId={deletingJobId}
            />
          ) : railView === 'templates' ? (
            <StubPanel title="Templates" description="Browse and start from pre-built automation templates. Coming soon." />
          ) : railView === 'variables' ? (
            <StubPanel title="Variables" description="Named values reusable across every automation's expressions. Coming soon." />
          ) : railView === 'help' ? (
            <StubPanel title="Help" description="Documentation for building automations is on its way." />
          ) : loading ? (
            <div className="au-loading">Loading…</div>
          ) : loadError ? (
            <div className="au-loading au-loading-error">{loadError}</div>
          ) : (
            <GraphEditor value={graph} onChange={setGraph} nodeTypes={nodeTypes} nodeTypesLoading={nodeTypesLoading} nodeTypesError={nodeTypesError} />
          )}
        </div>

        {settingsOpen && !isOverview && (
          <aside className="au-settings-drawer">
            <header className="au-drawer-head">
              <strong>Job settings</strong>
              <button type="button" onClick={() => setSettingsOpen(false)} aria-label="Close"><Close size={14} /></button>
            </header>
            <div className="au-drawer-body">
              <div className="au-field">
                <label>Description (optional)</label>
                <input value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>

              <div className="au-field">
                <label>Default agent <span className="au-field-hint">(optional)</span></label>
                <select value={agentSlug} onChange={(e) => setAgentSlug(e.target.value)}>
                  <option value="">None - only used by agent nodes with none set</option>
                  {agents.map((a) => (
                    <option key={a.slug} value={a.slug}>{a.name || a.slug} ({a.source})</option>
                  ))}
                </select>
                {selectedAgent && (
                  <div className="au-field-hint">{selectedAgent.model || 'Default model'} / {selectedAgent.permission_mode || 'default permissions'}</div>
                )}
              </div>

              <div className="au-field">
                <label>Trigger</label>
                <div className="au-segmented">
                  {(['cron', 'interval', 'once'] as TriggerType[]).map((type) => (
                    <button key={type} type="button" className={`au-segment ${triggerType === type ? 'active' : ''}`} onClick={() => setTriggerType(type)}>
                      {type === 'cron' ? 'Cron' : type === 'interval' ? 'Interval' : 'Once'}
                    </button>
                  ))}
                </div>
              </div>
              {triggerType === 'cron' && (
                <div className="au-field">
                  <label>Cron expression</label>
                  <input value={cronExpr} onChange={(e) => setCronExpr(e.target.value)} placeholder="0 0 * * *" required />
                </div>
              )}
              {triggerType === 'interval' && (
                <div className="au-field">
                  <label>Interval (seconds)</label>
                  <input type="number" min={60} value={intervalSeconds} onChange={(e) => setIntervalSeconds(Number(e.target.value))} required />
                </div>
              )}
              {triggerType === 'once' && (
                <div className="au-field">
                  <label>Run at</label>
                  <input type="datetime-local" value={runAt} onChange={(e) => setRunAt(e.target.value)} required />
                </div>
              )}

              <div className="au-field">
                <label>Execution target</label>
                <div className="au-segmented">
                  <button type="button" className={`au-segment ${executionTarget === 'cloud' ? 'active' : ''}`} onClick={() => setExecutionTarget('cloud')}>Cloud</button>
                  <button type="button" className={`au-segment ${executionTarget === 'device' ? 'active' : ''}`} onClick={() => setExecutionTarget('device')}>Device</button>
                </div>
                {executionTarget === 'device' && usesDeviceIncompatibleSecret && (
                  <div className="au-field-hint au-field-warning">This graph uses database secrets, which currently only run on Cloud execution.</div>
                )}
              </div>
              {executionTarget === 'device' && (
                <div className="au-field">
                  <label>Device</label>
                  <select value={targetDeviceId} onChange={(e) => setTargetDeviceId(e.target.value)} required>
                    <option value="" disabled>Select a device…</option>
                    {devices.map((d) => (
                      <option key={d.id} value={d.id} disabled={d.status !== 'active'}>{d.name}{d.status !== 'active' ? ` (${d.status})` : ''}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="au-field">
                <label>Provider <span className="au-field-hint">(optional)</span></label>
                <select value={selectedProviderId} onChange={(e) => { setSelectedProviderId(e.target.value); setSelectedModelId('') }} disabled={providersLoading || availableProviders.length === 0}>
                  <option value="">{providersLoading ? 'Loading providers...' : 'None - defaults to agent nodes\' own resolution'}</option>
                  {availableProviders.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div className="au-field">
                <label>Model <span className="au-field-hint">(optional)</span></label>
                <select value={selectedModelId} onChange={(e) => setSelectedModelId(e.target.value)} disabled={!selectedProviderId || loadingModelsFor === selectedProviderId || selectedModels.length === 0}>
                  <option value="">{loadingModelsFor === selectedProviderId ? 'Loading models...' : 'None'}</option>
                  {selectedModels.map((m) => (
                    <option key={m.model_id} value={m.model_id}>{m.display_name || m.model_id}</option>
                  ))}
                </select>
              </div>

              <div className="au-validation-list">
                {validationItems.map((item) => (
                  <div key={item.label} className={`au-validation-row ${item.ok ? 'ok' : ''}`}>
                    <CheckOne size={11} />
                    <span>{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  )
}

// ─── Overview ───────────────────────────────────────────────────────────────
// Automation's own home - every graph-based job, with the run/pause/delete
// actions Scheduling's list used to offer them before they moved here
// exclusively. Deliberately no run-inspector/node-trace drill-down yet
// (that stayed behind on Scheduling's RunInspectorPanel) - a fast-follow if
// this page needs it too, not ported in this pass.
function AutomationOverviewPanel({
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
  if (loading) return <div className="au-loading">Loading…</div>
  if (error) return <div className="au-loading au-loading-error">{error}</div>

  if (jobs.length === 0) {
    return (
      <div className="au-stub">
        <h2>No automations yet</h2>
        <p>Build a visual graph workflow - connectors, branching logic, database steps - and it'll show up here.</p>
        <button type="button" className="au-save-btn" onClick={onNew} style={{ marginTop: 8 }}>
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

const AUTOMATION_CSS = `
.au-root {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  height: 100%;
  min-height: 0;
}

.au-topbar {
  flex-shrink: 0;
  min-height: 52px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 14px;
  border-bottom: 1px solid var(--color-border-subtle);
}

.au-icon-btn {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--color-border);
  border-radius: 7px;
  background: var(--color-bg);
  color: var(--color-text-secondary);
  cursor: pointer;
}

.au-icon-btn.active {
  color: var(--color-text);
  border-color: rgba(239, 124, 47, 0.55);
  background: rgba(239, 124, 47, 0.12);
}

.au-name-input {
  width: 260px;
  height: 32px;
  padding: 0 10px;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text);
  font-size: var(--font-size-base);
  font-weight: 700;
}

.au-name-input:hover,
.au-name-input:focus {
  border-color: var(--color-border);
  background: var(--color-bg);
}

.au-topbar-spacer {
  flex: 1;
}

.au-topbar-error {
  color: #ff6b6b;
  font-size: var(--font-size-xs);
}

.au-save-btn {
  height: 32px;
  padding: 0 16px;
  border: none;
  border-radius: var(--radius-sm);
  background: var(--color-cta);
  color: white;
  font-size: var(--font-size-sm);
  font-weight: 700;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.au-topbar-title {
  font-size: var(--font-size-base);
  font-weight: 700;
  color: var(--color-text);
}

.au-save-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.au-body {
  flex: 1;
  min-height: 0;
  display: flex;
  position: relative;
}

.au-rail {
  flex-shrink: 0;
  width: 60px;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 2px;
  padding: 10px 6px;
  border-right: 1px solid var(--color-border-subtle);
  background: var(--color-surface);
}

.au-rail-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px 2px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-secondary);
  font-size: 9px;
  font-weight: 650;
  cursor: pointer;
}

.au-rail-btn:hover {
  background: var(--color-hover);
  color: var(--color-text);
}

.au-rail-btn.active {
  color: var(--color-cta);
  background: var(--color-primary-subtle);
}

.au-main {
  flex: 1;
  min-width: 0;
  position: relative;
}

.au-stub {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 0 24px;
  text-align: center;
  color: var(--color-text-muted);
}

.au-stub h2 {
  margin: 0;
  font-size: var(--font-size-lg);
  font-weight: 750;
  color: var(--color-text);
}

.au-stub p {
  margin: 0;
  font-size: var(--font-size-sm);
  max-width: 340px;
}

.au-loading {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}

.au-loading-error {
  color: #ff6b6b;
}

.au-settings-drawer {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 320px;
  border-left: 1px solid var(--color-border);
  background: var(--color-bg);
  box-shadow: -18px 0 60px rgba(0, 0, 0, 0.26);
  display: flex;
  flex-direction: column;
  z-index: 8;
}

.au-drawer-head {
  min-height: 52px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 14px;
  border-bottom: 1px solid var(--color-border-subtle);
}

.au-drawer-head strong {
  font-size: var(--font-size-sm);
}

.au-drawer-head button {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--color-border);
  border-radius: 7px;
  background: var(--color-surface);
  color: var(--color-text-secondary);
  cursor: pointer;
}

.au-drawer-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.au-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.au-field label {
  font-size: var(--font-size-2xs);
  font-weight: 700;
  color: var(--color-text-secondary);
}

.au-field-hint {
  font-size: var(--font-size-2xs);
  color: var(--color-text-muted);
}

.au-field-warning {
  color: var(--color-warning, #C58B45);
}

.au-field input,
.au-field select {
  height: 32px;
  padding: 0 9px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-bg);
  color: var(--color-text);
  font-size: var(--font-size-xs);
}

.au-segmented {
  display: inline-flex;
  gap: 6px;
}

.au-segment {
  height: 30px;
  padding: 0 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-bg);
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
  font-weight: 700;
  cursor: pointer;
}

.au-segment.active {
  color: var(--color-text);
  border-color: rgba(239, 124, 47, 0.55);
  background: rgba(239, 124, 47, 0.12);
}

.au-validation-list {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin-top: 4px;
  padding-top: 10px;
  border-top: 1px solid var(--color-border-subtle);
}

.au-validation-row {
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--color-text-muted);
  font-size: var(--font-size-2xs);
}

.au-validation-row.ok {
  color: var(--color-success, #57D9A3);
}

/* Overview */
.au-overview {
  height: 100%;
  overflow-y: auto;
  padding: 18px 24px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.au-overview-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 12px 14px;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-md, 10px);
  background: var(--color-surface);
  cursor: pointer;
  transition: border-color 0.15s;
}

.au-overview-row:hover {
  border-color: var(--color-border);
}

.au-overview-main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.au-overview-name-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.au-overview-name {
  font-size: var(--font-size-sm);
  font-weight: 700;
  color: var(--color-text);
}

.au-overview-badge {
  font-size: 10px;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 20px;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.au-overview-badge--active { background: rgba(var(--color-success-rgb), 0.12); color: var(--color-success); }
.au-overview-badge--paused { background: rgba(148, 163, 184, 0.15); color: var(--color-text-muted); }
.au-overview-badge--target { background: rgba(239, 124, 47, 0.1); color: var(--color-accent); }

.au-overview-desc {
  font-size: var(--font-size-2xs);
  color: var(--color-text-secondary);
}

.au-overview-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: var(--font-size-2xs);
  color: var(--color-text-muted);
}

.au-overview-actions {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 6px;
}

.spin {
  animation: au-spin 0.8s linear infinite;
}
@keyframes au-spin {
  to { transform: rotate(360deg); }
}
`
