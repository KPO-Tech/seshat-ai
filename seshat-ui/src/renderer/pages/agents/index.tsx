import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus, Edit, Delete, LoadingOne, Caution, Robot, Send,
  Close, CheckOne, Sync,
} from '@icon-park/react'
import { api } from '@/api/client'
import { useUIStore } from '@/stores/ui'
import type { Agent, CreateAgentBody, UpdateAgentBody } from '@/api/types'

// ─── Constants ────────────────────────────────────────────────────────────────

const PERMISSION_OPTIONS = [
  { value: '',             label: 'Default' },
  { value: 'onRequest',   label: 'On Request' },
  { value: 'auto',        label: 'Auto' },
  { value: 'acceptEdits', label: 'Accept Edits' },
  { value: 'bypass',      label: 'Bypass' },
  { value: 'never',       label: 'Never' },
]

const AVATAR_COLORS = [
  '#EF7C2F','#6B39CB','#10A37F','#4285F4',
  '#D97757','#C89A6A','#6FAF7B','#7D9CCF',
]

function avatarColor(slug: string): string {
  let h = 0
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

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
  slug: '', name: '', icon: '🤖', when_to_use: '', system_prompt: '',
  model: '', tools_mode: 'all', tools_custom: '', disallowed_tools: '',
  max_turns: 50, permission_mode: '', enabled: true,
}

