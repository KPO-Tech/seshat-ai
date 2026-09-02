import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { Left, Setting, Close, CheckOne } from '@icon-park/react'
import { api, ApiError } from '@/api/client'
import type { Agent, ProviderModel } from '@/api/types'
import { fetchProviderModels, useProviders } from '@/hooks/useProviders'
import { useProvidersStore } from '@/stores/providers'
import { GraphEditor } from './graph/GraphEditor'
import type { DataflowDefinition, NodeDescription } from './graph/types'

type TriggerType = 'cron' | 'interval' | 'once'
type ExecutionTarget = 'cloud' | 'device'
type Device = { id: string; name: string; status: string }

type Job = {
  id: string
  name: string
  description?: string
  trigger_type: TriggerType
  cron_expr?: string
  interval_seconds?: number
  run_at?: string
  execution_target: ExecutionTarget
  target_device_id?: string
  graph?: DataflowDefinition
  model_override?: string
  configuration?: Record<string, string>
}

// This page only ever creates/edits jobs whose task is a Graph - Scheduling's
// own compact modal remains the entry point for the simpler Prompt case (see
// its "Build with a visual graph instead" link). Kept as two entry points on
// purpose rather than one form trying to serve both: the canvas needs the
// window, a prompt textarea doesn't, and cramming both into one shell would
// have made the simple case worse to make room for the complex one.
export function AutomationPage() {
  const { jobId } = useParams()
  const navigate = useNavigate()
  const isNew = !jobId

  const [loading, setLoading] = useState(!isNew)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(isNew)

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

  // Load agents/devices/node types once - independent of whether this is a
  // new or existing job, unlike Scheduling's page-level fetch which this
  // page doesn't share (separate route, own mount).
  useEffect(() => {
    api.get<{ agents: Agent[] }>('/agents').then((r) => setAgents((r.agents ?? []).filter((a) => a.enabled !== false))).catch(() => {})
    api.get<{ devices: Device[] }>('/automation/devices').then((r) => setDevices(r.devices ?? [])).catch(() => {})
    setNodeTypesLoading(true)
    api.get<{ node_types: NodeDescription[] }>('/automation/dataflow/node-types')
      .then((res) => setNodeTypes(res.node_types ?? []))
      .catch((err) => setNodeTypesError(err instanceof ApiError ? err.message : 'Unable to load node types.'))
      .finally(() => setNodeTypesLoading(false))
  }, [])

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

  useEffect(() => {
    if (!selectedProviderId && availableProviders.length > 0) {
      const def = availableProviders.find((p) => p.is_default) ?? availableProviders[0]
      setSelectedProviderId(def.id)
      return
    }
    if (selectedProviderId && availableProviders.length > 0 && !availableProviders.some((p) => p.id === selectedProviderId)) {
      const def = availableProviders.find((p) => p.is_default) ?? availableProviders[0]
      setSelectedProviderId(def.id)
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

  const validationItems = [
    { label: 'Name is valid', ok: name.trim().length > 0 },
    { label: 'Schedule configured', ok: triggerType === 'cron' ? cronExpr.trim().length > 0 : triggerType === 'interval' ? intervalSeconds >= 60 : runAt.length > 0 },
    { label: 'Execution target selected', ok: executionTarget === 'cloud' || targetDeviceId.length > 0 },
    { label: 'Agent selected', ok: agentSlug.length > 0 },
    { label: 'Model selected', ok: !!selectedProviderId && !!selectedModelId },
    { label: 'Graph has at least one node', ok: (graph?.nodes.length ?? 0) > 0 },
  ]
  const canSave = validationItems.every((item) => item.ok)

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
      navigate('/scheduling')
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
        <button type="button" className="au-icon-btn" onClick={() => navigate('/scheduling')} title="Back to Scheduling">
          <Left size={15} />
        </button>
        <input className="au-name-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Untitled automation" />
        <div className="au-topbar-spacer" />
        {saveError && <span className="au-topbar-error">{saveError}</span>}
        <button type="button" className={`au-icon-btn ${settingsOpen ? 'active' : ''}`} onClick={() => setSettingsOpen((o) => !o)} title="Job settings">
          <Setting size={15} />
        </button>
        <button type="button" className="au-save-btn" onClick={() => void handleSave()} disabled={saving || !canSave} title={!canSave ? 'Finish job settings before saving' : undefined}>
          {saving ? 'Saving…' : isNew ? 'Create job' : 'Save changes'}
        </button>
      </header>

      <div className="au-body">
        {loading ? (
          <div className="au-loading">Loading…</div>
        ) : loadError ? (
          <div className="au-loading au-loading-error">{loadError}</div>
        ) : (
          <GraphEditor value={graph} onChange={setGraph} nodeTypes={nodeTypes} nodeTypesLoading={nodeTypesLoading} nodeTypesError={nodeTypesError} />
        )}

        {settingsOpen && (
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
                <label>Agent</label>
                <select value={agentSlug} onChange={(e) => setAgentSlug(e.target.value)} required>
                  <option value="" disabled>Select an agent...</option>
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
                <label>Provider</label>
                <select value={selectedProviderId} onChange={(e) => { setSelectedProviderId(e.target.value); setSelectedModelId('') }} disabled={providersLoading || availableProviders.length === 0} required>
                  <option value="" disabled>{providersLoading ? 'Loading providers...' : 'Select a provider...'}</option>
                  {availableProviders.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div className="au-field">
                <label>Model</label>
                <select value={selectedModelId} onChange={(e) => setSelectedModelId(e.target.value)} disabled={!selectedProviderId || loadingModelsFor === selectedProviderId || selectedModels.length === 0} required>
                  <option value="" disabled>{loadingModelsFor === selectedProviderId ? 'Loading models...' : 'Select a model...'}</option>
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
}

.au-save-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.au-body {
  flex: 1;
  min-height: 0;
  position: relative;
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
`
