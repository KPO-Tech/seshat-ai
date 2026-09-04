import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router'
import {
  Plus, Edit, Delete, LoadingOne, Caution, Robot, Send,
  Close, CheckOne, Sync,
} from '@icon-park/react'
import { api } from '@/api/client'
import { useUIStore } from '@/stores/ui'
import {
  AgentAvatar, AvatarPicker, AVATAR_CSS,
  parseAvatarIcon, encodeAvatarIcon, randomSeed,
} from '@/components/agents/avatar'
import type { Agent, CreateAgentBody, UpdateAgentBody } from '@/api/types'

// Companion — a dedicated, standalone page for creating and managing your own
// agents, each with an illustrated DiceBear face (see @/components/agents/
// avatar, shared with Workspace's Agents tab - both manage the same /agents
// records, this is just a second, focused entry point to them). Revives the
// old standalone Agents page (deleted 2026-07-23 when it was folded into
// Workspace) as its own thing again, now with real avatar picking instead of
// the plain emoji + hash-colored circle it had back then.

// ─── Constants ────────────────────────────────────────────────────────────────

const PERMISSION_OPTIONS = [
  { value: '',             label: 'Default' },
  { value: 'onRequest',   label: 'On Request' },
  { value: 'auto',        label: 'Auto' },
  { value: 'acceptEdits', label: 'Accept Edits' },
  { value: 'bypass',      label: 'Bypass' },
  { value: 'never',       label: 'Never' },
]