function agentToForm(a: Agent): AgentForm {
  const hasCustomTools = Array.isArray(a.tools) && a.tools.length > 0 &&
    !(a.tools.length === 1 && a.tools[0] === '*')
  return {
    slug: a.slug,
    name: a.name || a.slug,
    icon: a.icon || '🤖',
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

// ─── Agent avatar ──────────────────────────────────────────────────────────────

function AgentAvatar({ agent, size = 44 }: { agent: Agent; size?: number }) {
  const isEmoji = agent.icon && /\p{Emoji}/u.test(agent.icon)
  if (isEmoji) {
    return (
      <div className="agt-avatar" style={{ width: size, height: size, fontSize: size * 0.52, background: 'var(--color-surface-elevated)' }}>
        {agent.icon}
      </div>
    )
  }
  const color = avatarColor(agent.slug)
  const initial = (agent.name || agent.slug || '?')[0].toUpperCase()
  return (
    <div className="agt-avatar" style={{ width: size, height: size, background: color, fontSize: size * 0.42 }}>
      {initial}
    </div>
  )
}

// ─── Platform agent card ───────────────────────────────────────────────────────

function PlatformCard({ agent, onChat }: { agent: Agent; onChat: (a: Agent) => void }) {
  const toolCount = agent.tools?.length ?? 0
  const allTools  = !agent.tools || (agent.tools.length === 1 && agent.tools[0] === '*')

  return (
    <div className="agt-card agt-card--platform">
      <div className="agt-card-header">
        <AgentAvatar agent={agent} size={42} />
        <div className="agt-card-meta">
          <span className="agt-card-name">{agent.name || agent.slug}</span>
          <span className="agt-badge agt-badge--platform">
            {agent.source === 'organization' ? 'Organization' : 'Platform'}
          </span>
        </div>
      </div>

      {agent.when_to_use && (
        <p className="agt-card-desc">{agent.when_to_use}</p>
      )}

      <div className="agt-card-tools">
        <Robot theme="outline" size={12} />
        <span>{allTools ? 'All tools' : `${toolCount} tool${toolCount !== 1 ? 's' : ''}`}</span>
        {agent.max_turns > 0 && <span className="agt-dot" />}
        {agent.max_turns > 0 && <span>{agent.max_turns} turns</span>}
      </div>

      <div className="agt-card-actions">
        <button className="agt-btn agt-btn--primary agt-btn--full" onClick={() => onChat(agent)}>
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
    <div className="agt-card agt-card--user">
      <div className="agt-card-header">
        <AgentAvatar agent={agent} size={42} />
        <div className="agt-card-meta">
          <span className="agt-card-name">{agent.name || agent.slug}</span>
          {!agent.enabled && <span className="agt-badge agt-badge--disabled">Disabled</span>}
        </div>
      </div>

      {agent.when_to_use && (
        <p className="agt-card-desc">{agent.when_to_use}</p>
      )}

      <div className="agt-card-tools">
        <Robot theme="outline" size={12} />
        <span>
          {!agent.tools || (agent.tools.length === 1 && agent.tools[0] === '*')
            ? 'All tools'
            : `${agent.tools.length} tool${agent.tools.length !== 1 ? 's' : ''}`}
        </span>
        {agent.max_turns > 0 && <span className="agt-dot" />}
        {agent.max_turns > 0 && <span>{agent.max_turns} turns</span>}
      </div>

      <div className="agt-card-actions">
        <button className="agt-btn agt-btn--primary" onClick={() => onChat(agent)}>
          <Send theme="outline" size={14} />
          Chat
        </button>
        <button className="agt-btn agt-btn--ghost" onClick={() => onEdit(agent)} title="Edit">
          <Edit theme="outline" size={14} />
        </button>
        <button className="agt-btn agt-btn--ghost agt-btn--danger" onClick={() => onDelete(agent)} title="Delete">
          <Delete theme="outline" size={14} />
        </button>
      </div>
    </div>
  )
}

// ─── Create card ───────────────────────────────────────────────────────────────

function CreateCard({ onClick }: { onClick: () => void }) {
  return (
    <button className="agt-card agt-card--create" onClick={onClick}>
      <Plus theme="outline" size={24} />
      <span>New agent</span>
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

  return (
    <div className="agt-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="agt-modal">
        <div className="agt-modal-header">
          <h2>{isNew ? 'New agent' : 'Edit agent'}</h2>
          <button className="agt-modal-close" onClick={onClose}><Close size={18} /></button>
        </div>

        <div className="agt-modal-body">
          {/* Icon + Name row */}
          <div className="agt-form-row agt-form-row--icon">
            <div className="agt-field" style={{ width: 72 }}>
              <label>Icon</label>
              <input
                className="agt-input agt-input--center"
                value={f.icon}
                maxLength={4}
                onChange={e => update('icon', e.target.value)}
              />
            </div>
            <div className="agt-field" style={{ flex: 1 }}>
              <label>Name <span className="agt-required">*</span></label>
              <input className="agt-input" placeholder="My agent" value={f.name}
                onChange={e => onNameChange(e.target.value)} />
            </div>
          </div>

          {/* Slug */}
          <div className="agt-field">
            <label>Slug <span className="agt-required">*</span></label>
            <input className="agt-input agt-input--mono" placeholder="my-agent"
              value={f.slug} onChange={e => update('slug', e.target.value)} />
          </div>

          {/* When to use */}
          <div className="agt-field">
            <label>When to use</label>
            <input className="agt-input" placeholder="Use this agent when…"
              value={f.when_to_use} onChange={e => update('when_to_use', e.target.value)} />
          </div>

          {/* System prompt */}
          <div className="agt-field">
            <label>System prompt</label>
            <textarea className="agt-textarea" rows={7}
              placeholder={'You are a helpful assistant specialized in…\n\nYour role is to…'}
              value={f.system_prompt}
              onChange={e => update('system_prompt', e.target.value)} />
          </div>

          {/* Model */}
          <div className="agt-field">
            <label>Model <span className="agt-hint">(optional, overrides default)</span></label>
            <input className="agt-input agt-input--mono" placeholder="anthropic:claude-sonnet-4-6"
              value={f.model} onChange={e => update('model', e.target.value)} />
          </div>

          {/* Tools */}
          <div className="agt-field">
            <label>Tools</label>
            <div className="agt-radio-group">
              <label className="agt-radio">
                <input type="radio" checked={f.tools_mode === 'all'}
                  onChange={() => update('tools_mode', 'all')} />
                All tools
              </label>
              <label className="agt-radio">
                <input type="radio" checked={f.tools_mode === 'custom'}
                  onChange={() => update('tools_mode', 'custom')} />
                Custom list
              </label>
            </div>
            {f.tools_mode === 'custom' && (
              <input className="agt-input agt-input--mono" placeholder="web_search, bash, read_file"
                value={f.tools_custom} onChange={e => update('tools_custom', e.target.value)} />
            )}
          </div>

          {/* Disallowed tools */}
          <div className="agt-field">
            <label>Disallowed tools <span className="agt-hint">(comma-separated)</span></label>
            <input className="agt-input agt-input--mono" placeholder="bash, delete_file"
              value={f.disallowed_tools} onChange={e => update('disallowed_tools', e.target.value)} />
          </div>

          {/* Max turns + Permission mode */}
          <div className="agt-form-row">
            <div className="agt-field" style={{ flex: 1 }}>
              <label>Max turns</label>
              <input className="agt-input" type="number" min={1} max={500}
                value={f.max_turns} onChange={e => update('max_turns', parseInt(e.target.value) || 50)} />
            </div>
            <div className="agt-field" style={{ flex: 1 }}>
              <label>Permission mode</label>
              <select className="agt-select" value={f.permission_mode}
                onChange={e => update('permission_mode', e.target.value)}>
                {PERMISSION_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Enabled */}
          <div className="agt-field agt-field--inline">
            <label className="agt-toggle">
              <input type="checkbox" checked={f.enabled}
                onChange={e => update('enabled', e.target.checked)} />
              <span className="agt-toggle-track" />
              <span>Enabled</span>
            </label>
          </div>
        </div>

        <div className="agt-modal-footer">
          <button className="agt-btn agt-btn--ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="agt-btn agt-btn--primary" onClick={() => onSave(f)} disabled={saving || !f.slug.trim()}>
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
    <div className="agt-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="agt-modal agt-modal--sm">
        <div className="agt-modal-header">
          <h2>Delete agent</h2>
          <button className="agt-modal-close" onClick={onClose}><Close size={18} /></button>
        </div>
        <div className="agt-modal-body">
          <p>Delete <strong>{agent.name || agent.slug}</strong>? This cannot be undone.</p>
        </div>
        <div className="agt-modal-footer">
          <button className="agt-btn agt-btn--ghost" onClick={onClose} disabled={deleting}>Cancel</button>
          <button className="agt-btn agt-btn--danger" onClick={onConfirm} disabled={deleting}>
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

export function AgentsPage() {
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
        show(`Agent "${created.name || created.slug}" created`)
      } else if (modal === 'edit' && editTarget) {
        const { slug: _, ...rest } = formToBody(f) as CreateAgentBody & { slug?: string }
        const updated = await api.put<Agent>(`/agents/${editTarget.slug}`, rest as UpdateAgentBody)
        setAgents(prev => prev.map(a => a.slug === editTarget.slug ? updated : a))
        show(`Agent "${updated.name || updated.slug}" updated`)
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
      show(`Agent "${deleteTarget.name || deleteTarget.slug}" deleted`)
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
    <div className="agt-root" data-sidebar-collapsed={collapsed}>
      {/* Toasts */}
      <div className="agt-toasts">
        {toasts.map(t => (
          <div key={t.id} className={`agt-toast agt-toast--${t.kind}`}>{t.msg}</div>
        ))}
      </div>

      {/* Top bar */}
      <div className="agt-topbar">
        <h1 className="agt-title">Agents</h1>
        <div className="agt-topbar-right">
          <button className="agt-btn agt-btn--ghost agt-btn--icon" onClick={load} title="Refresh">
            <Sync theme="outline" size={16} />
          </button>
          <button className="agt-btn agt-btn--primary" onClick={() => setModal('create')}>
            <Plus theme="outline" size={16} />
            New agent
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="agt-body">
        {loading && (
          <div className="agt-center">
            <LoadingOne size={24} className="spin" />
            <p>Loading agents…</p>
          </div>
        )}

        {!loading && error && (
          <div className="agt-center agt-center--err">
            <Caution size={20} />
            <p>{error}</p>
            <button className="agt-btn agt-btn--ghost" onClick={load}>Retry</button>
          </div>
        )}

        {!loading && !error && (
          <>
            {/* Platform agents */}
            {platformAgents.length > 0 && (
              <section className="agt-section">
                <div className="agt-section-header">
                  <h2 className="agt-section-title">Platform agents</h2>
                  <p className="agt-section-sub">Built and maintained by the platform. Available to all users.</p>
                </div>
                <div className="agt-grid">
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
            <section className="agt-section">
              <div className="agt-section-header">
                <h2 className="agt-section-title">My agents</h2>
                <p className="agt-section-sub">Custom agents you've created.</p>
              </div>
              <div className="agt-grid">
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
                <p className="agt-empty">No custom agents yet. Create one to get started.</p>
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

const _css = `
.agt-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: var(--color-bg);
  font-family: var(--font-sans);
}

/* Topbar */
.agt-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 28px;
  height: 60px;
  border-bottom: 1px solid var(--color-border-subtle);
  flex-shrink: 0;
}
.agt-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text);
  margin: 0;
}
.agt-topbar-right { display: flex; align-items: center; gap: 8px; }

/* Body */
.agt-body {
  flex: 1;
  overflow-y: auto;
  padding: 32px 28px;
  display: flex;
  flex-direction: column;
  gap: 40px;
}

/* Sections */
.agt-section { display: flex; flex-direction: column; gap: 16px; }
.agt-section-header { display: flex; flex-direction: column; gap: 3px; }
.agt-section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin: 0;
}
.agt-section-sub {
  font-size: 13px;
  color: var(--color-text-muted);
  margin: 0;
}

/* Grid */
.agt-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 14px;
}

/* Cards */
.agt-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border-subtle);
  border-radius: 12px;
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.agt-card--platform {
  border-color: var(--color-border-subtle);
}
.agt-card--platform:hover {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 1px var(--color-primary-subtle), var(--shadow-soft);
}
.agt-card--user:hover {
  border-color: var(--color-border);
  box-shadow: var(--shadow-soft);
}
.agt-card--create {
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
.agt-card--create:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
  background: var(--color-primary-subtle);
}

/* Card internals */
.agt-card-header {
  display: flex;
  align-items: center;
  gap: 12px;
}
.agt-avatar {
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  flex-shrink: 0;
  color: #fff;
  font-weight: 600;
}
.agt-card-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.agt-card-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.agt-card-desc {
  font-size: 12.5px;
  color: var(--color-text-secondary);
  line-height: 1.5;
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.agt-card-tools {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11.5px;
  color: var(--color-text-muted);
  margin-top: 2px;
}
.agt-dot {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: var(--color-text-disabled);
}
.agt-card-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
}

/* Badges */
.agt-badge {
  font-size: 10px;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 20px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  width: fit-content;
}
.agt-badge--platform {
  background: var(--color-primary-subtle);
  color: var(--color-primary);
}
.agt-badge--disabled {
  background: var(--color-hover);
  color: var(--color-text-muted);
}

/* Buttons */
.agt-btn {
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
.agt-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.agt-btn--primary {
  background: var(--color-primary);
  color: #fff;
}
.agt-btn--primary:hover:not(:disabled) { background: #d96e28; }
.agt-btn--ghost {
  background: var(--color-hover);
  color: var(--color-text-secondary);
}
.agt-btn--ghost:hover:not(:disabled) {
  background: var(--color-active);
  color: var(--color-text);
}
.agt-btn--danger {
  color: var(--color-error);
}
.agt-btn--danger:hover:not(:disabled) {
  background: rgba(201,107,92,0.12);
  color: var(--color-error);
}
.agt-btn--icon { padding: 7px; }
.agt-btn--full { flex: 1; justify-content: center; }

/* Empty state */
.agt-empty {
  font-size: 13px;
  color: var(--color-text-muted);
  margin: 0;
  padding: 8px 0;
}

/* Center states */
.agt-center {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  height: 200px;
  color: var(--color-text-muted);
  font-size: 14px;
}
.agt-center--err { color: var(--color-error); }

/* Overlay / Modal */
.agt-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 24px;
}
.agt-modal {
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
.agt-modal--sm { max-width: 380px; }
.agt-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px 16px;
  border-bottom: 1px solid var(--color-border-subtle);
  flex-shrink: 0;
}
.agt-modal-header h2 {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
  margin: 0;
}
.agt-modal-close {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--color-text-muted);
  padding: 4px;
  border-radius: 6px;
  display: flex;
  transition: background 0.15s;
}
.agt-modal-close:hover { background: var(--color-hover); color: var(--color-text); }
.agt-modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.agt-modal-footer {
  padding: 16px 24px;
  border-top: 1px solid var(--color-border-subtle);
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  flex-shrink: 0;
}

/* Form fields */
.agt-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.agt-field--inline { flex-direction: row; align-items: center; }
.agt-field label {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.agt-form-row {
  display: flex;
  gap: 12px;
}
.agt-form-row--icon { align-items: flex-end; }
.agt-required { color: var(--color-error); }
.agt-hint { font-weight: 400; text-transform: none; letter-spacing: 0; color: var(--color-text-muted); }

.agt-input, .agt-textarea, .agt-select {
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
.agt-input:focus, .agt-textarea:focus, .agt-select:focus {
  border-color: var(--color-primary);
}
.agt-input--mono, .agt-input--mono input { font-family: monospace; font-size: 12px; }
.agt-input--center { text-align: center; font-size: 20px; padding: 6px 8px; }
.agt-textarea { resize: vertical; min-height: 120px; line-height: 1.6; }
.agt-select { cursor: pointer; }

.agt-radio-group { display: flex; gap: 16px; }
.agt-radio {
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
.agt-radio input { cursor: pointer; accent-color: var(--color-primary); }

/* Toggle */
.agt-toggle {
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
.agt-toggle input { display: none; }
.agt-toggle-track {
  width: 36px;
  height: 20px;
  border-radius: 10px;
  background: var(--color-border);
  position: relative;
  transition: background 0.2s;
  flex-shrink: 0;
}
.agt-toggle-track::after {
  content: '';
  position: absolute;
  top: 3px; left: 3px;
  width: 14px; height: 14px;
  border-radius: 50%;
  background: #fff;
  transition: transform 0.2s;
}
.agt-toggle input:checked + .agt-toggle-track { background: var(--color-primary); }
.agt-toggle input:checked + .agt-toggle-track::after { transform: translateX(16px); }

/* Toasts */
.agt-toasts {
  position: fixed;
  bottom: 24px;
  right: 24px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 2000;
}
.agt-toast {
  padding: 10px 16px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  box-shadow: var(--shadow-medium);
  animation: agt-slide-in 0.2s ease;
}
.agt-toast--ok {
  background: var(--color-surface);
  border: 1px solid rgba(111,175,123,0.4);
  color: var(--color-success);
}
.agt-toast--err {
  background: var(--color-surface);
  border: 1px solid rgba(201,107,92,0.4);
  color: var(--color-error);
}
@keyframes agt-slide-in {
  from { opacity: 0; transform: translateX(12px); }
  to   { opacity: 1; transform: translateX(0); }
}

/* Spinner */
.spin {
  animation: agt-spin 0.8s linear infinite;
}
@keyframes agt-spin {
  to { transform: rotate(360deg); }
}
`

if (typeof document !== 'undefined') {
  const id = 'agt-styles'
  if (!document.getElementById(id)) {
    const el = document.createElement('style')
    el.id = id
    el.textContent = _css
    document.head.appendChild(el)
  }
}
