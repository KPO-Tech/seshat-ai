import { useEffect, useState } from 'react'
import { api, ApiError } from '@/api/client'
import { fetchProviderModels, useProviders } from '@/hooks/useProviders'
import { useProvidersStore } from '@/stores/providers'
import type { Agent, CreateAgentBody, ProviderModel } from '@/api/types'

type Props = {
  value: string
  onChange: (slug: string) => void
}

const NEW_AGENT = '__new__'

function toSlug(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

// Plain select + an inline (not popup) create form when "+ Create new agent"
// is picked - no hidden menu, no hover affordance to discover. Everything
// the field can do is visible in the normal document flow, same as every
// other field in this panel.
export function AgentPickerField({ value, onChange }: Props) {
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [providerId, setProviderId] = useState('')
  const [modelId, setModelId] = useState('')
  const [modelsByProvider, setModelsByProvider] = useState<Record<string, ProviderModel[]>>({})
  const [loadingModelsFor, setLoadingModelsFor] = useState<string | null>(null)
  const [createError, setCreateError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const { loading: providersLoading } = useProviders()
  const providers = useProvidersStore((s) => s.providers)
  const models = providerId ? (modelsByProvider[providerId] ?? []) : []

  useEffect(() => {
    api.get<{ agents: Agent[] }>('/agents')
      .then((res) => setAgents((res.agents ?? []).filter((a) => a.enabled !== false)))
      .catch((err) => setListError(err instanceof ApiError ? err.message : 'Unable to load agents.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!providerId || Object.prototype.hasOwnProperty.call(modelsByProvider, providerId)) return
    setLoadingModelsFor(providerId)
    fetchProviderModels(providerId)
      .then((res) => setModelsByProvider((c) => ({ ...c, [providerId]: res })))
      .catch(() => setModelsByProvider((c) => ({ ...c, [providerId]: [] })))
      .finally(() => setLoadingModelsFor((c) => (c === providerId ? null : c)))
  }, [providerId, modelsByProvider])

  function handleSelect(v: string) {
    if (v === NEW_AGENT) {
      setCreating(true)
      return
    }
    setCreating(false)
    onChange(v)
  }

  async function createAgent() {
    const name = newName.trim()
    if (!name) {
      setCreateError('Give the agent a name.')
      return
    }
    const provider = providers.find((p) => p.id === providerId)
    const model = provider && modelId ? `${provider.provider}:${modelId}` : undefined
    setSaving(true)
    setCreateError(null)
    try {
      const body: CreateAgentBody = { slug: toSlug(name), name, model }
      const created = await api.post<Agent>('/agents', body)
      setAgents((a) => [...a, created])
      onChange(created.slug)
      setCreating(false)
      setNewName('')
      setProviderId('')
      setModelId('')
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : 'Unable to create this agent.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="gf-agent-field">
      <style>{AGENT_FIELD_CSS}</style>
      <select
        className="gf-field-input"
        value={creating ? NEW_AGENT : value}
        onChange={(e) => handleSelect(e.target.value)}
        disabled={loading}
      >
        <option value="">{loading ? 'Loading agents…' : "None - uses the workflow's default agent"}</option>
        {agents.map((a) => <option key={a.slug} value={a.slug}>{a.name || a.slug} ({a.source})</option>)}
        <option value={NEW_AGENT}>+ Create new agent</option>
      </select>
      {listError && <div className="gf-field-error">{listError}</div>}

      {creating && (
        <div className="gf-agent-create">
          <label className="gf-field-label">Name</label>
          <input className="gf-field-input" placeholder="Agent name" value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus />

          <label className="gf-field-label">Provider</label>
          <select className="gf-field-input" value={providerId} onChange={(e) => { setProviderId(e.target.value); setModelId('') }} disabled={providersLoading || providers.length === 0}>
            <option value="">{providersLoading ? 'Loading providers…' : 'None (optional)'}</option>
            {providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>

          <label className="gf-field-label">Model</label>
          <select className="gf-field-input" value={modelId} onChange={(e) => setModelId(e.target.value)} disabled={!providerId || loadingModelsFor === providerId || models.length === 0}>
            <option value="">{loadingModelsFor === providerId ? 'Loading models…' : 'None (optional)'}</option>
            {models.map((m) => <option key={m.model_id} value={m.model_id}>{m.display_name || m.model_id}</option>)}
          </select>

          {createError && <div className="gf-field-error">{createError}</div>}
          <div className="gf-agent-create-actions">
            <button type="button" className="gf-action-btn primary" onClick={() => void createAgent()} disabled={saving}>
              {saving ? 'Creating…' : 'Create agent'}
            </button>
            <button type="button" className="gf-action-btn" onClick={() => setCreating(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}

const AGENT_FIELD_CSS = `
.gf-agent-field select,
.gf-agent-field input {
  width: 100%;
  box-sizing: border-box;
}

.gf-agent-create {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 10px;
  padding: 10px;
  border: 1px solid var(--color-border-subtle);
  border-radius: 8px;
  background: var(--color-surface);
}

.gf-agent-create .gf-field-label {
  margin-top: 6px;
}

.gf-agent-create .gf-field-label:first-child {
  margin-top: 0;
}

.gf-agent-create-actions {
  display: flex;
  gap: 6px;
  margin-top: 8px;
}

.gf-agent-create-actions .gf-action-btn {
  flex: 1;
}
`