function toSlug(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

// ─── Form ─────────────────────────────────────────────────────────────────────

type AgentForm = {
  slug: string
  name: string
  icon: string
  when_to_use: string
  system_prompt: string
  model: string
  tools_mode: 'all' | 'custom'
  tools_custom: string
  disallowed_tools: string
  max_turns: number
  permission_mode: string
  enabled: boolean
}

const BLANK: AgentForm = {
  slug: '', name: '', icon: '', when_to_use: '', system_prompt: '',
  model: '', tools_mode: 'all', tools_custom: '', disallowed_tools: '',
  max_turns: 50, permission_mode: '', enabled: true,
}

function agentToForm(a: Agent): AgentForm {
  const hasCustomTools = Array.isArray(a.tools) && a.tools.length > 0 &&
    !(a.tools.length === 1 && a.tools[0] === '*')
  return {
    slug: a.slug,
    name: a.name || a.slug,
    icon: a.icon ?? '',
    when_to_use: a.when_to_use || '',
    system_prompt: a.system_prompt || '',
    model: a.model || '',
    tools_mode: hasCustomTools ? 'custom' : 'all',
    tools_custom: hasCustomTools ? (a.tools ?? []).join(', ') : '',
    disallowed_tools: (a.disallowed_tools ?? []).join(', '),
    max_turns: a.max_turns || 50,
    permission_mode: a.permission_mode || '',
    enabled: a.enabled ?? true,
  }
}

function formToBody(f: AgentForm): CreateAgentBody {
  const tools = f.tools_mode === 'all'
    ? undefined
    : f.tools_custom.split(',').map(s => s.trim()).filter(Boolean)
  const disallowed = f.disallowed_tools.split(',').map(s => s.trim()).filter(Boolean)
  return {
    slug: f.slug,
    name: f.name.trim() || f.slug,
    icon: f.icon,
    when_to_use: f.when_to_use.trim() || undefined,
    system_prompt: f.system_prompt.trim() || undefined,
    model: f.model.trim() || undefined,
    tools: tools && tools.length > 0 ? tools : undefined,
    disallowed_tools: disallowed.length > 0 ? disallowed : undefined,
    max_turns: f.max_turns || 50,
    permission_mode: f.permission_mode || undefined,
    enabled: f.enabled,
  }
}

// ─── Platform agent card ───────────────────────────────────────────────────────

function PlatformCard({ agent, onChat }: { agent: Agent; onChat: (a: Agent) => void }) {
  const toolCount = agent.tools?.length ?? 0
  const allTools  = !agent.tools || (agent.tools.length === 1 && agent.tools[0] === '*')

  return (
    <div className="cmp-card cmp-card--platform">
      <div className="cmp-card-header">
        <AgentAvatar agent={agent} size={42} />
        <div className="cmp-card-meta">
          <span className="cmp-card-name">{agent.name || agent.slug}</span>
          <span className="cmp-badge cmp-badge--platform">
            {agent.source === 'organization' ? 'Organization' : 'Platform'}
          </span>
        </div>
      </div>

      {agent.when_to_use && (
        <p className="cmp-card-desc">{agent.when_to_use}</p>
      )}

      <div className="cmp-card-tools">
        <Robot theme="outline" size={12} />
        <span>{allTools ? 'All tools' : `${toolCount} tool${toolCount !== 1 ? 's' : ''}`}</span>
        {agent.max_turns > 0 && <span className="cmp-dot" />}
        {agent.max_turns > 0 && <span>{agent.max_turns} turns</span>}
      </div>

      <div className="cmp-card-actions">
        <button className="cmp-btn cmp-btn--primary cmp-btn--full" onClick={() => onChat(agent)}>
          <Send theme="outline" size={14} />
          Chat
        </button>
      </div>
    </div>
  )
}

// ─── User agent card ───────────────────────────────────────────────────────────

function UserCard({
  agent, onChat, onEdit, onDelete,
}: {
  agent: Agent
  onChat: (a: Agent) => void
  onEdit: (a: Agent) => void
  onDelete: (a: Agent) => void
}) {
  return (
    <div className="cmp-card cmp-card--user">
      <div className="cmp-card-header">
        <AgentAvatar agent={agent} size={42} />
        <div className="cmp-card-meta">
          <span className="cmp-card-name">{agent.name || agent.slug}</span>
          {!agent.enabled && <span className="cmp-badge cmp-badge--disabled">Disabled</span>}
        </div>
      </div>

      {agent.when_to_use && (
        <p className="cmp-card-desc">{agent.when_to_use}</p>
      )}

      <div className="cmp-card-tools">
        <Robot theme="outline" size={12} />
        <span>
          {!agent.tools || (agent.tools.length === 1 && agent.tools[0] === '*')
            ? 'All tools'
            : `${agent.tools.length} tool${agent.tools.length !== 1 ? 's' : ''}`}
        </span>
        {agent.max_turns > 0 && <span className="cmp-dot" />}
        {agent.max_turns > 0 && <span>{agent.max_turns} turns</span>}
      </div>

      <div className="cmp-card-actions">
        <button className="cmp-btn cmp-btn--primary" onClick={() => onChat(agent)}>
          <Send theme="outline" size={14} />
          Chat
        </button>
        <button className="cmp-btn cmp-btn--ghost" onClick={() => onEdit(agent)} title="Edit">
          <Edit theme="outline" size={14} />
        </button>
        <button className="cmp-btn cmp-btn--ghost cmp-btn--danger" onClick={() => onDelete(agent)} title="Delete">
          <Delete theme="outline" size={14} />
        </button>
      </div>
    </div>
  )
}

// ─── Create card ───────────────────────────────────────────────────────────────

function CreateCard({ onClick }: { onClick: () => void }) {
  return (
    <button className="cmp-card cmp-card--create" onClick={onClick}>
      <Plus theme="outline" size={24} />
      <span>New companion</span>
    </button>
  )
}

// ─── Agent form modal ──────────────────────────────────────────────────────────

function AgentModal({
  initial, onSave, onClose, saving,
}: {
  initial: AgentForm | null
  onSave: (f: AgentForm) => void
  onClose: () => void
  saving: boolean
}) {
  const isNew = initial === null
  const [f, setF] = useState<AgentForm>(initial ?? BLANK)

  const update = <K extends keyof AgentForm>(k: K, v: AgentForm[K]) =>
    setF(prev => ({ ...prev, [k]: v }))

  const onNameChange = (name: string) => {
    setF(prev => ({
      ...prev,
      name,
      slug: isNew ? toSlug(name) : prev.slug,
    }))
  }

  const baseSeed = f.slug || 'new-agent'
  const { styleId: avatarStyleId, seed: avatarSeed } = parseAvatarIcon(f.icon, baseSeed)

  return (
    <div className="cmp-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="cmp-modal">
        <div className="cmp-modal-header">
          <h2>{isNew ? 'New companion' : 'Edit companion'}</h2>
          <button className="cmp-modal-close" onClick={onClose}><Close size={18} /></button>
        </div>

        <div className="cmp-modal-body">
          {/* Avatar + Name row */}
          <div className="cmp-form-row cmp-form-row--icon">
            <AvatarPicker
              styleId={avatarStyleId}
              seed={avatarSeed}
              baseSeed={baseSeed}
              onPick={(styleId, seed) => update('icon', encodeAvatarIcon(styleId, seed))}
              onReroll={() => update('icon', encodeAvatarIcon(avatarStyleId, randomSeed()))}
              size={64}
            />
            <div className="cmp-field" style={{ flex: 1 }}>
              <label>Name <span className="cmp-required">*</span></label>
              <input className="cmp-input" placeholder="My companion" value={f.name}
                onChange={e => onNameChange(e.target.value)} />
            </div>
          </div>

          {/* Slug */}
          <div className="cmp-field">
            <label>Slug <span className="cmp-required">*</span></label>
            <input className="cmp-input cmp-input--mono" placeholder="my-companion"
              value={f.slug} onChange={e => update('slug', e.target.value)} />
          </div>

          {/* When to use */}
          <div className="cmp-field">
            <label>When to use</label>
            <input className="cmp-input" placeholder="Use this agent when…"
              value={f.when_to_use} onChange={e => update('when_to_use', e.target.value)} />
          </div>

          {/* System prompt */}
          <div className="cmp-field">
            <label>System prompt</label>
            <textarea className="cmp-textarea" rows={7}
              placeholder={'You are a helpful assistant specialized in…\n\nYour role is to…'}
              value={f.system_prompt}
              onChange={e => update('system_prompt', e.target.value)} />
          </div>

          {/* Model */}
          <div className="cmp-field">
            <label>Model <span className="cmp-hint">(optional, overrides default)</span></label>
            <input className="cmp-input cmp-input--mono" placeholder="anthropic:claude-sonnet-5"
              value={f.model} onChange={e => update('model', e.target.value)} />
          </div>

          {/* Tools */}
          <div className="cmp-field">
            <label>Tools</label>
            <div className="cmp-radio-group">
              <label className="cmp-radio">
                <input type="radio" checked={f.tools_mode === 'all'}
                  onChange={() => update('tools_mode', 'all')} />
                All tools
              </label>
              <label className="cmp-radio">
                <input type="radio" checked={f.tools_mode === 'custom'}
                  onChange={() => update('tools_mode', 'custom')} />
                Custom list
              </label>
            </div>
            {f.tools_mode === 'custom' && (
              <input className="cmp-input cmp-input--mono" placeholder="web_search, bash, read_file"
                value={f.tools_custom} onChange={e => update('tools_custom', e.target.value)} />
            )}
          </div>

          {/* Disallowed tools */}
          <div className="cmp-field">
            <label>Disallowed tools <span className="cmp-hint">(comma-separated)</span></label>
            <input className="cmp-input cmp-input--mono" placeholder="bash, delete_file"
              value={f.disallowed_tools} onChange={e => update('disallowed_tools', e.target.value)} />
          </div>

          {/* Max turns + Permission mode */}
          <div className="cmp-form-row">
            <div className="cmp-field" style={{ flex: 1 }}>
              <label>Max turns</label>
              <input className="cmp-input" type="number" min={1} max={500}
                value={f.max_turns} onChange={e => update('max_turns', parseInt(e.target.value) || 50)} />
            </div>
            <div className="cmp-field" style={{ flex: 1 }}>
              <label>Permission mode</label>
              <select className="cmp-select" value={f.permission_mode}
                onChange={e => update('permission_mode', e.target.value)}>
                {PERMISSION_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Enabled */}
          <div className="cmp-field cmp-field--inline">
            <label className="cmp-toggle">
              <input type="checkbox" checked={f.enabled}
                onChange={e => update('enabled', e.target.checked)} />
              <span className="cmp-toggle-track" />
              <span>Enabled</span>
            </label>
          </div>
        </div>

        <div className="cmp-modal-footer">
          <button className="cmp-btn cmp-btn--ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="cmp-btn cmp-btn--primary" onClick={() => onSave(f)} disabled={saving || !f.slug.trim()}>
            {saving ? <LoadingOne size={14} className="spin" /> : <CheckOne size={14} />}
            {isNew ? 'Create' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Delete confirm ────────────────────────────────────────────────────────────

function DeleteConfirm({ agent, onConfirm, onClose, deleting }: {
  agent: Agent; onConfirm: () => void; onClose: () => void; deleting: boolean
}) {
  return (
    <div className="cmp-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="cmp-modal cmp-modal--sm">
        <div className="cmp-modal-header">
          <h2>Delete companion</h2>
          <button className="cmp-modal-close" onClick={onClose}><Close size={18} /></button>
        </div>
        <div className="cmp-modal-body">
          <p>Delete <strong>{agent.name || agent.slug}</strong>? This cannot be undone.</p>
        </div>
        <div className="cmp-modal-footer">
          <button className="cmp-btn cmp-btn--ghost" onClick={onClose} disabled={deleting}>Cancel</button>
          <button className="cmp-btn cmp-btn--danger" onClick={onConfirm} disabled={deleting}>
            {deleting ? <LoadingOne size={14} className="spin" /> : <Delete size={14} />}
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Toast ─────────────────────────────────────────────────────────────────────

type Toast = { id: number; msg: string; kind: 'ok' | 'err' }

function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([])
  const counter = useState(0)[0]
  let _counter = counter

  const show = useCallback((msg: string, kind: 'ok' | 'err' = 'ok') => {
    const id = ++_counter
    setToasts(prev => [...prev, { id, msg, kind }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500)
  }, [])

  return { toasts, show }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function CompanionPage() {
  const navigate        = useNavigate()
  const collapsed       = useUIStore(s => s.sidebarCollapsed)

  const [agents,    setAgents]    = useState<Agent[]>([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState<string | null>(null)
  const [modal,     setModal]     = useState<'create' | 'edit' | null>(null)
  const [editTarget, setEditTarget] = useState<Agent | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Agent | null>(null)
  const [saving,    setSaving]    = useState(false)
  const [deleting,  setDeleting]  = useState(false)
  const [launching, setLaunching] = useState<string | null>(null)

  const { toasts, show } = useToast()

  const platformAgents = agents.filter(a => a.source !== 'user')
  const userAgents     = agents.filter(a => a.source === 'user')

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const data = await api.get<{ agents: Agent[] }>('/agents')
      setAgents(data.agents ?? [])
    } catch (e) {
      setError((e as { message?: string })?.message ?? 'Failed to load agents')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleChat = useCallback(async (agent: Agent) => {
    setLaunching(agent.slug)
    try {
      const session = await api.post<{ session_id: string }>('/sessions', {
        title: agent.name || agent.slug,
        agent_slug: agent.slug,
      })
      navigate(`/conversation/${session.session_id}`)
    } catch (e) {
      show((e as { message?: string })?.message ?? 'Failed to start session', 'err')
    } finally {
      setLaunching(null)
    }
  }, [navigate, show])

  const handleSave = useCallback(async (f: AgentForm) => {
    setSaving(true)
    try {
      if (modal === 'create') {
        const body = formToBody(f)
        const created = await api.post<Agent>('/agents', body)
        setAgents(prev => [...prev, created])
        show(`"${created.name || created.slug}" created`)
      } else if (modal === 'edit' && editTarget) {
        const { slug: _, ...rest } = formToBody(f) as CreateAgentBody & { slug?: string }
        const updated = await api.put<Agent>(`/agents/${editTarget.slug}`, rest as UpdateAgentBody)
        setAgents(prev => prev.map(a => a.slug === editTarget.slug ? updated : a))
        show(`"${updated.name || updated.slug}" updated`)
      }
      setModal(null); setEditTarget(null)
    } catch (e) {
      show((e as { message?: string })?.message ?? 'Save failed', 'err')
    } finally {
      setSaving(false)
    }
  }, [modal, editTarget, show])

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await api.delete(`/agents/${deleteTarget.slug}`)
      setAgents(prev => prev.filter(a => a.slug !== deleteTarget.slug))
      show(`"${deleteTarget.name || deleteTarget.slug}" deleted`)
      setDeleteTarget(null)
    } catch (e) {
      show((e as { message?: string })?.message ?? 'Delete failed', 'err')
    } finally {
      setDeleting(false)
    }
  }, [deleteTarget, show])

  const openEdit = (a: Agent) => {
    setEditTarget(a); setModal('edit')
  }

  return (
    <div className="cmp-root" data-sidebar-collapsed={collapsed}>
      <style>{CSS}</style>
      <style>{AVATAR_CSS}</style>

      {/* Toasts */}
      <div className="cmp-toasts">
        {toasts.map(t => (
          <div key={t.id} className={`cmp-toast cmp-toast--${t.kind}`}>{t.msg}</div>
        ))}
      </div>

      {/* Top bar */}
      <div className="cmp-topbar">
        <h1 className="cmp-title">Companion</h1>
        <div className="cmp-topbar-right">
          <button className="cmp-btn cmp-btn--ghost cmp-btn--icon" onClick={load} title="Refresh">
            <Sync theme="outline" size={16} />
          </button>
          <button className="cmp-btn cmp-btn--primary" onClick={() => setModal('create')}>
            <Plus theme="outline" size={16} />
            New companion
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="cmp-body">
        {loading && (
          <div className="cmp-center">
            <LoadingOne size={24} className="spin" />
            <p>Loading companions…</p>
          </div>
        )}

        {!loading && error && (
          <div className="cmp-center cmp-center--err">
            <Caution size={20} />
            <p>{error}</p>
            <button className="cmp-btn cmp-btn--ghost" onClick={load}>Retry</button>
          </div>
        )}

        {!loading && !error && (
          <>
            {/* Platform agents */}
            {platformAgents.length > 0 && (
              <section className="cmp-section">
                <div className="cmp-section-header">
                  <h2 className="cmp-section-title">Platform agents</h2>
                  <p className="cmp-section-sub">Built and maintained by the platform. Available to all users.</p>
                </div>
                <div className="cmp-grid">
                  {platformAgents.map(a => (
                    <PlatformCard
                      key={a.slug}
                      agent={a}
                      onChat={launching === a.slug ? () => {} : handleChat}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* User agents */}
            <section className="cmp-section">
              <div className="cmp-section-header">
                <h2 className="cmp-section-title">My companions</h2>
                <p className="cmp-section-sub">Custom agents you've created, each with their own face.</p>
              </div>
              <div className="cmp-grid">
                <CreateCard onClick={() => setModal('create')} />
                {userAgents.map(a => (
                  <UserCard
                    key={a.slug}
                    agent={a}
                    onChat={launching === a.slug ? () => {} : handleChat}
                    onEdit={openEdit}
                    onDelete={setDeleteTarget}
                  />
                ))}
              </div>
              {userAgents.length === 0 && (
                <p className="cmp-empty">No custom companions yet. Create one to get started.</p>
              )}
            </section>
          </>
        )}
      </div>

      {/* Modals */}
      {(modal === 'create' || modal === 'edit') && (
        <AgentModal
          initial={modal === 'edit' && editTarget ? agentToForm(editTarget) : null}
          onSave={handleSave}
          onClose={() => { setModal(null); setEditTarget(null) }}
          saving={saving}
        />
      )}
      {deleteTarget && (
        <DeleteConfirm
          agent={deleteTarget}
          onConfirm={handleDelete}
          onClose={() => setDeleteTarget(null)}
          deleting={deleting}
        />
      )}
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const CSS = `
.cmp-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: var(--color-bg);
  font-family: var(--font-sans);
}

/* Topbar */
.cmp-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 28px;
  height: 60px;
  border-bottom: 1px solid var(--color-border-subtle);
  flex-shrink: 0;
}
.cmp-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text);
  margin: 0;
}
.cmp-topbar-right { display: flex; align-items: center; gap: 8px; }

/* Body */
.cmp-body {
  flex: 1;
  overflow-y: auto;
  padding: 32px 28px;
  display: flex;
  flex-direction: column;
  gap: 40px;
}

/* Sections */
.cmp-section { display: flex; flex-direction: column; gap: 16px; }
.cmp-section-header { display: flex; flex-direction: column; gap: 3px; }
.cmp-section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin: 0;
}
.cmp-section-sub {
  font-size: 13px;
  color: var(--color-text-muted);
  margin: 0;
}

/* Grid */
.cmp-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 14px;
}

/* Cards */
.cmp-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border-subtle);
  border-radius: 12px;
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.cmp-card--platform {
  border-color: var(--color-border-subtle);
}
.cmp-card--platform:hover {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 1px var(--color-primary-subtle), var(--shadow-soft);
}
.cmp-card--user:hover {
  border-color: var(--color-border);
  box-shadow: var(--shadow-soft);
}
.cmp-card--create {
  background: transparent;
  border: 1.5px dashed var(--color-border);
  border-radius: 12px;
  padding: 18px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 140px;
  cursor: pointer;
  color: var(--color-text-muted);
  font-size: 13px;
  font-weight: 500;
  transition: border-color 0.15s, color 0.15s, background 0.15s;
}
.cmp-card--create:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
  background: var(--color-primary-subtle);
}

/* Card internals */
.cmp-card-header {
  display: flex;
  align-items: center;
  gap: 12px;
}
.cmp-card-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.cmp-card-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cmp-card-desc {
  font-size: 12.5px;
  color: var(--color-text-secondary);
  line-height: 1.5;
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.cmp-card-tools {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11.5px;
  color: var(--color-text-muted);
  margin-top: 2px;
}
.cmp-dot {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: var(--color-text-disabled);
}
.cmp-card-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
}

/* Badges */
.cmp-badge {
  font-size: 10px;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 20px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  width: fit-content;
}
.cmp-badge--platform {
  background: var(--color-primary-subtle);
  color: var(--color-primary);
}
.cmp-badge--disabled {
  background: var(--color-hover);
  color: var(--color-text-muted);
}

/* Buttons */
.cmp-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border: none;
  transition: background 0.15s, color 0.15s, opacity 0.15s;
  white-space: nowrap;
}
.cmp-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.cmp-btn--primary {
  background: var(--color-primary);
  color: #fff;
}
.cmp-btn--primary:hover:not(:disabled) { opacity: 0.88; }
.cmp-btn--ghost {
  background: var(--color-hover);
  color: var(--color-text-secondary);
}
.cmp-btn--ghost:hover:not(:disabled) {
  background: var(--color-active);
  color: var(--color-text);
}
.cmp-btn--danger {
  color: var(--color-error);
}
.cmp-btn--danger:hover:not(:disabled) {
  background: rgba(201,107,92,0.12);
  color: var(--color-error);
}
.cmp-btn--icon { padding: 7px; }
.cmp-btn--full { flex: 1; justify-content: center; }

/* Empty state */
.cmp-empty {
  font-size: 13px;
  color: var(--color-text-muted);
  margin: 0;
  padding: 8px 0;
}

/* Center states */
.cmp-center {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  height: 200px;
  color: var(--color-text-muted);
  font-size: 14px;
}
.cmp-center--err { color: var(--color-error); }

/* Overlay / Modal */
.cmp-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 24px;
}
.cmp-modal {
  background: var(--color-surface);
  border: 1px solid var(--color-border-subtle);
  border-radius: 16px;
  width: 100%;
  max-width: 560px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow-large);
}
.cmp-modal--sm { max-width: 380px; }
.cmp-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px 16px;
  border-bottom: 1px solid var(--color-border-subtle);
  flex-shrink: 0;
}
.cmp-modal-header h2 {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
  margin: 0;
}
.cmp-modal-close {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--color-text-muted);
  padding: 4px;
  border-radius: 6px;
  display: flex;
  transition: background 0.15s;
}
.cmp-modal-close:hover { background: var(--color-hover); color: var(--color-text); }
.cmp-modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.cmp-modal-footer {
  padding: 16px 24px;
  border-top: 1px solid var(--color-border-subtle);
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  flex-shrink: 0;
}

/* Form fields */
.cmp-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.cmp-field--inline { flex-direction: row; align-items: center; }
.cmp-field label {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.cmp-form-row {
  display: flex;
  gap: 12px;
}
.cmp-form-row--icon { align-items: flex-start; }
.cmp-required { color: var(--color-error); }
.cmp-hint { font-weight: 400; text-transform: none; letter-spacing: 0; color: var(--color-text-muted); }

.cmp-input, .cmp-textarea, .cmp-select {
  background: var(--color-bg);
  border: 1px solid var(--color-border-subtle);
  border-radius: 8px;
  color: var(--color-text);
  font-size: 13px;
  font-family: var(--font-sans);
  padding: 8px 12px;
  outline: none;
  transition: border-color 0.15s;
  width: 100%;
  box-sizing: border-box;
}
.cmp-input:focus, .cmp-textarea:focus, .cmp-select:focus {
  border-color: var(--color-primary);
}
.cmp-input--mono { font-family: monospace; font-size: 12px; }
.cmp-textarea { resize: vertical; min-height: 120px; line-height: 1.6; }
.cmp-select { cursor: pointer; }

.cmp-radio-group { display: flex; gap: 16px; }
.cmp-radio {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--color-text-secondary);
  cursor: pointer;
  text-transform: none;
  font-weight: 400;
  letter-spacing: 0;
}
.cmp-radio input { cursor: pointer; accent-color: var(--color-primary); }

/* Toggle */
.cmp-toggle {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  font-size: 13px;
  color: var(--color-text-secondary);
  font-weight: 400;
  text-transform: none;
  letter-spacing: 0;
  user-select: none;
}
.cmp-toggle input { display: none; }
.cmp-toggle-track {
  width: 36px;
  height: 20px;
  border-radius: 10px;
  background: var(--color-border);
  position: relative;
  transition: background 0.2s;
  flex-shrink: 0;
}
.cmp-toggle-track::after {
  content: '';
  position: absolute;
  top: 3px; left: 3px;
  width: 14px; height: 14px;
  border-radius: 50%;
  background: #fff;
  transition: transform 0.2s;
}
.cmp-toggle input:checked + .cmp-toggle-track { background: var(--color-primary); }
.cmp-toggle input:checked + .cmp-toggle-track::after { transform: translateX(16px); }

/* Toasts */
.cmp-toasts {
  position: fixed;
  bottom: 24px;
  right: 24px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 2000;
}
.cmp-toast {
  padding: 10px 16px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  box-shadow: var(--shadow-medium);
  animation: cmp-slide-in 0.2s ease;
}
.cmp-toast--ok {
  background: var(--color-surface);
  border: 1px solid rgba(111,175,123,0.4);
  color: var(--color-success);
}
.cmp-toast--err {
  background: var(--color-surface);
  border: 1px solid rgba(201,107,92,0.4);
  color: var(--color-error);
}
@keyframes cmp-slide-in {
  from { opacity: 0; transform: translateX(12px); }
  to   { opacity: 1; transform: translateX(0); }
}

/* Spinner */
.spin {
  animation: cmp-spin 0.8s linear infinite;
}
@keyframes cmp-spin {
  to { transform: rotate(360deg); }
}
`
