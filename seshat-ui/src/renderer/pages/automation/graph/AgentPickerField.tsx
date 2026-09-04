import { useEffect, useMemo, useRef, useState } from 'react'
import { Add, CheckCorrect } from '@icon-park/react'
import { SelectorPill, SELECTOR_PILL_CSS } from '@/components/ui/SelectorPill'
import { api, ApiError } from '@/api/client'
import { fetchProviderModels, useProviders } from '@/hooks/useProviders'
import { useProvidersStore } from '@/stores/providers'
import type { Agent, CreateAgentBody, ProviderModel } from '@/api/types'

type Props = {
  value: string
  onChange: (slug: string) => void
}

function toSlug(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

// Picks an existing agent by slug, or configures a brand new one (name +
// provider + model) inline without leaving the parameter form - mirrors
// SecretRefField's "pick or create" pattern. Unlike Companion's own agent
// form (a free-text "model" override string), provider/model here are two
// dependent selects sourced from the same providers store + per-provider
// model fetch AutomationPage's job-level Provider/Model override already
// uses, since that's the picker the user actually expects for this.
export function AgentPickerField({ value, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [agents, setAgents] = useState<Agent[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [providerId, setProviderId] = useState('')
  const [modelId, setModelId] = useState('')
  const [modelsByProvider, setModelsByProvider] = useState<Record<string, ProviderModel[]>>({})
  const [loadingModelsFor, setLoadingModelsFor] = useState<string | null>(null)
  const [createError, setCreateError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  const { loading: providersLoading } = useProviders()
  const providers = useProvidersStore((s) => s.providers)
  const models = providerId ? (modelsByProvider[providerId] ?? []) : []
  const picked = useMemo(() => (agents ?? []).find((a) => a.slug === value), [agents, value])

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false)
        setCreating(false)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open])

  useEffect(() => {
    if (!providerId || Object.prototype.hasOwnProperty.call(modelsByProvider, providerId)) return
    setLoadingModelsFor(providerId)
    fetchProviderModels(providerId)
      .then((res) => setModelsByProvider((c) => ({ ...c, [providerId]: res })))
      .catch(() => setModelsByProvider((c) => ({ ...c, [providerId]: [] })))
      .finally(() => setLoadingModelsFor((c) => (c === providerId ? null : c)))
  }, [providerId, modelsByProvider])

  function openMenu() {
    setOpen((o) => !o)
    if (agents === null && !loading) {
      setLoading(true)
      api.get<{ agents: Agent[] }>('/agents')
        .then((res) => setAgents((res.agents ?? []).filter((a) => a.enabled !== false)))
        .catch((err) => setListError(err instanceof ApiError ? err.message : 'Unable to load agents.'))
        .finally(() => setLoading(false))
    }
  }

  function pick(slug: string) {
    onChange(slug)
    setOpen(false)
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
      setAgents((a) => [...(a ?? []), created])
      onChange(created.slug)
      setCreating(false)
      setOpen(false)
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
    <div className="gf-agent-field" ref={rootRef}>
      <style>{SELECTOR_PILL_CSS}</style>
      <style>{AGENT_FIELD_CSS}</style>
      <SelectorPill label={picked ? (picked.name || picked.slug) : (value || "None - uses the workflow's default agent")} onClick={openMenu} />
      {picked && <div className="gf-field-hint">{picked.model || 'Default model'} / {picked.permission_mode || 'default permissions'}</div>}
      {open && (
        <div className="selector-menu gf-agent-menu">
          {creating ? (
            <div className="gf-agent-create">
              <input placeholder="Agent name" value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus />
              <select value={providerId} onChange={(e) => { setProviderId(e.target.value); setModelId('') }} disabled={providersLoading || providers.length === 0}>
                <option value="">{providersLoading ? 'Loading providers…' : 'Provider (optional)'}</option>
                {providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <select value={modelId} onChange={(e) => setModelId(e.target.value)} disabled={!providerId || loadingModelsFor === providerId || models.length === 0}>
                <option value="">{loadingModelsFor === providerId ? 'Loading models…' : 'Model (optional)'}</option>
                {models.map((m) => <option key={m.model_id} value={m.model_id}>{m.display_name || m.model_id}</option>)}
              </select>
              {createError && <div className="gf-agent-error">{createError}</div>}
              <div className="gf-agent-create-actions">
                <button type="button" className="gf-action-btn primary" onClick={() => void createAgent()} disabled={saving}>
                  {saving ? 'Saving…' : 'Create'}
                </button>
                <button type="button" className="gf-action-btn" onClick={() => setCreating(false)}>Cancel</button>
              </div>
            </div>
          ) : (
            <>
              <button className={`selector-menu-item${!value ? ' active' : ''}`} type="button" onClick={() => pick('')}>
                <span className="selector-menu-copy"><span>None - uses the workflow's default agent</span></span>
                {!value && <CheckCorrect size={12} />}
              </button>
              {loading && <div className="gf-agent-empty">Loading…</div>}
              {listError && <div className="gf-agent-empty gf-agent-error">{listError}</div>}
              {!loading && (agents ?? []).map((a) => (
                <button key={a.slug} className={`selector-menu-item${a.slug === value ? ' active' : ''}`} type="button" onClick={() => pick(a.slug)}>
                  <span className="selector-menu-copy"><span>{a.name || a.slug}</span><span className="selector-menu-description">{a.source}</span></span>
                  {a.slug === value && <CheckCorrect size={12} />}
                </button>
              ))}
              <button className="selector-menu-item gf-agent-new" type="button" onClick={() => setCreating(true)}>
                <span className="selector-menu-copy"><span>New agent</span></span>
                <Add size={12} />
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

const AGENT_FIELD_CSS = `
.gf-agent-field {
  position: relative;
  display: inline-block;
}

.gf-agent-menu {
  min-width: 240px;
}

.gf-agent-new {
  border-top: 1px solid var(--color-border-subtle);
  margin-top: 2px;
  padding-top: 9px;
  color: var(--color-cta);
}

.gf-agent-create {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 4px;
}

.gf-agent-create input,
.gf-agent-create select {
  height: 30px;
  padding: 0 8px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-bg);
  color: var(--color-text);
  font-size: var(--font-size-xs);
}

.gf-agent-create-actions {
  display: flex;
  gap: 6px;
  margin-top: 2px;
}

.gf-agent-empty {
  padding: 8px;
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

.gf-agent-error {
  color: #ff6b6b;
}
`
