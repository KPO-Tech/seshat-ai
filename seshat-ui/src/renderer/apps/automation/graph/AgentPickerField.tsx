import { useEffect, useState } from 'react'
import { api, ApiError } from '@/api/client'
import { fetchProviderModels, useProviders } from '@/hooks/useProviders'
import { useProvidersStore } from '@/stores/providers'
import type { Agent, CreateAgentBody, ProviderModel, UpdateAgentBody } from '@/api/types'

type Props = {
  value: string
  onChange: (slug: string) => void
}

function toSlug(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

// This node's own agent - created inline, local to this one workflow
// (Source "workflow", excluded from Companion's own agent list - see
// automation-app-pages.md §37.9). No more picker of pre-existing Companion
// personas: those have their own separate purpose elsewhere and shouldn't
// show up here. A brand-new node (value === '', no slug saved yet) shows a
// blank create form; a node whose agent already exists fetches and edits
// it in place. Zero tools by default falls out for free - CreateAgentBody
// never sets `tools`, matching every other optional field this form
// doesn't expose.
export function AgentPickerField({ value, onChange }: Props) {
  const [name, setName] = useState('')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [providerId, setProviderId] = useState('')
  const [modelId, setModelId] = useState('')
  const [modelsByProvider, setModelsByProvider] = useState<Record<string, ProviderModel[]>>({})
  const [loadingModelsFor, setLoadingModelsFor] = useState<string | null>(null)
  const [loadingExisting, setLoadingExisting] = useState(!!value)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const { loading: providersLoading } = useProviders()
  const providers = useProvidersStore((s) => s.providers)
  const models = providerId ? (modelsByProvider[providerId] ?? []) : []

  useEffect(() => {
    if (!value) return
    let cancelled = false
    api.get<Agent>(`/agents/${encodeURIComponent(value)}`)
      .then((a) => {
        if (cancelled) return
        setName(a.name)
        setSystemPrompt(a.system_prompt)
        // model is stored as "provider:model_id" (see save() below) - best-
        // effort split back into the two selects; an agent whose model
        // doesn't match that shape (or a provider that no longer exists)
        // just leaves both blank instead of crashing.
        const [maybeProvider, ...rest] = a.model ? a.model.split(':') : []
        const match = providers.find((p) => p.provider === maybeProvider)
        if (match && rest.length > 0) {
          setProviderId(match.id)
          setModelId(rest.join(':'))
        }
      })
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : 'Unable to load this agent.'))
      .finally(() => setLoadingExisting(false))
    return () => { cancelled = true }
    // Only re-fetch when the node's own slug actually changes - `providers`
    // resolving later shouldn't re-trigger a network call.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  useEffect(() => {
    if (!providerId || Object.prototype.hasOwnProperty.call(modelsByProvider, providerId)) return
    setLoadingModelsFor(providerId)
    fetchProviderModels(providerId)
      .then((res) => setModelsByProvider((c) => ({ ...c, [providerId]: res })))
      .catch(() => setModelsByProvider((c) => ({ ...c, [providerId]: [] })))
      .finally(() => setLoadingModelsFor((c) => (c === providerId ? null : c)))
  }, [providerId, modelsByProvider])

  async function save() {
    const trimmedName = name.trim()
    if (!trimmedName) {
      setSaveError('Give the agent a name.')
      return
    }
    const provider = providers.find((p) => p.id === providerId)
    const model = provider && modelId ? `${provider.provider}:${modelId}` : undefined
    setSaving(true)
    setSaveError(null)
    try {
      if (value) {
        const body: UpdateAgentBody = { name: trimmedName, system_prompt: systemPrompt, model }
        await api.put<Agent>(`/agents/${encodeURIComponent(value)}`, body)
      } else {
        const body: CreateAgentBody = { slug: toSlug(trimmedName), name: trimmedName, system_prompt: systemPrompt, model, source: 'workflow' }
        const created = await api.post<Agent>('/agents', body)
        onChange(created.slug)
      }
      setSaved(true)
      window.setTimeout(() => setSaved(false), 1600)
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'Unable to save this agent.')
    } finally {
      setSaving(false)
    }
  }

  if (loadingExisting) {
    return <div className="gf-field-hint">Loading agent…</div>
  }

  return (
    <div className="gf-agent-field">
      <style>{AGENT_FIELD_CSS}</style>
      {loadError && <div className="gf-field-error">{loadError}</div>}

      <label className="gf-field-label">Name</label>
      <input className="gf-field-input" placeholder="Agent name" value={name} onChange={(e) => setName(e.target.value)} autoFocus={!value} />

      <label className="gf-field-label">System prompt (optional)</label>
      <textarea
        className="gf-field-input gf-field-textarea"
        placeholder="What should this agent's role and behavior be?"
        value={systemPrompt}
        onChange={(e) => setSystemPrompt(e.target.value)}
        spellCheck={false}
        rows={4}
      />

      <label className="gf-field-label">Provider (optional)</label>
      <select className="gf-field-input" value={providerId} onChange={(e) => { setProviderId(e.target.value); setModelId('') }} disabled={providersLoading || providers.length === 0}>
        <option value="">{providersLoading ? 'Loading providers…' : "None - inherits the workflow's default"}</option>
        {providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>

      <label className="gf-field-label">Model (optional)</label>
      <select className="gf-field-input" value={modelId} onChange={(e) => setModelId(e.target.value)} disabled={!providerId || loadingModelsFor === providerId || models.length === 0}>
        <option value="">{loadingModelsFor === providerId ? 'Loading models…' : 'None'}</option>
        {models.map((m) => <option key={m.model_id} value={m.model_id}>{m.display_name || m.model_id}</option>)}
      </select>

      {saveError && <div className="gf-field-error">{saveError}</div>}
      <button type="button" className="gf-action-btn gf-agent-save-btn" onClick={() => void save()} disabled={saving}>
        {saving ? 'Saving…' : saved ? 'Saved' : value ? 'Save agent' : 'Create agent'}
      </button>
    </div>
  )
}

const AGENT_FIELD_CSS = `
.gf-agent-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.gf-agent-field select,
.gf-agent-field input,
.gf-agent-field textarea {
  width: 100%;
  box-sizing: border-box;
}

.gf-agent-field .gf-field-label {
  margin-top: 6px;
}

.gf-agent-field .gf-field-label:first-child {
  margin-top: 0;
}

.gf-agent-save-btn {
  margin-top: 4px;
}
`
