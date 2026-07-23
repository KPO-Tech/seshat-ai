import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Left, Robot, Plus, Edit, Delete, Sync, Close, CheckOne,
  Caution, LoadingOne, Brain, Lightning, Send,
} from '@icon-park/react'
import Picker from '@emoji-mart/react'
import data from '@emoji-mart/data'
import { api } from '@/api/client'
import { useUIStore } from '@/stores/ui'
import { useSessionStore, streamingToContentBlocks } from '@/stores/session'
import { useChat } from '@/hooks/useChat'
import { NexusLogo } from '@/components/NexusLogo'
import type { Agent, Session, Corpus, CorpusFile, IngestionJob } from '@/api/types'

// ─── Constants ────────────────────────────────────────────────────────────────

type WorkspaceTab = 'agents' | 'knowledge'
type AgentsView   = 'grid' | 'detail'
type DetailTab    = 'edit' | 'test'

const PERMISSION_MODE_OPTIONS = [
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

function agentColor(slug: string): string {
  let h = 0
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

function toSlug(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

function getInitial(name: string, slug: string): string {
  const src = (name || slug || '?').trim()
  return src[0].toUpperCase()
}

// ─── Form types ───────────────────────────────────────────────────────────────

type AgentForm = {
  slug: string; name: string; icon: string; when_to_use: string
  system_prompt: string; model: string
  tools_mode: 'all' | 'custom'; tools_custom: string; disallowed_tools: string
  max_turns: number; permission_mode: string; enabled: boolean
}

const BLANK_FORM: AgentForm = {
  slug: '', name: '', icon: '', when_to_use: '',
  system_prompt: '', model: '',
  tools_mode: 'all', tools_custom: '', disallowed_tools: '',
  max_turns: 50, permission_mode: '', enabled: true,
}

function agentToForm(a: Agent): AgentForm {
  return {
    slug: a.slug, name: a.name, icon: a.icon ?? '',
    when_to_use: a.when_to_use ?? '', system_prompt: a.system_prompt ?? '',
    model: a.model ?? '',
    tools_mode: (a.tools?.length ?? 0) > 0 ? 'custom' : 'all',
    tools_custom: (a.tools ?? []).join(', '),
    disallowed_tools: (a.disallowed_tools ?? []).join(', '),
    max_turns: a.max_turns ?? 50, permission_mode: a.permission_mode ?? '',
    enabled: a.enabled,
  }
}

function formToBody(f: AgentForm): Record<string, unknown> {
  const tools = f.tools_mode === 'all'
    ? []
    : f.tools_custom.split(',').map(s => s.trim()).filter(Boolean)
  const disallowed = f.disallowed_tools.split(',').map(s => s.trim()).filter(Boolean)
  return {
    slug: f.slug.trim(),
    name: f.name.trim() || undefined,
    icon: f.icon.trim() || undefined,
    when_to_use: f.when_to_use.trim() || undefined,
    system_prompt: f.system_prompt.trim() || undefined,
    model: f.model.trim() || undefined,
    tools, disallowed_tools: disallowed,
    max_turns: f.max_turns,
    permission_mode: f.permission_mode || undefined,
    enabled: f.enabled,
  }
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ agent, size = 40 }: { agent: Agent; size?: number }) {
  const icon = agent.icon?.trim()
  const color = agentColor(agent.slug)
  const isEmoji = icon ? (icon.length > 1 || (icon.codePointAt(0) ?? 0) > 127) : false
  const radius = Math.round(size * 0.28)
  const label = icon ? (isEmoji ? icon : icon[0].toUpperCase()) : getInitial(agent.name, agent.slug)

  return (
    <div
      className="wk-avatar"
      style={{ width: size, height: size, borderRadius: radius, background: (icon && isEmoji) ? undefined : color, fontSize: Math.round(size * 0.45) }}
    >
      {label}
    </div>
  )
}

// ─── Root page ────────────────────────────────────────────────────────────────

export function WorkspacePage() {
  const navigate = useNavigate()
  const closeAllRightPanels = useUIStore(s => s.closeAllRightPanels)

  const [tab, setTab]               = useState<WorkspaceTab>('agents')
  const [agents, setAgents]         = useState<Agent[]>([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState<string | null>(null)
  const [toast, setToast]           = useState<{ text: string; kind: 'ok' | 'err' } | null>(null)
  const [view, setView]             = useState<AgentsView>('grid')
  const [selected, setSelected]     = useState<Agent | null>(null)
  const [detailTab, setDetailTab]   = useState<DetailTab>('edit')
  const [isNewAgent, setIsNewAgent] = useState(false)

  useEffect(() => { closeAllRightPanels() }, [closeAllRightPanels])

  const showToast = useCallback((text: string, kind: 'ok' | 'err' = 'ok') => {
    setToast({ text, kind })
    setTimeout(() => setToast(null), 3000)
  }, [])

  const loadAgents = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const data = await api.get<{ agents: Agent[] }>('/agents')
      setAgents(data.agents ?? [])
    } catch (e: unknown) {
      setError((e as { message?: string })?.message ?? 'Failed to load agents')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { if (tab === 'agents') loadAgents() }, [tab, loadAgents])

  function openAgent(agent: Agent) {
    setSelected(agent); setIsNewAgent(false); setDetailTab('edit'); setView('detail')
  }
  function openNew() {
    setSelected(null); setIsNewAgent(true); setDetailTab('edit'); setView('detail')
  }
  function backToGrid() {
    setView('grid'); setSelected(null); setIsNewAgent(false)
  }
  function handleSaved(agent: Agent, isNew: boolean) {
    if (isNew) setAgents(prev => [...prev, agent])
    else       setAgents(prev => prev.map(a => a.slug === agent.slug ? agent : a))
    setSelected(agent); setIsNewAgent(false); setDetailTab('edit')
    showToast(isNew ? 'Agent created' : 'Agent saved')
  }
  async function handleDelete(agent: Agent) {
    if (!confirm(`Delete agent "${agent.name || agent.slug}"?`)) return
    try {
      await api.delete(`/agents/${agent.slug}`)
      setAgents(prev => prev.filter(a => a.slug !== agent.slug))
      backToGrid(); showToast('Agent deleted')
    } catch (e: unknown) {
      showToast((e as { message?: string })?.message ?? 'Delete failed', 'err')
    }
  }

  const userAgents    = agents.filter(a => a.source === 'user')
  const builtinAgents = agents.filter(a => a.source !== 'user')

  return (
    <div className="wk-root">
      <style>{CSS}</style>

      {toast && (
        <div className={`wk-toast ${toast.kind}`}>
          {toast.kind === 'ok' ? <CheckOne size={11} /> : <Caution size={11} />}
          {toast.text}
        </div>
      )}

      {/* ── Top bar ── */}
      <header className="wk-topbar">
        <div className="wk-topbar-left">
          {view === 'detail' ? (
            <>
              <button className="wk-back-chip" onClick={backToGrid}><Left size={11} /> Agents</button>
              <span className="wk-topbar-sep">/</span>
              <span className="wk-topbar-title">
                {selected ? (selected.name || selected.slug) : 'New Agent'}
              </span>
            </>
          ) : (
            <span className="wk-topbar-title">Workspace</span>
          )}
        </div>

        <div className="wk-topbar-right">
          {tab === 'agents' && view === 'detail' && (
            <div className="wk-detail-tabs">
              <button className={`wk-detail-tab ${detailTab === 'edit' ? 'active' : ''}`}
                onClick={() => setDetailTab('edit')}>
                <Edit size={11} /> Edit
              </button>
              <button className={`wk-detail-tab ${detailTab === 'test' ? 'active' : ''}`}
                onClick={() => setDetailTab('test')}
                disabled={!selected || selected.source !== 'user'}>
                <Lightning size={11} /> Test
              </button>
            </div>
          )}
          <div className="wk-logo-wrap">
            <NexusLogo size={20} />
          </div>
        </div>
      </header>

      {/* ── Workspace body: sidenav + content ── */}
      <div className="wk-workspace">

        {/* Left sidebar nav */}
        <nav className="wk-sidenav">
          <div className="wk-sidenav-items">
            <button
              className={`wk-sidenav-item ${tab === 'agents' ? 'active' : ''}`}
              onClick={() => { setTab('agents'); setView('grid') }}
            >
              <Robot size={15} theme="outline" />
              <span>Agents</span>
            </button>
            <button
              className={`wk-sidenav-item ${tab === 'knowledge' ? 'active' : ''}`}
              onClick={() => { setTab('knowledge'); setView('grid') }}
            >
              <Brain size={15} theme="outline" />
              <span>Knowledge</span>
            </button>
          </div>

          <div className="wk-sidenav-footer">
            <button className="wk-sidenav-back" onClick={() => navigate(-1)}>
              <Left size={11} /> Home
            </button>
          </div>
        </nav>

        {/* Content */}
        <div className="wk-body">
          {tab === 'knowledge' && <KnowledgeTab />}

          {tab === 'agents' && view === 'grid' && (
            <AgentGrid
              userAgents={userAgents} builtinAgents={builtinAgents}
              loading={loading} error={error}
              onSelect={openAgent} onNew={openNew} onRefresh={loadAgents}
            />
          )}

          {tab === 'agents' && view === 'detail' && (
            <AgentDetail
              key={selected?.slug ?? '__new__'}
              agent={selected} isNew={isNewAgent} detailTab={detailTab}
              onSaved={handleSaved} onDelete={handleDelete} onDiscard={backToGrid}
            />
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Agent grid ───────────────────────────────────────────────────────────────

function AgentGrid({ userAgents, builtinAgents, loading, error, onSelect, onNew, onRefresh }: {
  userAgents: Agent[]; builtinAgents: Agent[]
  loading: boolean; error: string | null
  onSelect: (a: Agent) => void; onNew: () => void; onRefresh: () => void
}) {
  if (loading) return <div className="wk-center"><LoadingOne size={23} className="spin" /></div>
  if (error)   return <div className="wk-center"><Caution size={18} /><p>{error}</p></div>

  return (
    <div className="wk-grid-root">
      {/* Action bar inside the grid page */}
      <div className="wk-grid-bar">
        <div className="wk-grid-bar-title">
          {userAgents.length + builtinAgents.length === 0
            ? 'No agents yet'
            : `${userAgents.length + builtinAgents.length} agent${userAgents.length + builtinAgents.length > 1 ? 's' : ''}`}
        </div>
        <div className="wk-grid-bar-actions">
          <button className="wk-icon-btn" onClick={onRefresh} title="Refresh">
            <Sync size={12} />
          </button>
          <button className="wk-new-btn" onClick={onNew}><Plus size={11} /> New Agent</button>
        </div>
      </div>

      {userAgents.length + builtinAgents.length === 0 ? (
        <div className="wk-center">
          <Robot size={39} theme="outline" />
          <h2>No agents yet</h2>
          <p>Create a custom agent with its own system prompt, tools, and personality.</p>
          <button className="wk-new-btn lg" onClick={onNew}><Plus size={12} /> Create your first agent</button>
        </div>
      ) : (
        <div className="wk-grid-scroll">
          {userAgents.length > 0 && (
            <section className="wk-grid-section">
              <div className="wk-grid-section-title">My Agents</div>
              <div className="wk-card-grid">
                {userAgents.map(a => <AgentCard key={a.slug} agent={a} onClick={() => onSelect(a)} />)}
                <button className="wk-card-new" onClick={onNew}><Plus size={21} /><span>New Agent</span></button>
              </div>
            </section>
          )}
          {builtinAgents.length > 0 && (
            <section className="wk-grid-section">
              <div className="wk-grid-section-title">Built-in</div>
              <div className="wk-card-grid">
                {builtinAgents.map(a => <AgentCard key={a.slug} agent={a} onClick={() => onSelect(a)} />)}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}

function AgentCard({ agent, onClick }: { agent: Agent; onClick: () => void }) {
  return (
    <button className={`wk-card ${!agent.enabled ? 'disabled' : ''}`} onClick={onClick}>
      <div className="wk-card-top">
        <Avatar agent={agent} size={36} />
        <div className="wk-card-badges">
          {agent.source !== 'user' && <span className="wk-badge builtin">built-in</span>}
          {!agent.enabled && <span className="wk-badge off">off</span>}
        </div>
      </div>
      <div className="wk-card-name">{agent.name || agent.slug}</div>
      {agent.when_to_use && <div className="wk-card-desc">{agent.when_to_use}</div>}
      <div className="wk-card-meta">/{agent.slug}</div>
    </button>
  )
}

// ─── Agent detail ─────────────────────────────────────────────────────────────

function AgentDetail({ agent, isNew, detailTab, onSaved, onDelete, onDiscard }: {
  agent: Agent | null; isNew: boolean; detailTab: DetailTab
  onSaved: (a: Agent, isNew: boolean) => void
  onDelete: (a: Agent) => void
  onDiscard: () => void
}) {
  const isBuiltin = !isNew && agent?.source !== 'user'
  return (
    <div className="wk-detail">
      {isBuiltin && (
        <div className="wk-readonly-banner"><Caution size={11} /> Built-in agents are read-only.</div>
      )}
      <div className="wk-detail-body">
        {detailTab === 'edit' && (
          <AgentFormPanel agent={agent} isNew={isNew} isBuiltin={!!isBuiltin}
            onSaved={onSaved} onDelete={onDelete} onDiscard={onDiscard} />
        )}
        {detailTab === 'test' && agent && <TestChat agent={agent} />}
      </div>
    </div>
  )
}

// ─── Emoji picker button ──────────────────────────────────────────────────────

function EmojiPickerButton({ value, onChange, disabled, color, fallback, size = 48 }: {
  value: string; onChange: (emoji: string) => void
  disabled?: boolean; color: string; fallback: string; size?: number
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const display = value.trim() || fallback
  const radius  = Math.round(size * 0.28)

  return (
    <div className="wk-emoji-wrap" ref={wrapRef}>
      <button
        type="button"
        className="wk-emoji-trigger"
        style={{ width: size, height: size, borderRadius: radius, background: color, fontSize: Math.round(size * 0.46) }}
        onClick={() => !disabled && setOpen(v => !v)}
        title={disabled ? undefined : 'Choose icon'}
        disabled={disabled}
      >
        {display}
        {!disabled && <span className="wk-emoji-hint">✎</span>}
      </button>

      {open && (
        <div className="wk-emoji-popover">
          <Picker
            data={data}
            onEmojiSelect={(e: { native: string }) => { onChange(e.native); setOpen(false) }}
            theme="dark"
            previewPosition="none"
            skinTonePosition="none"
            maxFrequentRows={2}
            perLine={8}
          />
        </div>
      )}
    </div>
  )
}

// ─── Agent form panel ─────────────────────────────────────────────────────────

function AgentFormPanel({ agent, isNew, isBuiltin, onSaved, onDelete, onDiscard }: {
  agent: Agent | null; isNew: boolean; isBuiltin: boolean
  onSaved: (a: Agent, isNew: boolean) => void
  onDelete: (a: Agent) => void
  onDiscard: () => void
}) {
  const [form, setForm]             = useState<AgentForm>(agent ? agentToForm(agent) : BLANK_FORM)
  const [saving, setSaving]         = useState(false)
  const [err, setErr]               = useState<string | null>(null)
  const [slugManual, setSlugManual] = useState(!isNew)
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (isNew) nameRef.current?.focus() }, [isNew])

  function update<K extends keyof AgentForm>(key: K, val: AgentForm[K]) {
    setForm(f => {
      const next = { ...f, [key]: val }
      if (key === 'name' && !slugManual) next.slug = toSlug(val as string)
      return next
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.slug.trim()) { setErr('Slug is required'); return }
    setSaving(true); setErr(null)
    try {
      const body = formToBody(form)
      const saved = isNew
        ? await api.post<Agent>('/agents', body)
        : await api.put<Agent>(`/agents/${agent!.slug}`, body)
      onSaved(saved, isNew)
    } catch (e: unknown) {
      setErr((e as { message?: string })?.message ?? 'Save failed')
    } finally { setSaving(false) }
  }

  const previewColor   = agentColor(form.slug || 'new')
  const fallbackLetter = form.name?.[0]?.toUpperCase() ?? '+'

  return (
    <form className="wk-form" onSubmit={handleSubmit}>
      <div className="wk-form-inner">
        {err && <div className="wk-form-error"><Caution size={11} />{err}</div>}

        <div className="wk-form-header">
          {/* Static avatar preview — picker is in the Identity section below */}
          <div
            className="wk-avatar"
            style={{ width: 56, height: 56, borderRadius: 16, background: previewColor, fontSize: 24 }}
          >
            {form.icon.trim() || fallbackLetter}
          </div>
          <div style={{ flex: 1 }}>
            <div className="wk-form-agent-name">{isNew ? 'New Agent' : (form.name || agent?.slug)}</div>
            {!isNew && agent && <div className="wk-form-agent-slug">/{agent.slug}</div>}
          </div>
          {!isNew && agent && !isBuiltin && (
            <button type="button" className="wk-icon-btn danger" onClick={() => onDelete(agent)}><Delete size={12} /></button>
          )}
        </div>

        {/* Identity */}
        <div className="wk-section">
          <div className="wk-section-title">Identity</div>

          {/* Name + Slug (stacked) | Icon picker (square, centered) */}
          <div className="wk-identity-row">
            <div className="wk-identity-fields">
              <div className="wk-field">
                <label>Display name</label>
                <input ref={nameRef} type="text" placeholder="e.g. Research Assistant"
                  value={form.name} onChange={e => update('name', e.target.value)} disabled={isBuiltin} />
              </div>
              <div className="wk-field">
                <label>Slug {isNew && <span className="wk-required">*</span>}</label>
                <div className="wk-slug-wrap">
                  <span className="wk-slug-prefix">/</span>
                  <input type="text" placeholder="my-agent" value={form.slug}
                    onChange={e => { setSlugManual(true); update('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')) }}
                    disabled={isBuiltin || !isNew} className="wk-slug-input" />
                </div>
                <span className="wk-hint">Lowercase letters, digits and hyphens. Cannot be changed after creation.</span>
              </div>
            </div>

            <div className="wk-field-icon-tall">
              <label>Icon</label>
              <EmojiPickerButton
                value={form.icon}
                onChange={emoji => update('icon', emoji)}
                disabled={isBuiltin}
                color={previewColor}
                fallback={fallbackLetter}
                size={66}
              />
            </div>
          </div>
          <div className="wk-field">
            <label>When to use <span className="wk-opt">(shown to the model)</span></label>
            <textarea rows={2} placeholder="e.g. Use this agent for deep research tasks requiring web search."
              value={form.when_to_use} onChange={e => update('when_to_use', e.target.value)} disabled={isBuiltin} />
          </div>
        </div>

        {/* System prompt */}
        <div className="wk-section">
          <div className="wk-section-title">System Prompt</div>
          <div className="wk-field">
            <label>Instructions</label>
            <textarea rows={12} placeholder={'You are a research assistant...\n\nYour role is to...\n\nAlways cite your sources.'}
              value={form.system_prompt} onChange={e => update('system_prompt', e.target.value)}
              disabled={isBuiltin} className="wk-mono-area" />
          </div>
        </div>

        {/* Capabilities */}
        <div className="wk-section">
          <div className="wk-section-title">Capabilities</div>
          <div className="wk-field">
            <label>Tools</label>
            <div className="wk-pills">
              <button type="button" className={`wk-pill ${form.tools_mode === 'all' ? 'active' : ''}`}
                onClick={() => update('tools_mode', 'all')} disabled={isBuiltin}>All tools</button>
              <button type="button" className={`wk-pill ${form.tools_mode === 'custom' ? 'active' : ''}`}
                onClick={() => update('tools_mode', 'custom')} disabled={isBuiltin}>Custom list</button>
            </div>
            {form.tools_mode === 'custom' && (
              <input type="text" placeholder="Bash, Read, Write, WebSearch, ..."
                value={form.tools_custom} onChange={e => update('tools_custom', e.target.value)}
                disabled={isBuiltin} style={{ marginTop: 8 }} />
            )}
          </div>
          <div className="wk-field">
            <label>Disallowed tools <span className="wk-opt">(comma-separated)</span></label>
            <input type="text" placeholder="e.g. Bash, Edit"
              value={form.disallowed_tools} onChange={e => update('disallowed_tools', e.target.value)} disabled={isBuiltin} />
          </div>
        </div>

        {/* Behaviour */}
        <div className="wk-section">
          <div className="wk-section-title">Behaviour</div>
          <div className="wk-row">
            <div className="wk-field flex1">
              <label>Model override <span className="wk-opt">(optional)</span></label>
              <input type="text" placeholder="claude-opus-4-8 (uses session default if empty)"
                value={form.model} onChange={e => update('model', e.target.value)} disabled={isBuiltin} />
            </div>
            <div className="wk-field" style={{ width: 140 }}>
              <label>Max turns</label>
              <input type="number" min={1} max={500} value={form.max_turns}
                onChange={e => update('max_turns', parseInt(e.target.value) || 50)} disabled={isBuiltin} />
            </div>
          </div>
          <div className="wk-row align-center">
            <div className="wk-field flex1">
              <label>Permission mode</label>
              <select value={form.permission_mode} onChange={e => update('permission_mode', e.target.value)} disabled={isBuiltin}>
                {PERMISSION_MODE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className="wk-field-inline">
              <label>Enabled</label>
              <button
                type="button" role="switch" aria-checked={form.enabled}
                className={`wk-toggle ${form.enabled ? 'on' : 'off'}`}
                onClick={() => !isBuiltin && update('enabled', !form.enabled)}
                disabled={isBuiltin}
              >
                <span className="wk-toggle-knob" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {!isBuiltin && (
        <div className="wk-form-footer">
          <button type="button" className="wk-btn ghost" onClick={onDiscard} disabled={saving}>Discard</button>
          <button type="submit" className="wk-btn primary" disabled={saving}>
            {saving ? <><LoadingOne size={11} className="spin" /> Saving…</> : isNew ? 'Create agent' : 'Save changes'}
          </button>
        </div>
      )}
    </form>
  )
}

// ─── Test chat ────────────────────────────────────────────────────────────────

function TestChat({ agent }: { agent: Agent }) {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [initErr, setInitErr]     = useState<string | null>(null)
  const [input, setInput]         = useState('')
  const messagesRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    api.post<Session>('/sessions', {
      title: `Test — ${agent.name || agent.slug}`,
      agent_slug: agent.slug,
    }).then(s => {
      if (cancelled) return
      useSessionStore.getState().upsertSession({
        id: s.session_id,
        title: s.title ?? `Test — ${agent.name || agent.slug}`,
        messages: [], createdAt: new Date((s.created_at ?? 0) * 1000).toISOString(),
        updatedAt: new Date((s.updated_at ?? s.created_at ?? 0) * 1000).toISOString(),
      })
      setSessionId(s.session_id)
    }).catch(e => {
      if (!cancelled) setInitErr((e as { message?: string })?.message ?? 'Failed to create session')
    })
    return () => { cancelled = true }
  }, [agent.slug, agent.name])

  // Delete ephemeral session on unmount
  useEffect(() => {
    return () => {
      if (sessionId) {
        api.delete(`/sessions/${sessionId}`).catch(() => {})
        useSessionStore.getState().removeSession(sessionId)
      }
    }
  }, [sessionId])

  if (initErr)   return <div className="wk-center"><Caution size={16} /><p>{initErr}</p></div>
  if (!sessionId) return <div className="wk-center"><LoadingOne size={20} className="spin" /><p>Starting test session…</p></div>

  return <TestChatInner sessionId={sessionId} agent={agent} messagesRef={messagesRef} input={input} setInput={setInput} />
}

function TestChatInner({ sessionId, agent, messagesRef, input, setInput }: {
  sessionId: string; agent: Agent
  messagesRef: React.RefObject<HTMLDivElement | null>
  input: string; setInput: (v: string) => void
}) {
  const { sendMessage, isStreaming, stopMessage } = useChat(sessionId)
  const session     = useSessionStore(s => s.sessions.find(x => x.id === sessionId))
  const rawStreaming = useSessionStore(s => s.streamingBySession[sessionId] ?? [])
  const streaming   = streamingToContentBlocks(rawStreaming)

  useEffect(() => {
    if (messagesRef.current) messagesRef.current.scrollTop = messagesRef.current.scrollHeight
  }, [session?.messages, rawStreaming, messagesRef])

  async function handleSend() {
    const text = input.trim()
    if (!text || isStreaming) return
    setInput('')
    await sendMessage(text)
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSend() }
  }

  const messages = session?.messages ?? []

  return (
    <div className="wk-test-chat">
      <div className="wk-test-header">
        <Avatar agent={agent} size={23} />
        <span className="wk-test-agent-name">{agent.name || agent.slug}</span>
        <span className="wk-test-badge">ephemeral · deleted on close</span>
      </div>

      <div className="wk-test-messages" ref={messagesRef}>
        {messages.length === 0 && !isStreaming && (
          <div className="wk-test-empty">
            <Robot size={30} theme="outline" />
            <p>Send a message to test <strong>{agent.name || agent.slug}</strong></p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`wk-msg ${msg.role}`}>
            <div className="wk-msg-role">{msg.role === 'assistant' ? (agent.name || 'Agent') : 'You'}</div>
            <div className="wk-msg-body">
              {msg.content.map((block, bi) =>
                block.type === 'text' ? <span key={bi}>{block.text}</span> : null
              )}
            </div>
          </div>
        ))}

        {isStreaming && (
          <div className="wk-msg assistant streaming">
            <div className="wk-msg-role">{agent.name || 'Agent'}</div>
            <div className="wk-msg-body">
              {streaming.map((block, i) => block.type === 'text' ? <span key={i}>{block.text}</span> : null)}
              <span className="wk-cursor" />
            </div>
          </div>
        )}
      </div>

      <div className="wk-test-input-bar">
        <textarea
          className="wk-test-input"
          placeholder={`Message ${agent.name || agent.slug}…`}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          rows={1}
          disabled={isStreaming}
        />
        {isStreaming
          ? <button className="wk-send-btn stop" onClick={stopMessage}><Close size={11} /></button>
          : <button className="wk-send-btn" onClick={() => void handleSend()} disabled={!input.trim()}><Send size={11} /></button>
        }
      </div>
    </div>
  )
}

// ─── Knowledge tab ────────────────────────────────────────────────────────────

function KnowledgeTab() {
  const [corpora, setCorpora] = useState<Corpus[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Corpus | null>(null)
  const [corpusFiles, setCorpusFiles] = useState<CorpusFile[]>([])
  const [jobs, setJobs] = useState<IngestionJob[]>([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [saving, setSaving] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function showToast(kind: 'ok' | 'err', msg: string) {
    setToast({ kind, msg })
    setTimeout(() => setToast(null), 3000)
  }

  useEffect(() => {
    setLoading(true)
    api.get<{ corpora: Corpus[] }>('/corpora')
      .then(r => setCorpora(r.corpora ?? []))
      .catch(() => showToast('err', 'Failed to load knowledge bases'))
      .finally(() => setLoading(false))
  }, [])

  function loadDetail(corpus: Corpus) {
    setSelected(corpus)
    setDetailLoading(true)
    Promise.all([
      api.get<{ files: CorpusFile[] }>(`/corpora/${corpus.id}/files`),
      api.get<{ jobs: IngestionJob[] }>(`/corpora/${corpus.id}/ingest/jobs`),
    ])
      .then(([fr, jr]) => { setCorpusFiles(fr.files ?? []); setJobs(jr.jobs ?? []) })
      .catch(() => showToast('err', 'Failed to load corpus details'))
      .finally(() => setDetailLoading(false))
  }

  async function createCorpus() {
    if (!newName.trim()) return
    setSaving(true)
    try {
      const corpus = await api.post<Corpus>('/corpora', { name: newName.trim(), description: newDesc.trim() || undefined })
      setCorpora(c => [corpus, ...c])
      setShowCreate(false); setNewName(''); setNewDesc('')
      showToast('ok', 'Knowledge base created')
    } catch { showToast('err', 'Failed to create knowledge base') }
    finally { setSaving(false) }
  }

  async function deleteCorpus(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    if (!window.confirm('Delete this knowledge base and all its indexed data?')) return
    try {
      await api.delete(`/corpora/${id}`)
      setCorpora(c => c.filter(item => item.id !== id))
      if (selected?.id === id) setSelected(null)
      showToast('ok', 'Deleted')
    } catch { showToast('err', 'Failed to delete') }
  }

  async function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    if (!selected || !e.target.files?.length) return
    const file = e.target.files[0]
    e.target.value = ''
    setActionLoading('upload')
    try {
      // 1. Upload to global files store
      const form = new FormData()
      form.append('file', file)
      const uploaded = await api.upload<{ id: string; filename: string }>('/files', form)
      // 2. Attach to corpus
      await api.post(`/corpora/${selected.id}/files`, { file_id: uploaded.id })
      // 3. Queue ingest
      await api.post(`/corpora/${selected.id}/ingest`, { file_id: uploaded.id })
      // 4. Reload detail
      loadDetail(selected)
      showToast('ok', `${uploaded.filename} queued for ingestion`)
    } catch { showToast('err', 'Failed to upload file') }
    finally { setActionLoading(null) }
  }

  async function retryJob(jobId: string) {
    if (!selected) return
    setActionLoading(jobId)
    try {
      await api.post(`/corpora/${selected.id}/ingest/jobs/${jobId}/retry`, {})
      loadDetail(selected)
      showToast('ok', 'Job retried')
    } catch { showToast('err', 'Failed to retry') }
    finally { setActionLoading(null) }
  }

  function statusColor(status: string) {
    if (status === 'completed' || status === 'ingested') return '#6faf7b'
    if (status === 'failed') return 'var(--color-error)'
    if (status === 'running') return '#7d9ccf'
    return 'var(--color-accent)'
  }

  // ── Detail view ──────────────────────────────────────────────────────────────
  if (selected) {
    return (
      <div className="wk-knowledge">
        <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={handleFileInput} />
        <div className="wk-grid-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button className="wk-icon-btn" onClick={() => setSelected(null)} title="Back">
              <Left size={13} />
            </button>
            <span className="wk-grid-bar-title">{selected.name}</span>
            {selected.description && (
              <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>— {selected.description}</span>
            )}
          </div>
          <div className="wk-grid-bar-actions">
            <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
              {selected.chunk_count} chunks
            </span>
            <button
              className="wk-new-btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={actionLoading === 'upload'}
            >
              {actionLoading === 'upload'
                ? <><LoadingOne size={11} className="spin" /> Uploading…</>
                : <><Plus size={11} /> Add file</>}
            </button>
          </div>
        </div>

        <div className="wk-kn-detail-body">
          {detailLoading ? (
            <div className="wk-center">
              <LoadingOne size={23} className="spin" />
            </div>
          ) : corpusFiles.length === 0 ? (
            <div className="wk-center">
              <Brain size={30} style={{ opacity: 0.3 }} />
              <h2>No files yet</h2>
              <p>Upload documents to build this knowledge base. PDFs, Markdown, and text files are supported.</p>
              <button className="wk-new-btn lg" onClick={() => fileInputRef.current?.click()}>
                <Plus size={12} /> Add your first file
              </button>
            </div>
          ) : (
            <div className="wk-kn-file-list">
              {corpusFiles.map(f => {
                const latestJob = jobs.filter(j => j.file_id === f.file_id).sort((a, b) => b.created_at - a.created_at)[0]
                const isRunning = latestJob?.status === 'running' || latestJob?.status === 'pending'
                return (
                  <div key={f.file_id} className="wk-kn-file-row">
                    <div className="wk-kn-file-info">
                      <span className="wk-kn-file-name">{f.filename}</span>
                      <span className="wk-kn-file-meta">
                        {f.chunk_count > 0 && `${f.chunk_count} chunks · `}
                        {f.ingested_at
                          ? `Ingested ${new Date(f.ingested_at * 1000).toLocaleDateString()}`
                          : 'Not yet ingested'}
                      </span>
                    </div>
                    <div className="wk-kn-file-actions">
                      <span className="wk-kn-status" style={{ color: statusColor(latestJob?.status ?? f.status) }}>
                        {isRunning && <LoadingOne size={10} className="spin" />}
                        {latestJob?.status ?? f.status}
                      </span>
                      {latestJob?.status === 'failed' && (
                        <button
                          className="wk-icon-btn"
                          title="Retry"
                          disabled={actionLoading === latestJob.id}
                          onClick={() => retryJob(latestJob.id)}
                        >
                          {actionLoading === latestJob.id ? <LoadingOne size={11} className="spin" /> : <Sync size={11} />}
                        </button>
                      )}
                      {latestJob?.last_error && (
                        <span className="wk-kn-error" title={latestJob.last_error}>
                          <Caution size={11} />
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
        {toast && <div className={`wk-toast ${toast.kind}`}>{toast.msg}</div>}
      </div>
    )
  }

  // ── List view ────────────────────────────────────────────────────────────────
  return (
    <div className="wk-knowledge">
      <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={handleFileInput} />

      <div className="wk-grid-bar">
        <div className="wk-grid-bar-title">Knowledge bases</div>
        <div className="wk-grid-bar-actions">
          <button className="wk-new-btn" onClick={() => setShowCreate(true)}>
            <Plus size={11} /> New Knowledge Base
          </button>
        </div>
      </div>

      <div className="wk-grid-scroll">
        {loading ? (
          <div className="wk-center">
            <LoadingOne size={23} className="spin" />
          </div>
        ) : corpora.length === 0 ? (
          <div className="wk-center">
            <Brain size={30} style={{ opacity: 0.3 }} />
            <h2>No knowledge bases yet</h2>
            <p>Create a knowledge base and upload documents. Your agents can search and reason over indexed content using RAG.</p>
            <button className="wk-new-btn lg" onClick={() => setShowCreate(true)}>
              <Plus size={12} /> Create your first knowledge base
            </button>
          </div>
        ) : (
          <div className="wk-card-grid">
            {corpora.map(corpus => (
              <button key={corpus.id} className="wk-card" onClick={() => loadDetail(corpus)}>
                <div className="wk-card-top">
                  <div className="wk-kn-corpus-icon">
                    <Brain size={15} />
                  </div>
                  <button className="wk-icon-btn danger" onClick={(e) => deleteCorpus(corpus.id, e)} title="Delete">
                    <Delete size={11} />
                  </button>
                </div>
                <div className="wk-card-name">{corpus.name}</div>
                {corpus.description && <div className="wk-card-desc">{corpus.description}</div>}
                <div className="wk-card-meta">
                  {corpus.chunk_count} chunks · {new Date(corpus.created_at * 1000).toLocaleDateString()}
                </div>
              </button>
            ))}
            <button className="wk-card-new" onClick={() => setShowCreate(true)}>
              <Plus size={16} />
              New knowledge base
            </button>
          </div>
        )}
      </div>

      {/* Create modal */}
      {showCreate && (
        <div className="wk-modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="wk-modal" onClick={e => e.stopPropagation()}>
            <div className="wk-modal-header">
              <span className="wk-modal-title">New Knowledge Base</span>
              <button className="wk-icon-btn" onClick={() => setShowCreate(false)}><Close size={13} /></button>
            </div>
            <div className="wk-modal-body">
              <label className="wk-field">
                <span className="wk-field-label">Name <span style={{ color: 'var(--color-error)' }}>*</span></span>
                <input
                  className="wk-input"
                  placeholder="e.g. Product Documentation"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  autoFocus
                  onKeyDown={e => { if (e.key === 'Enter') void createCorpus() }}
                />
              </label>
              <label className="wk-field">
                <span className="wk-field-label">Description</span>
                <input
                  className="wk-input"
                  placeholder="What documents will be stored here?"
                  value={newDesc}
                  onChange={e => setNewDesc(e.target.value)}
                />
              </label>
            </div>
            <div className="wk-modal-footer">
              <button className="wk-btn ghost" onClick={() => setShowCreate(false)}>Cancel</button>
              <button className="wk-btn primary" onClick={createCorpus} disabled={!newName.trim() || saving}>
                {saving ? <><LoadingOne size={11} className="spin" /> Creating…</> : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className={`wk-toast ${toast.kind}`}>{toast.msg}</div>}
    </div>
  )
}

// ─── CSS ──────────────────────────────────────────────────────────────────────

const CSS = `
.wk-root {
  display: flex; flex-direction: column;
  width: 100%; height: 100%;
  background: var(--color-surface);
  color: var(--color-text);
  overflow: hidden;
  position: relative;
}

/* Toast */
.wk-toast {
  position: fixed; bottom: 24px; right: 24px; z-index: 999;
  display: flex; align-items: center; gap: 5px;
  padding: 6px 11px; border-radius: 8px;
  font-size: 11px; font-weight: 600;
  box-shadow: 0 8px 32px rgba(0,0,0,0.25);
  animation: wk-slide 0.18s ease;
}
.wk-toast.ok  { background: var(--color-bg); border: 1px solid rgba(111,183,123,0.4); color: #6faf7b; }
.wk-toast.err { background: var(--color-bg); border: 1px solid rgba(201,107,92,0.4);  color: var(--color-error); }
@keyframes wk-slide { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:none; } }

/* Top bar */
.wk-topbar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 14px; height: 52px; flex-shrink: 0;
  background: var(--color-bg);
  border-bottom: 1px solid var(--color-border-subtle);
  gap: 9px;
}
.wk-topbar-left  { display: flex; align-items: center; gap: 6px; min-width: 0; flex: 1; }
.wk-topbar-right { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
.wk-logo-wrap {
  display: flex; align-items: center; justify-content: center;
  width: 30px; height: 30px; border-radius: 6px;
  opacity: 0.65; transition: opacity 0.15s;
}
.wk-logo-wrap:hover { opacity: 1; }

/* Workspace (sidenav + content) */
.wk-workspace { flex: 1; display: flex; flex-direction: row; overflow: hidden; }

/* Left sidebar nav */
.wk-sidenav {
  width: 190px; flex-shrink: 0;
  display: flex; flex-direction: column;
  background: var(--color-bg);
  border-right: 1px solid var(--color-border-subtle);
  padding: 8px 0 11px;
}
.wk-sidenav-items { flex: 1; display: flex; flex-direction: column; gap: 2px; padding: 0 7px; }
.wk-sidenav-item {
  display: flex; align-items: center; gap: 8px;
  width: 100%; padding: 6px 8px; border-radius: 8px;
  border: none; background: transparent;
  color: var(--color-text-secondary);
  font-size: 11px; font-weight: 600; cursor: pointer;
  transition: all 0.1s; text-align: left;
}
.wk-sidenav-item:hover { background: var(--color-hover); color: var(--color-text); }
.wk-sidenav-item.active {
  background: color-mix(in srgb, var(--color-primary) 12%, transparent);
  color: var(--color-primary);
}
.wk-sidenav-footer { padding: 8px 7px 0; border-top: 1px solid var(--color-border-subtle); margin-top: 8px; }
.wk-sidenav-back {
  display: flex; align-items: center; gap: 5px;
  width: 100%; padding: 6px 8px; border-radius: 7px;
  border: none; background: none;
  color: var(--color-text-muted); font-size: 10px; font-weight: 600;
  cursor: pointer; transition: background 0.1s, color 0.1s;
}
.wk-sidenav-back:hover { background: var(--color-hover); color: var(--color-text); }

.wk-back-chip {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 4px 7px; border-radius: 5px; border: none;
  background: var(--color-hover); color: var(--color-text-secondary);
  font-size: 10px; font-weight: 600; cursor: pointer; white-space: nowrap;
  transition: background 0.1s, color 0.1s; flex-shrink: 0;
}
.wk-back-chip:hover { background: var(--color-border); color: var(--color-text); }
.wk-topbar-sep   { color: var(--color-text-muted); font-size: 12px; user-select: none; flex-shrink: 0; }
.wk-topbar-title { font-size: 13px; font-weight: 700; color: var(--color-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* Detail tabs */
.wk-detail-tabs {
  display: flex; gap: 3px;
  background: var(--color-surface); border-radius: 6px; padding: 2px;
  border: 1px solid var(--color-border-subtle);
}
.wk-detail-tab {
  display: flex; align-items: center; gap: 4px;
  padding: 4px 8px; border-radius: 5px; border: none;
  background: transparent; cursor: pointer;
  font-size: 10px; font-weight: 600; color: var(--color-text-secondary);
  transition: all 0.1s;
}
.wk-detail-tab:hover:not(:disabled) { background: var(--color-hover); color: var(--color-text); }
.wk-detail-tab.active { background: var(--color-bg); color: var(--color-text); box-shadow: 0 1px 3px rgba(0,0,0,0.12); }
.wk-detail-tab:disabled { opacity: 0.35; cursor: not-allowed; }

/* Body (content area right of sidenav) */
.wk-body { flex: 1; overflow: hidden; display: flex; flex-direction: column; }

/* Center util */
.wk-center {
  flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 12px; padding: 42px 28px; text-align: center; color: var(--color-text-muted);
}
.wk-center h2 { margin: 0; font-size: 19px; color: var(--color-text); }
.wk-center p  { margin: 0; font-size: 12px; max-width: 380px; line-height: 1.6; }

/* Buttons */
.wk-new-btn {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 6px 11px; border-radius: 7px; border: none;
  background: var(--color-cta); color: #fff;
  font-size: 11px; font-weight: 600; cursor: pointer; transition: opacity 0.1s; white-space: nowrap;
}
.wk-new-btn:hover:not(:disabled) { opacity: 0.88; }
.wk-new-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.wk-new-btn.lg { padding: 7px 14px; font-size: 12px; }

.wk-icon-btn {
  display: flex; align-items: center; justify-content: center;
  width: 30px; height: 30px; border-radius: 6px; border: none;
  background: none; cursor: pointer; color: var(--color-text-muted);
  transition: background 0.1s, color 0.1s;
}
.wk-icon-btn:hover:not(:disabled) { background: var(--color-hover); color: var(--color-text); }
.wk-icon-btn.danger:hover { color: var(--color-error); background: rgba(201,107,92,0.08); }
.wk-icon-btn:disabled { opacity: 0.4; cursor: default; }

.wk-btn {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 6px 13px; border-radius: 7px; font-size: 11px; font-weight: 600;
  border: none; cursor: pointer; transition: opacity 0.1s; white-space: nowrap;
}
.wk-btn:disabled { opacity: 0.5; cursor: default; }
.wk-btn.primary { background: var(--color-cta); color: #fff; }
.wk-btn.primary:hover:not(:disabled) { opacity: 0.88; }
.wk-btn.ghost { background: transparent; border: 1px solid var(--color-border); color: var(--color-text-secondary); }
.wk-btn.ghost:hover:not(:disabled) { background: var(--color-hover); color: var(--color-text); }

/* Avatar */
.wk-avatar {
  display: flex; align-items: center; justify-content: center;
  font-weight: 700; color: #fff; flex-shrink: 0; user-select: none;
}

/* Grid root + action bar */
.wk-grid-root { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.wk-grid-bar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 28px; border-bottom: 1px solid var(--color-border-subtle);
  background: var(--color-bg); flex-shrink: 0;
}
.wk-grid-bar-title { font-size: 11px; font-weight: 600; color: var(--color-text-muted); }
.wk-grid-bar-actions { display: flex; align-items: center; gap: 6px; }

/* Card grid */
.wk-grid-scroll { flex: 1; overflow-y: auto; padding: 22px 28px; display: flex; flex-direction: column; gap: 24px; }
.wk-grid-section { display: flex; flex-direction: column; gap: 9px; }
.wk-grid-section-title {
  font-size: 10px; font-weight: 700; letter-spacing: 0.06em;
  text-transform: uppercase; color: var(--color-text-muted);
}
.wk-card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 9px;
}
.wk-card {
  background: var(--color-bg); border: 1px solid var(--color-border);
  border-radius: 12px; padding: 13px;
  display: flex; flex-direction: column; gap: 6px;
  text-align: left; cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s, transform 0.1s;
}
.wk-card:hover {
  border-color: color-mix(in srgb, var(--color-primary) 40%, transparent);
  box-shadow: 0 4px 20px rgba(0,0,0,0.1); transform: translateY(-1px);
}
.wk-card.disabled { opacity: 0.5; }
.wk-card-top { display: flex; align-items: flex-start; justify-content: space-between; }
.wk-card-badges { display: flex; flex-direction: column; gap: 3px; align-items: flex-end; }
.wk-badge {
  display: inline-block; padding: 2px 4px; border-radius: 4px;
  font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em;
}
.wk-badge.builtin { background: rgba(107,57,203,0.1); color: #8b6fd6; border: 1px solid rgba(107,57,203,0.2); }
.wk-badge.off     { background: rgba(120,120,120,0.1); color: var(--color-text-muted); border: 1px solid var(--color-border); }
.wk-card-name { font-size: 12px; font-weight: 700; color: var(--color-text); }
.wk-card-desc {
  font-size: 10px; color: var(--color-text-muted); line-height: 1.5;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.wk-card-meta { font-size: 10px; color: var(--color-text-muted); font-family: monospace; margin-top: 4px; }
.wk-card-new {
  background: transparent; border: 1.5px dashed var(--color-border);
  border-radius: 12px; padding: 13px;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 6px; color: var(--color-text-muted); cursor: pointer;
  font-size: 11px; font-weight: 600; min-height: 120px;
  transition: border-color 0.15s, color 0.15s;
}
.wk-card-new:hover { border-color: var(--color-primary); color: var(--color-primary); }

/* Detail */
.wk-detail { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.wk-readonly-banner {
  display: flex; align-items: center; gap: 6px;
  padding: 7px 17px; font-size: 11px;
  background: rgba(239,124,47,0.06); border-bottom: 1px solid rgba(239,124,47,0.18);
  color: var(--color-primary); flex-shrink: 0;
}
.wk-detail-body { flex: 1; overflow: hidden; display: flex; }

/* Form */
.wk-form { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.wk-form-inner { flex: 1; overflow-y: auto; display: flex; flex-direction: column; }
.wk-form-header {
  display: flex; align-items: center; gap: 12px;
  padding: 17px 28px 14px; border-bottom: 1px solid var(--color-border-subtle);
  background: var(--color-bg); flex-shrink: 0;
}
.wk-form-agent-name { font-size: 15px; font-weight: 700; color: var(--color-text); }
.wk-form-agent-slug { font-size: 10px; color: var(--color-text-muted); font-family: monospace; margin-top: 3px; }
.wk-emoji-label { font-size: 10px; color: var(--color-text-muted); margin-top: 4px; }

/* Emoji picker */
.wk-emoji-wrap { position: relative; flex-shrink: 0; }
.wk-emoji-trigger {
  width: 64px; height: 64px; border-radius: 14px; border: none;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; position: relative; transition: filter 0.15s;
  overflow: hidden;
}
.wk-emoji-trigger:hover:not(:disabled) { filter: brightness(1.1); }
.wk-emoji-trigger:disabled { cursor: default; }
.wk-emoji-display { font-size: 26px; line-height: 1; }
.wk-emoji-hint {
  position: absolute; bottom: 3px; right: 4px;
  font-size: 10px; opacity: 0; background: rgba(0,0,0,0.5);
  border-radius: 3px; padding: 2px 2px; color: #fff;
  transition: opacity 0.15s; pointer-events: none;
}
.wk-emoji-trigger:hover .wk-emoji-hint { opacity: 1; }
.wk-emoji-popover {
  position: absolute; top: calc(100% + 8px); right: 0; z-index: 300;
  border-radius: 11px; overflow: hidden;
  box-shadow: 0 16px 48px rgba(0,0,0,0.35);
  border: 1px solid var(--color-border-subtle);
}
em-emoji-picker { --border-radius: 11px; }
.wk-section {
  padding: 14px 28px; border-bottom: 1px solid var(--color-border-subtle);
  display: flex; flex-direction: column; gap: 11px;
}
.wk-section-title {
  font-size: 10px; font-weight: 700; letter-spacing: 0.06em;
  text-transform: uppercase; color: var(--color-text-muted);
}
.wk-field { display: flex; flex-direction: column; gap: 4px; }
.wk-field.flex1 { flex: 1; }
.wk-field label { font-size: 10px; font-weight: 600; color: var(--color-text-secondary); }
.wk-field input, .wk-field select, .wk-field textarea {
  background: var(--color-surface); border: 1px solid var(--color-border);
  border-radius: 6px; padding: 6px 8px;
  color: var(--color-text); font-size: 11px; font-family: inherit;
  outline: none; width: 100%; box-sizing: border-box; resize: vertical;
}
.wk-field input:focus, .wk-field select:focus, .wk-field textarea:focus { border-color: var(--color-primary); }
.wk-field input:disabled, .wk-field select:disabled, .wk-field textarea:disabled { opacity: 0.5; cursor: not-allowed; }
.wk-mono-area { font-family: monospace; font-size: 11px; line-height: 1.6; min-height: 220px; }
.wk-hint { font-size: 10px; color: var(--color-text-muted); }
.wk-required { color: var(--color-error); font-weight: 700; }
.wk-opt { font-weight: 400; color: var(--color-text-muted); }
.wk-row { display: flex; gap: 9px; align-items: flex-start; }
.wk-row.align-center { align-items: center; }
.wk-row.align-end { align-items: flex-end; }

/* Identity row: stacked fields on left, square icon on right */
.wk-identity-row { display: flex; gap: 12px; align-items: center; }
.wk-identity-fields { flex: 1; display: flex; flex-direction: column; gap: 11px; }

.wk-field-icon { display: flex; flex-direction: column; gap: 4px; flex-shrink: 0; }
.wk-field-icon label { font-size: 10px; font-weight: 600; color: var(--color-text-secondary); }

/* Icon column aligned to center alongside the stacked fields */
.wk-field-icon-tall { display: flex; flex-direction: column; align-items: center; gap: 5px; flex-shrink: 0; }
.wk-field-icon-tall label { font-size: 10px; font-weight: 600; color: var(--color-text-secondary); align-self: flex-start; }
.wk-field-inline { display: flex; align-items: center; gap: 8px; padding-top: 14px; }
.wk-field-inline label { font-size: 10px; font-weight: 600; color: var(--color-text-secondary); white-space: nowrap; }
.wk-slug-wrap {
  display: flex; align-items: center;
  background: var(--color-surface); border: 1px solid var(--color-border);
  border-radius: 6px; overflow: hidden;
}
.wk-slug-prefix { padding: 6px 2px 6px 8px; font-size: 11px; color: var(--color-text-muted); font-family: monospace; user-select: none; }
.wk-slug-input { border: none !important; border-radius: 0 !important; padding-left: 2px !important; background: transparent !important; font-family: monospace !important; }
.wk-slug-input:focus { box-shadow: none !important; }
.wk-pills { display: flex; gap: 5px; }
.wk-pill {
  padding: 4px 10px; border-radius: 5px; border: 1px solid var(--color-border);
  background: transparent; cursor: pointer;
  font-size: 10px; font-weight: 600; color: var(--color-text-muted); transition: all 0.1s;
}
.wk-pill:hover:not(:disabled) { border-color: var(--color-primary); color: var(--color-text); }
.wk-pill.active { border-color: var(--color-primary); background: color-mix(in srgb, var(--color-primary) 10%, transparent); color: var(--color-primary); }
.wk-pill:disabled { opacity: 0.4; cursor: not-allowed; }

/* Toggle — knob centré verticalement */
.wk-toggle {
  position: relative; width: 40px; height: 22px; border-radius: 9px;
  border: none; padding: 0; cursor: pointer; transition: background 0.2s; flex-shrink: 0;
}
.wk-toggle.on  { background: var(--color-primary); }
.wk-toggle.off { background: var(--color-border); }
.wk-toggle:disabled { opacity: 0.5; cursor: not-allowed; }
.wk-toggle-knob {
  position: absolute;
  top: 50%; transform: translateY(-50%);
  width: 16px; height: 16px; border-radius: 50%;
  background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,0.25);
  transition: left 0.2s;
  pointer-events: none;
}
.wk-toggle.on  .wk-toggle-knob { left: 21px; }
.wk-toggle.off .wk-toggle-knob { left: 3px; }

.wk-form-footer {
  display: flex; align-items: center; justify-content: flex-end; gap: 8px;
  padding: 10px 28px; border-top: 1px solid var(--color-border-subtle);
  background: var(--color-bg); flex-shrink: 0;
}
.wk-form-error {
  display: flex; align-items: center; gap: 5px;
  margin: 16px 40px 0; padding: 6px 8px; border-radius: 6px;
  background: rgba(201,107,92,0.08); border: 1px solid rgba(201,107,92,0.25);
  font-size: 11px; color: var(--color-error);
}

/* Test chat */
.wk-test-chat { flex: 1; display: flex; flex-direction: column; overflow: hidden; background: var(--color-surface); }
.wk-test-header {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 22px; border-bottom: 1px solid var(--color-border-subtle);
  background: var(--color-bg); flex-shrink: 0;
}
.wk-test-agent-name { font-size: 12px; font-weight: 700; color: var(--color-text); }
.wk-test-badge {
  font-size: 10px; font-weight: 600; padding: 2px 6px; border-radius: 4px;
  background: rgba(239,124,47,0.08); border: 1px solid rgba(239,124,47,0.2); color: var(--color-primary);
}
.wk-test-messages { flex: 1; overflow-y: auto; padding: 17px 22px; display: flex; flex-direction: column; gap: 15px; }
.wk-test-empty {
  flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 9px; color: var(--color-text-muted); text-align: center;
}
.wk-test-empty p { margin: 0; font-size: 12px; }
.wk-msg { display: flex; flex-direction: column; gap: 3px; max-width: 780px; }
.wk-msg.user { align-self: flex-end; align-items: flex-end; }
.wk-msg.assistant { align-self: flex-start; }
.wk-msg-role { font-size: 10px; font-weight: 700; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.04em; padding: 0 3px; }
.wk-msg-body {
  padding: 7px 10px; border-radius: 9px;
  font-size: 12px; line-height: 1.6; white-space: pre-wrap; word-break: break-word;
}
.wk-msg.user .wk-msg-body { background: var(--color-primary); color: #fff; border-bottom-right-radius: 4px; }
.wk-msg.assistant .wk-msg-body { background: var(--color-bg); border: 1px solid var(--color-border-subtle); border-bottom-left-radius: 4px; color: var(--color-text); }
.wk-cursor {
  display: inline-block; width: 2px; height: 1em; background: currentColor;
  margin-left: 2px; vertical-align: middle;
  animation: blink 0.9s step-end infinite;
}
@keyframes blink { 0%, 100% { opacity:1 } 50% { opacity:0 } }
.wk-test-input-bar {
  display: flex; align-items: flex-end; gap: 6px;
  padding: 11px 22px; border-top: 1px solid var(--color-border-subtle);
  background: var(--color-bg); flex-shrink: 0;
}
.wk-test-input {
  flex: 1; background: var(--color-surface); border: 1px solid var(--color-border);
  border-radius: 8px; padding: 7px 10px;
  color: var(--color-text); font-size: 12px; font-family: inherit;
  outline: none; resize: none; line-height: 1.5; max-height: 180px;
}
.wk-test-input:focus { border-color: var(--color-primary); }
.wk-test-input:disabled { opacity: 0.5; }
.wk-send-btn {
  width: 36px; height: 36px; border-radius: 8px; border: none;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; flex-shrink: 0; transition: opacity 0.1s;
}
.wk-send-btn:not(.stop) { background: var(--color-cta); color: #fff; }
.wk-send-btn:not(.stop):disabled { opacity: 0.4; cursor: default; }
.wk-send-btn.stop { background: rgba(201,107,92,0.12); color: var(--color-error); border: 1px solid rgba(201,107,92,0.25); }

/* Knowledge */
.wk-knowledge { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.wk-kn-detail-body { flex: 1; overflow-y: auto; padding: 22px 28px; display: flex; flex-direction: column; gap: 9px; }

.wk-kn-corpus-icon {
  width: 38px; height: 38px; border-radius: 9px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  background: color-mix(in srgb, var(--color-primary) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-primary) 20%, transparent);
  color: var(--color-primary);
}

.wk-kn-file-list { display: flex; flex-direction: column; gap: 3px; }
.wk-kn-file-row {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 7px 10px; border-radius: 8px;
  background: var(--color-bg); border: 1px solid var(--color-border-subtle);
  transition: border-color 0.12s;
}
.wk-kn-file-row:hover { border-color: var(--color-border); }
.wk-kn-file-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
.wk-kn-file-name { font-size: 11px; font-weight: 600; color: var(--color-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.wk-kn-file-meta { font-size: 10px; color: var(--color-text-muted); }
.wk-kn-file-actions { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
.wk-kn-status { display: flex; align-items: center; gap: 4px; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }
.wk-kn-error { color: var(--color-error); display: flex; cursor: help; }

/* Modal */
.wk-modal-overlay {
  position: fixed; inset: 0; z-index: 50;
  background: rgba(0,0,0,0.45);
  display: flex; align-items: center; justify-content: center;
  animation: wk-fade 0.15s ease;
}
@keyframes wk-fade { from { opacity: 0; } to { opacity: 1; } }
.wk-modal {
  background: var(--color-surface); border: 1px solid var(--color-border);
  border-radius: 12px; width: 420px; max-width: calc(100vw - 48px);
  box-shadow: 0 24px 64px rgba(0,0,0,0.35);
  animation: wk-modal-in 0.18s ease;
}
@keyframes wk-modal-in { from { opacity: 0; transform: scale(0.95) translateY(8px); } to { opacity: 1; transform: none; } }
.wk-modal-header { display: flex; align-items: center; justify-content: space-between; padding: 13px 14px 0; }
.wk-modal-title { font-size: 13px; font-weight: 700; }
.wk-modal-body { padding: 14px; display: flex; flex-direction: column; gap: 11px; }
.wk-modal-footer { display: flex; justify-content: flex-end; gap: 6px; padding: 0 14px 13px; }
.wk-field { display: flex; flex-direction: column; gap: 5px; }
.wk-field-label { font-size: 10px; font-weight: 600; color: var(--color-text-muted); }
.wk-input {
  padding: 6px 8px; border-radius: 7px; font-size: 11px;
  background: var(--color-bg); border: 1px solid var(--color-border);
  color: var(--color-text); outline: none; transition: border-color 0.12s;
}
.wk-input:focus { border-color: var(--color-primary); }
.wk-input::placeholder { color: var(--color-text-muted); }

@keyframes spin { to { transform: rotate(360deg); } }
.spin { animation: spin 0.8s linear infinite; display: inline-block; }
`
