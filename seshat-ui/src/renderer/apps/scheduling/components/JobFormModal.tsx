import { useEffect, useMemo, useState } from 'react'
import { CheckOne } from '@icon-park/react'
import { api, ApiError, NEXUS_BASE } from '@/api/client'
import { WindowCloseIcon } from '@/components/ui/WindowControlIcon'
import { CopyButton } from '@/components/ui/CopyButton'
import { WebhookLastCall } from '@/components/automation/WebhookLastCall'
import type { Agent, ProviderModel, ProviderSetting } from '@/api/types'
import { fetchProviderModels } from '@/hooks/useProviders'
import type { Device, ExecutionTarget, Job, JobDraft, JobParams, TriggerType, WebhookMethod, WebhookResponseMode } from '../api/types'
export function JobFormModal({
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
  const isEdit = !!job
  const [name, setName] = useState(job?.name ?? draft?.name ?? '')
  const [description, setDescription] = useState(job?.description ?? draft?.description ?? '')
  // A saved webhook trigger is stored as trigger_type "" (see
  // normalizeJobTrigger in seshat-server) - webhook_token presence is what
  // actually distinguishes it, same convention describeTrigger() uses.
  const [triggerType, setTriggerType] = useState<TriggerType>(
    job?.webhook_token ? 'webhook' : (job?.trigger_type || draft?.trigger_type || 'cron'),
  )
  const [cronExpr, setCronExpr] = useState(job?.cron_expr ?? draft?.cron_expr ?? '0 0 * * *')
  const [intervalSeconds, setIntervalSeconds] = useState(job?.interval_seconds ?? draft?.interval_seconds ?? 3600)
  const [runAt, setRunAt] = useState(job?.run_at ? job.run_at.slice(0, 16) : draft?.run_at ? draft.run_at.slice(0, 16) : '')
  const [webhookMethod, setWebhookMethod] = useState<WebhookMethod>(job?.webhook_method ?? 'POST')
  const [webhookResponseMode, setWebhookResponseMode] = useState<WebhookResponseMode>(job?.webhook_response_mode ?? 'immediate')
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
      : triggerType === 'webhook'
        ? `Webhook (${webhookMethod})`
        : runAt
          ? new Date(runAt).toLocaleString()
          : 'Date not set'
  const validationItems = [
    { label: 'Name is valid', ok: name.trim().length > 0 },
    {
      label: 'Schedule configured',
      ok: triggerType === 'cron' ? cronExpr.trim().length > 0
        : triggerType === 'interval' ? intervalSeconds >= 60
        : triggerType === 'webhook' ? true
        : runAt.length > 0,
    },
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
        webhook_method: triggerType === 'webhook' ? webhookMethod : undefined,
        webhook_response_mode: triggerType === 'webhook' ? webhookResponseMode : undefined,
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
              {(['cron', 'interval', 'once', 'webhook'] as TriggerType[]).map((type) => (
                <button
                  key={type}
                  type="button"
                  className={`sch-segment ${triggerType === type ? 'active' : ''}`}
                  onClick={() => setTriggerType(type)}
                >
                  {type === 'cron' ? 'Cron' : type === 'interval' ? 'Interval' : type === 'once' ? 'Once' : 'Webhook'}
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
          {triggerType === 'webhook' && (
            <>
              <div className="sch-field-grid">
                <div className="sch-field">
                  <label>HTTP method</label>
                  <select value={webhookMethod} onChange={(e) => setWebhookMethod(e.target.value as WebhookMethod)}>
                    {(['POST', 'GET', 'PUT', 'PATCH', 'DELETE'] as WebhookMethod[]).map((method) => (
                      <option key={method} value={method}>{method}</option>
                    ))}
                  </select>
                </div>
                <div className="sch-field">
                  <label>Response mode</label>
                  <select value={webhookResponseMode} onChange={(e) => setWebhookResponseMode(e.target.value as WebhookResponseMode)}>
                    <option value="immediate">Immediate - queue and respond right away</option>
                    <option value="whenFinished">Wait for finish - hold the response until the run completes</option>
                  </select>
                </div>
              </div>
              <div className="sch-field">
                <label>Webhook URL</label>
                {job?.webhook_token ? (
                  <div className="gf-webhook-url-row">
                    <code className="gf-webhook-url">{`${NEXUS_BASE}/webhooks/${job.webhook_token}`}</code>
                    <CopyButton text={`${NEXUS_BASE}/webhooks/${job.webhook_token}`} />
                  </div>
                ) : (
                  <div className="sch-field-hint">Save this job to get its webhook URL.</div>
                )}
              </div>
              {job?.webhook_token && <WebhookLastCall jobId={job.id} />}
            </>
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
