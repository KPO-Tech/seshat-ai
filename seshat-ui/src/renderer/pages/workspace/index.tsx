import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  Left, Robot, Plus, Edit, Delete, Sync, Close, CheckOne,
  Caution, LoadingOne, Brain, Lightning, Send, Book, Tool, FileText,
  More, Star, Attention, Down, Upload, Check, Terminal, Globe, Api, Lock, Search,
} from '@icon-park/react'
import { createAvatar } from '@dicebear/core'
import { lorelei, adventurer } from '@dicebear/collection'
import { api } from '@/api/client'
import { WindowCloseIcon } from '@/components/ui/WindowControlIcon'
import { useUIStore } from '@/stores/ui'
import { useSessionStore, streamingToContentBlocks } from '@/stores/session'
import { useChat } from '@/hooks/useChat'
import { NexusLogo } from '@/components/NexusLogo'
import { listToolCatalog, type ToolCatalogEntry } from '@/components/chat/tool-block/toolDisplay'
import { SETTINGS_SHARED_CSS } from '../settings/SettingsNav'
import { PlannedFeatureCard, PLANNED_FEATURE_CARD_CSS } from '@/components/ui/PlannedFeatureCard'
import type { Agent, Session, Corpus, CorpusFile, IngestionJob } from '@/api/types'
import type { ReactNode } from 'react'

// ─── Constants ────────────────────────────────────────────────────────────────

type WorkspaceTab = 'agents' | 'documents' | 'tools' | 'templates'
type AgentsView   = 'grid' | 'detail'
type DetailTab    = 'edit' | 'test'
type ToolsSubTab  = 'mcp' | 'internal'

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

// ─── Generated avatars ──────────────────────────────────────────────────────
// Agents get an illustrated face generated locally (DiceBear), seeded
// deterministically from their slug — same idea as agentColor() above, just for
// the whole avatar instead of a background tint. The `icon` field stores
// "style:seed" so the pick persists; an empty field falls back to the default
// style, seeded from the slug. Older/built-in agents may still carry a literal
// emoji in `icon` — those keep rendering as emoji rather than being
// reinterpreted as a seed.

const AVATAR_STYLES = {
  lorelei: { style: lorelei, label: 'Lorelei' },
  adventurer: { style: adventurer, label: 'Adventurer' },
} as const

type AvatarStyleId = keyof typeof AVATAR_STYLES

const DEFAULT_AVATAR_STYLE: AvatarStyleId = 'lorelei'

function isEmojiIcon(icon: string): boolean {
  return /\p{Extended_Pictographic}/u.test(icon)
}

function isAvatarStyleId(id: string): id is AvatarStyleId {
  return id in AVATAR_STYLES
}

function parseAvatarIcon(icon: string | undefined, slug: string): { styleId: AvatarStyleId; seed: string } {
  const trimmed = icon?.trim()
  if (trimmed && !isEmojiIcon(trimmed)) {
    const sep = trimmed.indexOf(':')
    if (sep > 0) {
      const styleId = trimmed.slice(0, sep)
      const seed = trimmed.slice(sep + 1)
      if (isAvatarStyleId(styleId) && seed) return { styleId, seed }
    }
    return { styleId: DEFAULT_AVATAR_STYLE, seed: trimmed } // legacy value: no style prefix
  }
  return { styleId: DEFAULT_AVATAR_STYLE, seed: slug || 'new-agent' }
}

function encodeAvatarIcon(styleId: AvatarStyleId, seed: string): string {
  return `${styleId}:${seed}`
}

function randomSeed(): string {
  return Math.random().toString(36).slice(2, 10)
}

const avatarSvgCache = new Map<string, string>()

function generatedAvatarSvg(styleId: AvatarStyleId, seed: string): string {
  const key = `${styleId}:${seed}`
  let svg = avatarSvgCache.get(key)
  if (!svg) {
    // Each DiceBear style has its own literal Options type (hair variants, etc.), so a
    // registry mixing several styles can't type-check against createAvatar's generic
    // signature — cast is safe since only `seed` is passed, which every style accepts.
    svg = createAvatar(AVATAR_STYLES[styleId].style as Parameters<typeof createAvatar>[0], { seed }).toString()
    avatarSvgCache.set(key, svg)
  }
  return svg
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
  const icon = agent.icon?.trim() ?? ''
  const radius = Math.round(size * 0.28)

  if (icon && isEmojiIcon(icon)) {
    return (
      <div
        className="wk-avatar"
        style={{ width: size, height: size, borderRadius: radius, background: agentColor(agent.slug), fontSize: Math.round(size * 0.45) }}
      >
        {icon}
      </div>
    )
  }

  const { styleId, seed } = parseAvatarIcon(icon, agent.slug)
  return (
    <div
      className="wk-avatar wk-avatar-generated"
      style={{ width: size, height: size, borderRadius: radius }}
      dangerouslySetInnerHTML={{ __html: generatedAvatarSvg(styleId, seed) }}
    />
  )
}

// ─── Root page ────────────────────────────────────────────────────────────────

type WorkspacePageProps = {
  initialTab?: WorkspaceTab
  embedded?: boolean
}

export function WorkspacePage({ initialTab = 'agents', embedded = false }: WorkspacePageProps = {}) {
  const closeAllRightPanels = useUIStore(s => s.closeAllRightPanels)

  const [tab, setTab]               = useState<WorkspaceTab>(initialTab)
  const [agents, setAgents]         = useState<Agent[]>([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState<string | null>(null)
  const [toast, setToast]           = useState<{ text: string; kind: 'ok' | 'err' } | null>(null)
  const [view, setView]             = useState<AgentsView>('grid')
  const [selected, setSelected]     = useState<Agent | null>(null)
  const [detailTab, setDetailTab]   = useState<DetailTab>('edit')
  const [isNewAgent, setIsNewAgent] = useState(false)
  const [documentCrumb, setDocumentCrumb] = useState<string | null>(null)
  const [documentsResetKey, setDocumentsResetKey] = useState(0)
  const [embeddedActions, setEmbeddedActions] = useState<ReactNode | null>(null)
  const [toolsSubTab, setToolsSubTab] = useState<ToolsSubTab>('mcp')

  useEffect(() => { closeAllRightPanels() }, [closeAllRightPanels])

  useEffect(() => {
    setTab(initialTab)
    setView('grid')
    setSelected(null)
    setIsNewAgent(false)
    setDocumentCrumb(null)
    setEmbeddedActions(null)
    setToolsSubTab('mcp')
  }, [initialTab])

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
  const resourceTitle = RESOURCE_TABS.find((item) => item.id === tab)?.label ?? 'Workspace'

  function resetDocumentsDetail() {
    setDocumentCrumb(null)
    setDocumentsResetKey((key) => key + 1)
  }

  useEffect(() => {
    if (!embedded || tab === 'documents') return
    if (tab === 'agents' && view === 'grid') {
      setEmbeddedActions(
        <>
          <button className="wk-icon-btn" onClick={loadAgents} title="Refresh">
            <Sync size={12} />
          </button>
          <button className="wk-new-btn" onClick={openNew}><Plus size={11} /> New Agent</button>
        </>
      )
      return
    }
    setEmbeddedActions(null)
  }, [embedded, tab, view, loadAgents])

  return (
    <div className={`wk-root${embedded ? ' embedded' : ''}`}>
      <style>{CSS}</style>
      {/* Reused for the MCP section's sv-card/modal-* primitives (Tools & MCP tab) */}
      <style>{SETTINGS_SHARED_CSS}</style>
      <style>{PLANNED_FEATURE_CARD_CSS}</style>

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
            embedded && tab === 'documents' && documentCrumb ? (
              <>
                <button className="wk-topbar-crumb" type="button" onClick={resetDocumentsDetail}>Documents</button>
                <span className="wk-topbar-sep">/</span>
                <span className="wk-topbar-title">{documentCrumb}</span>
              </>
            ) : (
              <span className="wk-topbar-title">{embedded ? resourceTitle : 'Workspace'}</span>
            )
          )}
        </div>

        {view === 'grid' && !embedded && (
          <ResourceTabs
            tab={tab}
            onTabChange={(next) => { setTab(next); setView('grid') }}
          />
        )}

        <div className="wk-topbar-right">
          {embedded && view === 'grid' && tab === 'tools' ? (
            <div className="wk-detail-tabs wk-tools-tabs">
              <button className={`wk-detail-tab ${toolsSubTab === 'mcp' ? 'active' : ''}`} onClick={() => setToolsSubTab('mcp')}>
                <Api size={11} /> MCP
              </button>
              <button className={`wk-detail-tab ${toolsSubTab === 'internal' ? 'active' : ''}`} onClick={() => setToolsSubTab('internal')}>
                <Tool size={11} /> Internal
              </button>
            </div>
          ) : (
            embedded && view === 'grid' && embeddedActions
          )}
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
        {/* Content */}
        <div className="wk-body">
          {tab === 'documents' && (
            <DocumentsTab
              embedded={embedded}
              resetKey={documentsResetKey}
              onSelectionChange={setDocumentCrumb}
              onActionsChange={setEmbeddedActions}
            />
          )}

          {tab === 'tools' && (
            <ToolsTab
              embedded={embedded}
              sub={toolsSubTab}
              onSubChange={setToolsSubTab}
            />
          )}

          {tab === 'templates' && view === 'grid' && <PlannedResourceTab />}

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

const RESOURCE_TABS: Array<{ id: WorkspaceTab; label: string; icon: React.ReactNode }> = [
  { id: 'agents', label: 'Agents', icon: <Robot size={15} theme="outline" /> },
  { id: 'documents', label: 'Documents', icon: <Book size={15} theme="outline" /> },
  { id: 'tools', label: 'Tools & MCP', icon: <Tool size={15} theme="outline" /> },
  { id: 'templates', label: 'Templates', icon: <FileText size={15} theme="outline" /> },
]

function ResourceTabs({ tab, onTabChange }: {
  tab: WorkspaceTab
  onTabChange: (tab: WorkspaceTab) => void
}) {
  return (
    <nav
      className="wk-resource-tabs" aria-label="Workspace sections"
      style={{ gridTemplateColumns: `repeat(${RESOURCE_TABS.length}, minmax(0, 1fr))` }}
    >
      {RESOURCE_TABS.map((item) => (
        <button
          key={item.id}
          className={`wk-resource-tab ${tab === item.id ? 'active' : ''}`}
          onClick={() => onTabChange(item.id)}
        >
          {item.icon}
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  )
}

function PlannedResourceTab() {
  return (
    <PlannedFeatureCard
      icon={<FileText size={24} />}
      title="Templates"
      description="Reusable project, document, workflow, and prompt templates."
      note="This resource family is reserved in the Workspace console and will be connected when the backend model is ready."
    />
  )
}

function AgentGrid({ userAgents, builtinAgents, loading, error, onSelect, onNew, onRefresh }: {
  userAgents: Agent[]; builtinAgents: Agent[]
  loading: boolean; error: string | null
  onSelect: (a: Agent) => void; onNew: () => void; onRefresh: () => void
}) {
  if (loading) return <div className="wk-center"><LoadingOne size={23} className="spin" /></div>
  if (error)   return <div className="wk-center"><Caution size={18} /><p>{error}</p></div>
  const allAgents = [...userAgents, ...builtinAgents]

  return (
    <div className="wk-grid-root">
      <div className="wk-grid-bar">
        <div className="wk-grid-bar-title">
          {allAgents.length === 0
            ? 'No agents yet'
            : `${allAgents.length} agent${allAgents.length > 1 ? 's' : ''}`}
        </div>
        <div className="wk-grid-bar-actions">
          <button className="wk-icon-btn" onClick={onRefresh} title="Refresh">
            <Sync size={12} />
          </button>
          <button className="wk-new-btn" onClick={onNew}><Plus size={11} /> New Agent</button>
        </div>
      </div>

      {allAgents.length === 0 ? (
        <div className="wk-center">
          <Robot size={39} theme="outline" />
          <h2>No agents yet</h2>
          <p>Create a custom agent with its own system prompt, tools, and personality.</p>
          <button className="wk-new-btn lg" onClick={onNew}><Plus size={12} /> Create your first agent</button>
        </div>
      ) : (
        <div className="wk-console-layout">
          <div className="wk-agent-roster">
            {allAgents.map((agent, index) => (
              <button
                key={agent.slug}
                className={`wk-agent-card ${index === 0 ? 'featured' : ''}`}
                onClick={() => onSelect(agent)}
              >
                <div className="wk-agent-card-actions" onClick={(event) => event.stopPropagation()}>
                  <span className="wk-agent-icon-action" role="button" tabIndex={0} aria-label="Favorite">
                    <Star size={14} />
                  </span>
                  <span className="wk-agent-icon-action" role="button" tabIndex={0} aria-label="More">
                    <More size={16} />
                  </span>
                </div>

                <Avatar agent={agent} size={56} />

                <div className="wk-agent-card-main">
                  <div className="wk-agent-title-row">
                    <div>
                      <div className="wk-agent-name">{agent.name || agent.slug}</div>
                      <div className="wk-agent-slug">/{agent.slug}</div>
                    </div>
                  </div>
                  <p className="wk-agent-desc">{agent.when_to_use || 'Reusable agent ready for workspace tasks.'}</p>
                </div>

                <div className="wk-agent-meta">
                  <span className="wk-agent-chip">{agent.source === 'user' ? 'Private' : 'Built-in'}</span>
                  <span className="wk-agent-chip">{agent.model || 'Default'}</span>
                  <span className={`wk-agent-health ${agent.enabled ? 'ok' : 'off'}`}>
                    <span />{agent.enabled ? 'Healthy' : 'Disabled'}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
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

// ─── Avatar picker ────────────────────────────────────────────────────────────
// Clicking the face opens a popover with a curated grid of variants grouped by
// style — pick one directly. The dice button next to it is a shortcut that skips
// the popover and just draws a new random variant in the current style.

const PICKER_VARIANTS_PER_STYLE = 8

function pickerSeeds(baseSeed: string): string[] {
  return Array.from({ length: PICKER_VARIANTS_PER_STYLE }, (_, i) => `${baseSeed}-${i}`)
}

function AvatarPicker({ styleId, seed, baseSeed, onPick, onReroll, disabled, size = 64 }: {
  styleId: AvatarStyleId; seed: string; baseSeed: string
  onPick: (styleId: AvatarStyleId, seed: string) => void
  onReroll: () => void
  disabled?: boolean; size?: number
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const radius = Math.round(size * 0.28)
  const svg = useMemo(() => generatedAvatarSvg(styleId, seed), [styleId, seed])

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="wk-avatar-picker" ref={wrapRef}>
      <div className="wk-avatar-picker-row">
        <button
          type="button"
          className="wk-avatar-picker-face"
          style={{ width: size, height: size, borderRadius: radius }}
          onClick={() => !disabled && setOpen(v => !v)}
          disabled={disabled}
          title={disabled ? undefined : 'Choose a face'}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        {!disabled && (
          <button
            type="button"
            className="wk-avatar-reroll"
            onClick={onReroll}
            title="Generate a new face"
          >
            <Sync size={12} />
          </button>
        )}
      </div>

      {open && !disabled && (
        <div className="wk-avatar-popover">
          {(Object.keys(AVATAR_STYLES) as AvatarStyleId[]).map(id => (
            <div key={id} className="wk-avatar-popover-group">
              <div className="wk-avatar-popover-title">{AVATAR_STYLES[id].label}</div>
              <div className="wk-avatar-popover-grid">
                {pickerSeeds(baseSeed).map(s => {
                  const selected = id === styleId && s === seed
                  return (
                    <button
                      key={s}
                      type="button"
                      className={`wk-avatar-swatch ${selected ? 'selected' : ''}`}
                      onClick={() => { onPick(id, s); setOpen(false) }}
                      dangerouslySetInnerHTML={{ __html: generatedAvatarSvg(id, s) }}
                    />
                  )
                })}
              </div>
            </div>
          ))}
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

  const baseSeed = form.slug || 'new-agent'
  const { styleId: avatarStyleId, seed: avatarSeed } = parseAvatarIcon(form.icon, baseSeed)

  return (
    <form className="wk-form" onSubmit={handleSubmit}>
      {err && <div className="wk-form-error"><Caution size={11} />{err}</div>}

      <div className="wk-form-split">
        {/* Left — identity & lifecycle */}
        <aside className="wk-form-left">
          <div className="wk-section-title">Identity</div>

          <div className="wk-identity-card">
            <AvatarPicker
              styleId={avatarStyleId}
              seed={avatarSeed}
              baseSeed={baseSeed}
              onPick={(styleId, seed) => update('icon', encodeAvatarIcon(styleId, seed))}
              onReroll={() => update('icon', encodeAvatarIcon(avatarStyleId, randomSeed()))}
              disabled={isBuiltin}
              size={64}
            />
            <div className="wk-identity-fields-v">
              <div className="wk-field">
                <label>Display name</label>
                <input ref={nameRef} type="text" placeholder="e.g. Research Assistant"
                  value={form.name} onChange={e => update('name', e.target.value)}
                  disabled={isBuiltin} className="wk-name-input" />
              </div>
              <div className="wk-field">
                <label>Slug {isNew && <span className="wk-required">*</span>}</label>
                <div className="wk-slug-wrap">
                  <span className="wk-slug-prefix">/</span>
                  <input type="text" placeholder="my-agent" value={form.slug}
                    onChange={e => { setSlugManual(true); update('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')) }}
                    disabled={isBuiltin || !isNew} className="wk-slug-input" />
                </div>
              </div>
            </div>
          </div>
          {isNew && <span className="wk-hint">Lowercase letters, digits and hyphens. Cannot be changed after creation.</span>}

          <div className="wk-field">
            <label>When to use <span className="wk-opt">(shown to the model)</span></label>
            <textarea rows={5} placeholder="e.g. Use this agent for deep research tasks requiring web search."
              value={form.when_to_use} onChange={e => update('when_to_use', e.target.value)} disabled={isBuiltin} />
          </div>

          {!isNew && agent && (
            <div className="wk-field-inline standalone">
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
          )}

          {!isNew && agent && !isBuiltin && (
            <div className="wk-danger-zone">
              <button type="button" className="wk-btn ghost danger full" onClick={() => onDelete(agent)}>
                <Delete size={12} /> Delete agent
              </button>
            </div>
          )}
        </aside>

        {/* Right — prompt & configuration */}
        <main className="wk-form-right">
          <div className="wk-field">
            <label>System prompt</label>
            <textarea rows={14} placeholder={'You are a research assistant...\n\nYour role is to...\n\nAlways cite your sources.'}
              value={form.system_prompt} onChange={e => update('system_prompt', e.target.value)}
              disabled={isBuiltin} className="wk-mono-area" />
          </div>

          <div className="wk-panel-group">
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

          <div className="wk-panel-group">
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
            <div className="wk-field">
              <label>Permission mode</label>
              <select value={form.permission_mode} onChange={e => update('permission_mode', e.target.value)} disabled={isBuiltin}>
                {PERMISSION_MODE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>
        </main>
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
    // agent_slug isn't a session-creation field (the backend has no such
    // concept - a session's agent is resolved per turn from the query
    // request, see TestChatInner's sendMessage call below). Passing it here
    // used to be silently ignored; removed so nothing implies it did
    // anything.
    api.post<Session>('/sessions', {
      title: `Test — ${agent.name || agent.slug}`,
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
    await sendMessage(text, { agentSlug: agent.slug })
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

// ─── Tools & MCP tab ────────────────────────────────────────────────────────────
// "Internal" is a read-only reference: those tool names come from
// toolDisplay.tsx's TOOL_REGISTRY (the same catalog the chat UI uses to
// render tool calls), so it can't drift out of sync with what agents can
// actually invoke. "MCP" below it is the live, editable registry — servers
// you add here are real config, reloaded into the running backend.

type InternalToolGroupId =
  | 'browser'
  | 'web'
  | 'files'
  | 'code'
  | 'terminal'
  | 'knowledge'
  | 'agents'
  | 'automation'
  | 'notebooks'
  | 'media'
  | 'comms'
  | 'skills'
  | 'data'
  | 'vcs'
  | 'other'

type InternalToolGroup = {
  id: InternalToolGroupId
  label: string
  icon: ReactNode
}

const INTERNAL_TOOL_GROUPS: InternalToolGroup[] = [
  { id: 'browser', label: 'Browser', icon: <Globe size={14} /> },
  { id: 'web', label: 'Web & Research', icon: <Search size={14} /> },
  { id: 'files', label: 'Files', icon: <FileText size={14} /> },
  { id: 'code', label: 'Code Editing', icon: <Edit size={14} /> },
  { id: 'terminal', label: 'Terminal', icon: <Terminal size={14} /> },
  { id: 'knowledge', label: 'Knowledge', icon: <Brain size={14} /> },
  { id: 'agents', label: 'Agents & Tasks', icon: <Robot size={14} /> },
  { id: 'automation', label: 'Automation', icon: <Lightning size={14} /> },
  { id: 'notebooks', label: 'Notebooks', icon: <Book size={14} /> },
  { id: 'media', label: 'Media', icon: <Upload size={14} /> },
  { id: 'comms', label: 'Comms', icon: <Send size={14} /> },
  { id: 'skills', label: 'Skills & Config', icon: <Api size={14} /> },
  { id: 'data', label: 'Data & Math', icon: <Tool size={14} /> },
  { id: 'vcs', label: 'Version Control', icon: <FileText size={14} /> },
  { id: 'other', label: 'Other', icon: <Tool size={14} /> },
]

function internalToolGroupFor(tool: ToolCatalogEntry): InternalToolGroupId {
  const name = tool.name
  if (name.startsWith('browser_')) return 'browser'
  if (['web_search', 'web_fetch', 'read_document_url', 'read_url', 'hn_stories', 'hn_item', 'hn_search', 'devto_feed', 'devto_article', 'devto_publish'].includes(name)) return 'web'
  if (['read', 'file_read', 'read_file', 'list_directory', 'write', 'file_write', 'write_file', 'create_directory', 'remove_file', 'get_file_metadata', 'docx'].includes(name)) return 'files'
  if (['edit', 'file_edit', 'edit_file', 'apply_patch', 'lsp', 'code_complete'].includes(name)) return 'code'
  if (tool.category === 'bash' || ['monitor', 'write_stdin', 'job_output', 'job_kill'].includes(name)) return 'terminal'
  if (name.startsWith('rag_') || name.startsWith('memory_')) return 'knowledge'
  if (name.includes('agent') || name.startsWith('task_') || ['ask_user_question'].includes(name)) return 'agents'
  if (name.endsWith('_job') || name.endsWith('_jobs') || ['schedule_job', 'list_jobs', 'update_job', 'run_job_now', 'delete_job', 'pause_job', 'resume_job'].includes(name)) return 'automation'
  if (name.startsWith('notebook_')) return 'notebooks'
  if (['generate_image', 'text_to_speech', 'speech_to_text'].includes(name)) return 'media'
  if (name.startsWith('mailbox_') || name.endsWith('_send') || name.includes('broadcast')) return 'comms'
  if (['tool_search', 'skill', 'config', 'brief', 'request_permissions'].includes(name) || name.startsWith('seshat_')) return 'skills'
  if (['calculator', 'unit_convert', 'statistics', 'financial_calc'].includes(name)) return 'data'
  if (name.startsWith('git_')) return 'vcs'
  return 'other'
}

type ToolsTabProps = {
  embedded?: boolean
  sub?: ToolsSubTab
  onSubChange?: (sub: ToolsSubTab) => void
}

function ToolsTab({ embedded = false, sub: controlledSub, onSubChange }: ToolsTabProps = {}) {
  const [localSub, setLocalSub] = useState<ToolsSubTab>('mcp')
  const sub = controlledSub ?? localSub
  const setSub = onSubChange ?? setLocalSub
  const tabs = (
    <div className="wk-detail-tabs wk-tools-tabs">
      <button className={`wk-detail-tab ${sub === 'mcp' ? 'active' : ''}`} onClick={() => setSub('mcp')}>
        <Api size={11} /> MCP
      </button>
      <button className={`wk-detail-tab ${sub === 'internal' ? 'active' : ''}`} onClick={() => setSub('internal')}>
        <Tool size={11} /> Internal
      </button>
    </div>
  )

  return (
    <div className="wk-tools-root">
      {!embedded && <div className="wk-tools-subbar">{tabs}</div>}
      <div className="wk-tools-scroll">
        {sub === 'mcp' ? <McpSection /> : <InternalToolsSection />}
      </div>
    </div>
  )
}

function InternalToolsSection() {
  const [query, setQuery] = useState('')

  // Several internal aliases share the same display label (read/file_read/
  // read_file are all "Read") — showing each alias as its own chip is just
  // noise, so keep one chip per unique (category, label) pair.
  const seen = new Set<string>()
  const catalog = listToolCatalog().filter(t => {
    if (t.name.startsWith('mcp')) return false
    const key = `${internalToolGroupFor(t)}:${t.label}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  const q = query.trim().toLowerCase()
  const filtered = q
    ? catalog.filter(t => {
        const group = INTERNAL_TOOL_GROUPS.find(item => item.id === internalToolGroupFor(t))
        return t.label.toLowerCase().includes(q)
          || t.name.toLowerCase().includes(q)
          || group?.label.toLowerCase().includes(q)
      })
    : catalog

  const grouped = new Map<InternalToolGroupId, ToolCatalogEntry[]>()
  for (const entry of filtered) {
    const groupId = internalToolGroupFor(entry)
    const list = grouped.get(groupId) ?? []
    list.push(entry)
    grouped.set(groupId, list)
  }
  for (const list of grouped.values()) list.sort((a, b) => a.label.localeCompare(b.label))
  const visibleGroups = INTERNAL_TOOL_GROUPS.filter(group => grouped.has(group.id))

  return (
    <div className="wk-tools-internal">
      <div className="wk-tools-search">
        <Search size={13} className="wk-tools-search-icon" />
        <input
          type="text" placeholder="Filter tools…"
          value={query} onChange={e => setQuery(e.target.value)}
        />
      </div>

      {visibleGroups.length === 0 ? (
        <div className="wk-tools-empty">No tools match "{query}".</div>
      ) : (
        <div className="wk-tools-category-grid">
          {visibleGroups.map(group => (
            <section key={group.id} className="wk-tools-category-card">
              <div className="wk-tools-category-head">
                <span className="wk-tools-category-icon">{group.icon}</span>
                <span className="wk-tools-category-title">{group.label}</span>
                <span className="wk-tools-group-count">{grouped.get(group.id)!.length}</span>
              </div>
              <div className="wk-tools-tool-list">
                {grouped.get(group.id)!.map(t => (
                  <span key={t.name} className="wk-tools-tool-pill" title={t.name}>
                    <span>{t.label}</span>
                    <code>{t.name}</code>
                  </span>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

function McpSection() {
  return <McpPanel />
}

// ─── MCP types ────────────────────────────────────────────────────────────────

type MCPServer = {
  id: string
  name: string
  display_name: string
  server_type: string   // stdio | http | sse | ws
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
  headers?: Record<string, string>
  timeout_secs: number
  icon: string
  enabled: boolean
  source: string        // 'db' | 'file'
  created_at: number
  updated_at: number
}

type ReloadStatus = { name: string; ok: boolean; tools: number; error?: string }
type McpToolEntry = { name: string; description?: string }

// One MCP server shared by the connected organization — not a local
// mcp_servers row (see internal/cloudmcp): stays inactive until explicitly
// approved, since a stdio server spawns an arbitrary command locally.
type MCPOrgCatalogEntry = {
  id: string
  name: string
  display_name?: string
  server_type: string
  command?: string
  args?: string[]
  url?: string
  icon?: string
  approved: boolean
}

// ─── MCP panel ────────────────────────────────────────────────────────────────

export function McpPanel() {
  const [servers, setServers] = useState<MCPServer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pendingReload, setPendingReload] = useState(false)
  const [reloading, setReloading] = useState(false)
  const [reloadStatuses, setReloadStatuses] = useState<ReloadStatus[] | null>(null)
  const [toolsByServer, setToolsByServer] = useState<Record<string, McpToolEntry[]>>({})
  const [modal, setModal] = useState<{ mode: 'add' | 'edit'; server?: MCPServer } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.get<{ servers: MCPServer[]; count: number }>('/mcp/config')
      setServers(data.servers ?? [])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load MCP servers')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadTools = useCallback(async () => {
    try {
      const data = await api.get<{ tools: Record<string, McpToolEntry[]> }>('/mcp/tools')
      setToolsByServer(data.tools ?? {})
    } catch {
      // non-critical — tools panel stays empty until next reload
    }
  }, [])

  useEffect(() => { load(); loadTools() }, [load, loadTools])

  const handleToggle = async (id: string, enabled: boolean) => {
    await api.put(`/mcp/config/${id}`, { enabled })
    setServers(s => s.map(x => x.id === id ? { ...x, enabled } : x))
    setPendingReload(true)
  }

  const handleDelete = async (id: string) => {
    await api.delete(`/mcp/config/${id}`)
    setServers(s => s.filter(x => x.id !== id))
    setPendingReload(true)
  }

  const handleSave = async (data: Partial<MCPServer> & { id?: string }) => {
    if (data.id) {
      const updated = await api.put<MCPServer>(`/mcp/config/${data.id}`, data)
      setServers(s => s.map(x => x.id === data.id ? updated : x))
    } else {
      const created = await api.post<MCPServer>('/mcp/config', { ...data, enabled: true })
      setServers(s => [...s, created])
    }
    setPendingReload(true)
    setModal(null)
  }

  const handleImportJSON = () => { fileInputRef.current?.click() }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await file.text()
    let parsed: unknown
    try { parsed = JSON.parse(text) } catch { setError('Invalid JSON file'); return }
    const result = await api.post<{ imported: number; message: string }>('/mcp/config/import-json', parsed)
    await load()
    setPendingReload(true)
    setError(null)
    if (result.imported > 0) {
      setReloadStatuses([{ name: 'import', ok: true, tools: result.imported, error: undefined }])
      setTimeout(() => setReloadStatuses(null), 3000)
    }
    e.target.value = ''
  }

  const handleReload = async () => {
    setReloading(true)
    setReloadStatuses(null)
    try {
      const result = await api.post<{ reloaded: number; servers: ReloadStatus[] }>('/mcp/reload')
      setReloadStatuses(result.servers ?? [])
      setPendingReload(false)
      await loadTools()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Reload failed')
    } finally {
      setReloading(false)
    }
  }

  return (
    <>
      <div className="sv-card">
        <div className="sv-card-head">
          <div className="caps-mcp-header">
            <div className="sv-card-brand">
              <div>
                <div className="sv-brand-name">MCP Servers</div>
                <div className="sv-brand-sub">Tools exposed to agents via Model Context Protocol</div>
              </div>
            </div>
            <div className="caps-mcp-actions-bar">
              {pendingReload && (
                <span className="caps-reload-badge">
                  <Attention size={10} /> Reload required
                </span>
              )}
              <button className="wk-icon-btn" title="Refresh list" onClick={load}>
                <Sync size={13} />
              </button>
              <button className="caps-import-json-btn" onClick={handleImportJSON} title="Import from mcp.json">
                <Upload size={11} /> Load JSON
              </button>
              <button
                className={`caps-reload-btn ${reloading ? 'loading' : ''}`}
                onClick={handleReload}
                disabled={reloading}
              >
                <Sync size={11} /> {reloading ? 'Reloading…' : 'Apply & Reload'}
              </button>
              <button className="caps-add-mcp-btn" onClick={() => setModal({ mode: 'add' })}>
                <Plus size={11} /> Add server
              </button>
            </div>
          </div>
        </div>

        <div className="sv-card-body">
          {error && <div className="caps-error">{error}</div>}

          {reloadStatuses && (
            <div className="caps-reload-result">
              {reloadStatuses.map(s => (
                <div key={s.name} className={`caps-reload-row ${s.ok ? 'ok' : 'err'}`}>
                  {s.ok ? <Check size={11} /> : <Attention size={11} />}
                  <span>{s.name}</span>
                  {s.ok && <span className="caps-reload-tools">{s.tools} tools</span>}
                  {s.error && <span className="caps-reload-error">{s.error}</span>}
                </div>
              ))}
            </div>
          )}

          {loading ? (
            <div className="caps-loading">Loading servers…</div>
          ) : servers.length === 0 ? (
            <div className="caps-empty">
              No MCP servers configured. Add one or load from mcp.json.
            </div>
          ) : (
            <div className="caps-mcp-list">
              {servers.map(srv => (
                <McpServerCard
                  key={srv.id}
                  server={srv}
                  tools={toolsByServer[srv.name]}
                  onToggle={handleToggle}
                  onEdit={() => setModal({ mode: 'edit', server: srv })}
                  onDelete={() => handleDelete(srv.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <McpOrgCatalogSection onApprovalChanged={() => { setPendingReload(false); void load() }} />

      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {modal && (
        <McpServerModal
          mode={modal.mode}
          server={modal.server}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}
    </>
  )
}

// ─── MCP organization catalog ─────────────────────────────────────────────────
// Servers shared by a connected org — config only, never auto-loaded. Empty
// list in standalone mode (the fetch itself degrades silently server-side).

function McpOrgCatalogSection({ onApprovalChanged }: { onApprovalChanged: () => void }) {
  const [entries, setEntries] = useState<MCPOrgCatalogEntry[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const data = await api.get<{ mcp_org_catalog: MCPOrgCatalogEntry[]; count: number }>('/mcp/org-catalog')
      setEntries(data.mcp_org_catalog ?? [])
    } catch {
      // standalone mode or connectivity issue — just show nothing
      setEntries([])
    }
  }, [])

  useEffect(() => { void load() }, [load])

  if (entries.length === 0) return null

  const handleApprove = async (entry: MCPOrgCatalogEntry) => {
    setBusyId(entry.id)
    setError(null)
    try {
      await api.post(`/mcp/org-catalog/${entry.id}/approve`, {})
      setEntries(prev => prev.map(e => e.id === entry.id ? { ...e, approved: true } : e))
      onApprovalChanged()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to approve server')
    } finally {
      setBusyId(null)
    }
  }

  const handleRevoke = async (entry: MCPOrgCatalogEntry) => {
    setBusyId(entry.id)
    setError(null)
    try {
      await api.delete(`/mcp/org-catalog/${entry.id}/approve`)
      setEntries(prev => prev.map(e => e.id === entry.id ? { ...e, approved: false } : e))
      onApprovalChanged()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to revoke server')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="sv-card">
      <div className="sv-card-head">
        <div className="caps-mcp-header">
          <div className="sv-card-brand">
            <div>
              <div className="sv-brand-name">Organization catalog</div>
              <div className="sv-brand-sub">Servers shared by your organization — approve one to run it here</div>
            </div>
          </div>
        </div>
      </div>
      <div className="sv-card-body">
        {error && <div className="caps-error">{error}</div>}
        <div className="caps-mcp-list">
          {entries.map(entry => {
            const isStdio = entry.server_type === 'stdio'
            return (
              <div key={entry.id} className={`caps-mcp-card ${entry.approved ? '' : 'disabled'}`}>
                <div className="caps-mcp-card-main">
                  <div className="caps-mcp-card-left">
                    <div className="caps-mcp-icon">{entry.icon || '🔌'}</div>
                    <div className="caps-mcp-info">
                      <div className="caps-mcp-title">
                        <span className="caps-mcp-name">{entry.display_name || entry.name}</span>
                        <span className="caps-mcp-type-badge">
                          {isStdio ? <Terminal size={10} /> : <Globe size={10} />}
                          {entry.server_type}
                        </span>
                        <span className="caps-mcp-source-badge">from organization</span>
                      </div>
                      <div className="caps-mcp-detail">
                        {isStdio
                          ? <code>{entry.command}{entry.args?.length ? ' ' + entry.args.join(' ') : ''}</code>
                          : <code>{entry.url}</code>
                        }
                      </div>
                    </div>
                  </div>
                  <div className="caps-mcp-actions">
                    {entry.approved ? (
                      <button
                        className="caps-org-mcp-revoke-btn"
                        onClick={() => handleRevoke(entry)}
                        disabled={busyId === entry.id}
                        title="Stop running this server locally"
                      >
                        <CheckOne size={11} /> {busyId === entry.id ? 'Working…' : 'Active'}
                      </button>
                    ) : (
                      <button
                        className="caps-org-mcp-approve-btn"
                        onClick={() => handleApprove(entry)}
                        disabled={busyId === entry.id}
                        title={isStdio ? 'This will run a command on your machine' : 'Enable this server locally'}
                      >
                        <Lock size={11} /> {busyId === entry.id ? 'Working…' : 'Activer'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function McpServerCard({
  server, tools, onToggle, onEdit, onDelete,
}: {
  server: MCPServer
  tools?: McpToolEntry[]
  onToggle: (id: string, enabled: boolean) => void
  onEdit: () => void
  onDelete: () => void
}) {
  const isStdio = server.server_type === 'stdio'
  const [expanded, setExpanded] = useState(false)
  const hasTools = tools && tools.length > 0

  return (
    <div className={`caps-mcp-card ${server.enabled ? '' : 'disabled'} ${expanded ? 'expanded' : ''}`}>
      <div className="caps-mcp-card-main">
        <div className="caps-mcp-card-left">
          <div className="caps-mcp-icon">{server.icon || '🔌'}</div>
          <div className="caps-mcp-info">
            <div className="caps-mcp-title">
              <span className="caps-mcp-name">{server.display_name || server.name}</span>
              <span className="caps-mcp-type-badge">
                {isStdio ? <Terminal size={10} /> : <Globe size={10} />}
                {server.server_type}
              </span>
              {server.source === 'file' && (
                <span className="caps-mcp-source-badge">from file</span>
              )}
              {hasTools && (
                <button
                  className={`caps-tools-toggle ${expanded ? 'active' : ''}`}
                  onClick={() => setExpanded(v => !v)}
                  title={expanded ? 'Hide tools' : 'Show tools'}
                >
                  <Api size={10} />
                  {tools.length} tool{tools.length !== 1 ? 's' : ''}
                  <Down size={10} style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
                </button>
              )}
              {!hasTools && server.enabled && (
                <span className="caps-no-tools-badge">no tools loaded</span>
              )}
            </div>
            <div className="caps-mcp-detail">
              {isStdio
                ? <code>{server.command}{server.args?.length ? ' ' + server.args.join(' ') : ''}</code>
                : <code>{server.url}</code>
              }
            </div>
          </div>
        </div>
        <div className="caps-mcp-actions">
          <label className="caps-mcp-toggle" title={server.enabled ? 'Disable' : 'Enable'}>
            <input
              type="checkbox"
              checked={server.enabled}
              onChange={e => onToggle(server.id, e.target.checked)}
            />
            <span className="caps-toggle-track" />
          </label>
          <button className="caps-mini-btn" title="Edit" onClick={onEdit}>
            <Edit size={11} />
          </button>
          <button className="caps-mini-btn danger" title="Delete" onClick={onDelete}>
            <Close size={11} />
          </button>
        </div>
      </div>

      {expanded && hasTools && (
        <div className="caps-tools-list">
          {tools.map(t => (
            <div key={t.name} className="caps-tool-row">
              <code className="caps-tool-name">{t.name}</code>
              {t.description && <span className="caps-tool-desc">{t.description}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── MCP Server add/edit modal ────────────────────────────────────────────────

function McpServerModal({
  mode, server, onSave, onClose,
}: {
  mode: 'add' | 'edit'
  server?: MCPServer
  onSave: (data: Partial<MCPServer> & { id?: string }) => Promise<void>
  onClose: () => void
}) {
  const [form, setForm] = useState({
    name:         server?.name         ?? '',
    display_name: server?.display_name ?? '',
    server_type:  server?.server_type  ?? 'stdio',
    command:      server?.command      ?? '',
    args_raw:     (server?.args ?? []).join(' '),
    env_raw:      Object.entries(server?.env ?? {}).map(([k,v]) => `${k}=${v}`).join('\n'),
    url:          server?.url          ?? '',
    timeout_secs: server?.timeout_secs ?? 30,
    icon:         server?.icon         ?? '🔌',
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const set = (k: keyof typeof form, v: string | number) =>
    setForm(f => ({ ...f, [k]: v }))

  const isStdio = form.server_type === 'stdio'

  const parseArgs = (raw: string): string[] =>
    raw.trim() ? raw.trim().split(/\s+/) : []

  const parseEnv = (raw: string): Record<string, string> => {
    const out: Record<string, string> = {}
    raw.split('\n').forEach(line => {
      const idx = line.indexOf('=')
      if (idx > 0) out[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
    })
    return out
  }

  const handleSave = async () => {
    if (!form.name.trim()) { setErr('Name is required'); return }
    if (isStdio && !form.command.trim()) { setErr('Command is required for stdio servers'); return }
    if (!isStdio && !form.url.trim()) { setErr('URL is required for http/sse servers'); return }
    setSaving(true)
    setErr(null)
    try {
      await onSave({
        id:          server?.id,
        name:        form.name.trim(),
        display_name: form.display_name.trim(),
        server_type: form.server_type,
        command:     form.command.trim(),
        args:        parseArgs(form.args_raw),
        env:         parseEnv(form.env_raw),
        url:         form.url.trim(),
        timeout_secs: Number(form.timeout_secs),
        icon:        form.icon.trim() || '🔌',
      })
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed to save')
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-shell mcp-modal-shell">
        <div className="modal-header">
          <h2>{mode === 'add' ? 'Add MCP Server' : 'Edit MCP Server'}</h2>
          <button className="modal-close-btn" onClick={onClose}><WindowCloseIcon size={16} /></button>
        </div>
        <div className="modal-content" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {err && <div className="caps-error">{err}</div>}

          <div className="mcp-form-row-2">
            <div className="sv-field">
              <label>Icon (emoji)</label>
              <div className="sv-input-box">
                <input
                  type="text"
                  value={form.icon}
                  onChange={e => set('icon', e.target.value)}
                  placeholder="🔌"
                  style={{ width: 60, textAlign: 'center', fontSize: 22 }}
                />
              </div>
            </div>
            <div className="sv-field" style={{ flex: 1 }}>
              <label>Name (unique key)</label>
              <div className="sv-input-box">
                <input
                  type="text"
                  value={form.name}
                  onChange={e => set('name', e.target.value)}
                  placeholder="e.g. filesystem"
                  disabled={mode === 'edit'}
                />
              </div>
            </div>
          </div>

          <div className="sv-field">
            <label>Display name</label>
            <div className="sv-input-box">
              <input
                type="text"
                value={form.display_name}
                onChange={e => set('display_name', e.target.value)}
                placeholder="e.g. Filesystem Tools"
              />
            </div>
          </div>

          <div className="sv-field">
            <label>Transport</label>
            <div className="sv-input-box">
              <select
                value={form.server_type}
                onChange={e => set('server_type', e.target.value)}
              >
                <option value="stdio">stdio (subprocess)</option>
                <option value="http">HTTP</option>
                <option value="sse">SSE</option>
                <option value="ws">WebSocket</option>
              </select>
            </div>
          </div>

          {isStdio ? (
            <>
              <div className="sv-field">
                <label>Command</label>
                <div className="sv-input-box">
                  <input
                    type="text"
                    value={form.command}
                    onChange={e => set('command', e.target.value)}
                    placeholder="e.g. npx or /usr/bin/python3"
                  />
                </div>
              </div>
              <div className="sv-field">
                <label>Arguments (space-separated)</label>
                <div className="sv-input-box">
                  <input
                    type="text"
                    value={form.args_raw}
                    onChange={e => set('args_raw', e.target.value)}
                    placeholder="-y @modelcontextprotocol/server-filesystem /tmp"
                  />
                </div>
              </div>
              <div className="sv-field">
                <label>Environment variables (KEY=VALUE, one per line)</label>
                <textarea
                  className="mcp-env-textarea"
                  value={form.env_raw}
                  onChange={e => set('env_raw', e.target.value)}
                  placeholder={"PATH=/usr/local/bin\nNODE_ENV=production"}
                  rows={3}
                />
              </div>
            </>
          ) : (
            <div className="sv-field">
              <label>URL</label>
              <div className="sv-input-box">
                <input
                  type="text"
                  value={form.url}
                  onChange={e => set('url', e.target.value)}
                  placeholder="http://localhost:3000/mcp"
                />
              </div>
            </div>
          )}

          <div className="sv-field">
            <label>Timeout (seconds)</label>
            <div className="sv-input-box">
              <input
                type="number"
                value={form.timeout_secs}
                onChange={e => set('timeout_secs', e.target.value)}
                min={5}
                max={300}
                style={{ width: 100 }}
              />
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="modal-btn-cancel" onClick={onClose}>Cancel</button>
          <button className="modal-btn-submit" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : mode === 'add' ? 'Add Server' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Documents tab ────────────────────────────────────────────────────────────
// Admin-only org document repository: collections created here are indexed
// and become available to every user (see the future user-facing Knowledge
// app, separate from this page). Purely a manager — creating/uploading/
// ingesting — not a search/ask interface (that already happens in the
// main Seshat chat, via a corpus-scoped rag_search call).

type DocumentsTabProps = {
  embedded?: boolean
  resetKey?: number
  onSelectionChange?: (name: string | null) => void
  onActionsChange?: (actions: ReactNode | null) => void
}

function DocumentsTab({ embedded = false, resetKey = 0, onSelectionChange, onActionsChange }: DocumentsTabProps = {}) {
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

  function selectCorpus(corpus: Corpus | null) {
    setSelected(corpus)
    onSelectionChange?.(corpus?.name ?? null)
  }

  useEffect(() => {
    selectCorpus(null)
  }, [resetKey])

  useEffect(() => {
    if (!embedded) return
    if (selected) {
      onActionsChange?.(
        <>
          <span className="wk-doc-count">{selected.chunk_count} chunks</span>
          <button
            className="wk-new-btn"
            onClick={() => fileInputRef.current?.click()}
            disabled={actionLoading === 'upload'}
          >
            {actionLoading === 'upload'
              ? <><LoadingOne size={11} className="spin" /> Uploading...</>
              : <><Plus size={11} /> Add file</>}
          </button>
        </>
      )
    } else {
      onActionsChange?.(
        <button className="wk-new-btn" onClick={() => setShowCreate(true)}>
          <Plus size={11} /> New Collection
        </button>
      )
    }
    return () => onActionsChange?.(null)
  }, [embedded, selected, actionLoading, onActionsChange])

  useEffect(() => {
    setLoading(true)
    api.get<{ corpora: Corpus[] }>('/corpora')
      .then(r => setCorpora(r.corpora ?? []))
      .catch(() => showToast('err', 'Failed to load documents'))
      .finally(() => setLoading(false))
  }, [])

  function loadDetail(corpus: Corpus) {
    selectCorpus(corpus)
    setDetailLoading(true)
    Promise.all([
      api.get<{ files: CorpusFile[] }>(`/corpora/${corpus.id}/files`),
      api.get<{ jobs: IngestionJob[] }>(`/corpora/${corpus.id}/ingest/jobs`),
    ])
      .then(([fr, jr]) => { setCorpusFiles(fr.files ?? []); setJobs(jr.jobs ?? []) })
      .catch(() => showToast('err', 'Failed to load collection details'))
      .finally(() => setDetailLoading(false))
  }

  async function createCorpus() {
    if (!newName.trim()) return
    setSaving(true)
    try {
      const corpus = await api.post<Corpus>('/corpora', { name: newName.trim(), description: newDesc.trim() || undefined })
      setCorpora(c => [corpus, ...c])
      setShowCreate(false); setNewName(''); setNewDesc('')
      showToast('ok', 'Collection created')
    } catch { showToast('err', 'Failed to create collection') }
    finally { setSaving(false) }
  }

  async function deleteCorpus(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    if (!window.confirm('Delete this collection and all its indexed data?')) return
    try {
      await api.delete(`/corpora/${id}`)
      setCorpora(c => c.filter(item => item.id !== id))
      if (selected?.id === id) selectCorpus(null)
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
    if (status === 'completed' || status === 'ingested') return 'var(--color-success)'
    if (status === 'failed') return 'var(--color-error)'
    if (status === 'running') return 'var(--color-info)'
    return 'var(--color-accent)'
  }

  // ── Detail view ──────────────────────────────────────────────────────────────
  if (selected) {
    return (
      <div className={`wk-documents wk-documents-detail${embedded ? ' embedded' : ''}`}>
        <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={handleFileInput} />
        <div className="wk-grid-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button className="wk-icon-btn" onClick={() => selectCorpus(null)} title="Back">
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

        <div className="wk-doc-detail-body">
          {detailLoading ? (
            <div className="wk-center">
              <LoadingOne size={23} className="spin" />
            </div>
          ) : corpusFiles.length === 0 ? (
            <div className="wk-center">
              <Brain size={30} style={{ opacity: 0.3 }} />
              <h2>No files yet</h2>
              <p>Upload documents to build this collection. PDFs, Markdown, and text files are supported.</p>
              <button className="wk-new-btn lg" onClick={() => fileInputRef.current?.click()}>
                <Plus size={12} /> Add your first file
              </button>
            </div>
          ) : (
            <div className="wk-doc-file-list">
              {corpusFiles.map(f => {
                const latestJob = jobs.filter(j => j.file_id === f.file_id).sort((a, b) => b.created_at - a.created_at)[0]
                const isRunning = latestJob?.status === 'running' || latestJob?.status === 'pending'
                return (
                  <div key={f.file_id} className="wk-doc-file-row">
                    <div className="wk-doc-file-info">
                      <span className="wk-doc-file-name">{f.filename}</span>
                      <span className="wk-doc-file-meta">
                        {f.chunk_count > 0 && `${f.chunk_count} chunks · `}
                        {f.ingested_at
                          ? `Ingested ${new Date(f.ingested_at * 1000).toLocaleDateString()}`
                          : 'Not yet ingested'}
                      </span>
                    </div>
                    <div className="wk-doc-file-actions">
                      <span className="wk-doc-status" style={{ color: statusColor(latestJob?.status ?? f.status) }}>
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
                        <span className="wk-doc-error" title={latestJob.last_error}>
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
    <div className="wk-documents">
      <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={handleFileInput} />

      <div className="wk-grid-bar">
        <div className="wk-grid-bar-title">Documents</div>
        <div className="wk-grid-bar-actions">
          <button className="wk-new-btn" onClick={() => setShowCreate(true)}>
            <Plus size={11} /> New Collection
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
            <h2>No collections yet</h2>
            <p>Create a collection and upload documents. Your agents can search and reason over indexed content using RAG.</p>
            <button className="wk-new-btn lg" onClick={() => setShowCreate(true)}>
              <Plus size={12} /> Create your first collection
            </button>
          </div>
        ) : (
          <div className="wk-card-grid">
            {corpora.map(corpus => (
              <button key={corpus.id} className="wk-card" onClick={() => loadDetail(corpus)}>
                <div className="wk-card-top">
                  <div className="wk-doc-icon">
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
              New collection
            </button>
          </div>
        )}
      </div>

      {/* Create modal */}
      {showCreate && (
        <div className="wk-modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="wk-modal" onClick={e => e.stopPropagation()}>
            <div className="wk-modal-header">
              <span className="wk-modal-title">New Collection</span>
              <button className="wk-icon-btn" onClick={() => setShowCreate(false)}><WindowCloseIcon size={13} /></button>
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
  display: flex; align-items: center; gap: var(--space-3);
  padding: var(--space-3) 11px; border-radius: var(--radius-md);
  font-size: var(--font-size-xs); font-weight: 600;
  box-shadow: var(--shadow-medium);
  animation: wk-slide 0.18s ease;
}
.wk-toast.ok  { background: var(--color-bg); border: 1px solid rgba(var(--color-success-rgb), 0.4); color: var(--color-success); }
.wk-toast.err { background: var(--color-bg); border: 1px solid rgba(var(--color-error-rgb), 0.4); color: var(--color-error); }
@keyframes wk-slide { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:none; } }

/* Top bar */
.wk-topbar {
  display: grid; grid-template-columns: minmax(160px, 1fr) auto minmax(160px, 1fr);
  align-items: center;
  padding: 0 14px; height: 52px; flex-shrink: 0;
  background: var(--color-bg);
  border-bottom: 1px solid var(--color-border-subtle);
  gap: 9px;
}
.wk-topbar-left  { display: flex; align-items: center; gap: var(--space-3); min-width: 0; justify-self: stretch; }
.wk-topbar-right { display: flex; align-items: center; justify-content: flex-end; gap: var(--space-3); min-width: 0; justify-self: stretch; }
.wk-logo-wrap {
  display: flex; align-items: center; justify-content: center;
  width: 30px; height: 30px; border-radius: var(--radius-sm);
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
  padding: var(--space-4) 0 11px;
}
.wk-sidenav-items { flex: 1; display: flex; flex-direction: column; gap: var(--space-1); padding: 0 7px; }
.wk-sidenav-item {
  display: flex; align-items: center; gap: var(--space-4);
  width: 100%; padding: var(--space-3) var(--space-4); border-radius: var(--radius-md);
  border: none; background: transparent;
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs); font-weight: 600; cursor: pointer;
  transition: all 0.1s; text-align: left;
}
.wk-sidenav-item:hover { background: var(--color-hover); color: var(--color-text); }
.wk-sidenav-item.active {
  background: color-mix(in srgb, var(--color-primary) 12%, transparent);
  color: var(--color-primary);
}
.wk-sidenav-footer { padding: var(--space-4) 7px 0; border-top: 1px solid var(--color-border-subtle); margin-top: var(--space-4); }
.wk-sidenav-back {
  display: flex; align-items: center; gap: var(--space-3);
  width: 100%; padding: var(--space-3) var(--space-4); border-radius: var(--radius-sm);
  border: none; background: none;
  color: var(--color-text-muted); font-size: var(--font-size-2xs); font-weight: 600;
  cursor: pointer; transition: background 0.1s, color 0.1s;
}
.wk-sidenav-back:hover { background: var(--color-hover); color: var(--color-text); }

.wk-back-chip {
  display: inline-flex; align-items: center; gap: var(--space-2);
  padding: var(--space-2) 7px; border-radius: var(--radius-sm); border: none;
  background: var(--color-hover); color: var(--color-text-secondary);
  font-size: var(--font-size-2xs); font-weight: 600; cursor: pointer; white-space: nowrap;
  transition: background 0.1s, color 0.1s; flex-shrink: 0;
}
.wk-back-chip:hover { background: var(--color-border); color: var(--color-text); }
.wk-topbar-sep   { color: var(--color-text-muted); font-size: var(--font-size-sm); user-select: none; flex-shrink: 0; }
.wk-topbar-title { font-size: var(--font-size-base); font-weight: 700; color: var(--color-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.wk-topbar-crumb {
  border: none; background: transparent; padding: 0;
  color: var(--color-text); font-size: var(--font-size-base); font-weight: 700;
  cursor: pointer; white-space: nowrap;
}
.wk-topbar-crumb:hover { color: var(--color-cta); }

/* Detail tabs */
.wk-detail-tabs {
  display: flex; gap: 3px;
  background: var(--color-surface); border-radius: var(--radius-sm); padding: var(--space-1);
  border: 1px solid var(--color-border-subtle);
}
.wk-detail-tab {
  display: flex; align-items: center; gap: var(--space-2);
  padding: var(--space-2) var(--space-4); border-radius: var(--radius-sm); border: none;
  background: transparent; cursor: pointer;
  font-size: var(--font-size-2xs); font-weight: 600; color: var(--color-text-secondary);
  transition: all 0.1s;
}
.wk-detail-tab:hover:not(:disabled) { background: var(--color-hover); color: var(--color-text); }
.wk-detail-tab.active { background: var(--color-bg); color: var(--color-text); box-shadow: var(--shadow-soft); }
.wk-detail-tab:disabled { opacity: 0.35; cursor: not-allowed; }

/* Body (content area right of sidenav) */
.wk-body { flex: 1; overflow: hidden; display: flex; flex-direction: column; }

/* Center util */
.wk-center {
  flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: var(--space-6); padding: 42px 28px; text-align: center; color: var(--color-text-muted);
}
.wk-center h2 { margin: 0; font-size: var(--font-size-xl); color: var(--color-text); }
.wk-center p  { margin: 0; font-size: var(--font-size-sm); max-width: 380px; line-height: 1.6; }

/* Buttons */
.wk-new-btn {
  display: inline-flex; align-items: center; gap: var(--space-3);
  padding: var(--space-3) 11px; border-radius: var(--radius-sm); border: none;
  background: var(--color-cta); color: #fff;
  font-size: var(--font-size-xs); font-weight: 600; cursor: pointer; transition: opacity 0.1s; white-space: nowrap;
}
.wk-new-btn:hover:not(:disabled) { opacity: 0.88; }
.wk-new-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.wk-new-btn.lg { padding: 7px 14px; font-size: var(--font-size-sm); }

.wk-icon-btn {
  display: flex; align-items: center; justify-content: center;
  width: 30px; height: 30px; border-radius: var(--radius-sm); border: none;
  background: none; cursor: pointer; color: var(--color-text-muted);
  transition: background 0.1s, color 0.1s;
}
.wk-icon-btn:hover:not(:disabled) { background: var(--color-hover); color: var(--color-text); }
.wk-icon-btn.danger:hover { color: var(--color-error); background: rgba(var(--color-error-rgb), 0.08); }
.wk-icon-btn:disabled { opacity: 0.4; cursor: default; }

.wk-btn {
  display: inline-flex; align-items: center; gap: var(--space-3);
  padding: var(--space-3) 13px; border-radius: var(--radius-sm); font-size: var(--font-size-xs); font-weight: 600;
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
  padding: var(--space-5) 28px; border-bottom: 1px solid var(--color-border-subtle);
  background: var(--color-bg); flex-shrink: 0;
}
.wk-root.embedded .wk-grid-bar { display: none; }
.wk-grid-bar-title { font-size: var(--font-size-xs); font-weight: 600; color: var(--color-text-muted); }
.wk-grid-bar-actions { display: flex; align-items: center; gap: var(--space-3); }
.wk-documents-detail.embedded .wk-grid-bar { justify-content: flex-end; }
.wk-documents-detail.embedded .wk-grid-bar > :first-child { display: none; }
.wk-doc-count { font-size: var(--font-size-2xs); color: var(--color-text-muted); white-space: nowrap; }

/* Card grid */
.wk-grid-scroll { flex: 1; overflow-y: auto; padding: 22px 28px; display: flex; flex-direction: column; gap: 24px; }
.wk-grid-section { display: flex; flex-direction: column; gap: 9px; }
.wk-grid-section-title {
  font-size: var(--font-size-2xs); font-weight: 700; letter-spacing: 0.06em;
  text-transform: uppercase; color: var(--color-text-muted);
}
.wk-card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 9px;
}
.wk-card {
  background: var(--color-bg); border: 1px solid var(--color-border);
  border-radius: var(--radius-xl); padding: 13px;
  display: flex; flex-direction: column; gap: var(--space-3);
  text-align: left; cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s, transform 0.1s;
}
.wk-card:hover {
  border-color: color-mix(in srgb, var(--color-primary) 40%, transparent);
  box-shadow: var(--shadow-medium); transform: translateY(-1px);
}
.wk-card.disabled { opacity: 0.5; }
.wk-card-top { display: flex; align-items: flex-start; justify-content: space-between; }
.wk-card-badges { display: flex; flex-direction: column; gap: 3px; align-items: flex-end; }
.wk-badge {
  display: inline-block; padding: var(--space-1) var(--space-2); border-radius: var(--radius-xs);
  font-size: var(--font-size-2xs); font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em;
}
.wk-badge.builtin { background: rgba(107,57,203,0.1); color: var(--color-role-router); border: 1px solid rgba(107,57,203,0.2); }
.wk-badge.off     { background: rgba(120,120,120,0.1); color: var(--color-text-muted); border: 1px solid var(--color-border); }
.wk-card-name { font-size: var(--font-size-sm); font-weight: 700; color: var(--color-text); }
.wk-card-desc {
  font-size: var(--font-size-2xs); color: var(--color-text-muted); line-height: 1.5;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.wk-card-meta { font-size: var(--font-size-2xs); color: var(--color-text-muted); font-family: monospace; margin-top: var(--space-2); }
.wk-card-new {
  background: transparent; border: 1.5px dashed var(--color-border);
  border-radius: var(--radius-xl); padding: 13px;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: var(--space-3); color: var(--color-text-muted); cursor: pointer;
  font-size: var(--font-size-xs); font-weight: 600; min-height: 120px;
  transition: border-color 0.15s, color 0.15s;
}
.wk-card-new:hover { border-color: var(--color-primary); color: var(--color-primary); }

/* Detail */
.wk-detail { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.wk-readonly-banner {
  display: flex; align-items: center; gap: var(--space-3);
  padding: 7px 17px; font-size: var(--font-size-xs);
  background: rgba(239,124,47,0.06); border-bottom: 1px solid rgba(239,124,47,0.18);
  color: var(--color-primary); flex-shrink: 0;
}
.wk-detail-body { flex: 1; overflow: hidden; display: flex; }

/* Form — split layout: identity/lifecycle on the left, prompt/config on the right */
.wk-form { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.wk-form-split { flex: 1; display: flex; overflow: hidden; }
.wk-form-left {
  width: 320px; flex-shrink: 0; overflow-y: auto;
  display: flex; flex-direction: column; gap: 18px;
  padding: 22px 22px 20px; background: var(--color-bg);
  border-right: 1px solid var(--color-border-subtle);
}
.wk-form-right {
  flex: 1; min-width: 0; overflow-y: auto;
  display: flex; flex-direction: column;
  padding: 22px 28px 28px;
}
.wk-form-right > *:not(:first-child) {
  border-top: 1px solid var(--color-border-subtle);
  margin-top: 24px; padding-top: 24px;
}
.wk-panel-group { display: flex; flex-direction: column; gap: 11px; }

/* Generated avatar (grid cards) */
.wk-avatar-generated svg { width: 100%; height: 100%; display: block; }

/* Avatar picker (identity card: face + reroll + popover) */
.wk-avatar-picker { position: relative; display: flex; flex-direction: column; align-items: center; gap: var(--space-2); flex-shrink: 0; }
.wk-avatar-picker-row { display: flex; flex-direction: column; align-items: center; gap: var(--space-2); }
.wk-avatar-picker-face {
  overflow: hidden; flex-shrink: 0; padding: 0; margin: 0;
  background: var(--color-surface); border: 1px solid var(--color-border-subtle);
  cursor: pointer; transition: border-color 0.15s;
}
.wk-avatar-picker-face:hover:not(:disabled) { border-color: var(--color-primary); }
.wk-avatar-picker-face:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }
.wk-avatar-picker-face:disabled { cursor: default; }
.wk-avatar-picker-face svg { width: 100%; height: 100%; display: block; pointer-events: none; }
.wk-avatar-reroll {
  display: flex; align-items: center; justify-content: center;
  width: 26px; height: 26px; border-radius: 50%; border: 1px solid var(--color-border);
  background: var(--color-surface); color: var(--color-text-muted); cursor: pointer;
  transition: background 0.1s, color 0.1s, transform 0.15s;
}
.wk-avatar-reroll:hover { background: var(--color-hover); color: var(--color-text); }
.wk-avatar-reroll:active { transform: rotate(120deg); }

.wk-avatar-popover {
  position: absolute; top: calc(100% + 10px); left: 0;
  z-index: 300; width: 236px;
  background: var(--color-bg); border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-lg); box-shadow: var(--shadow-large);
  padding: 12px; display: flex; flex-direction: column; gap: 12px;
}
.wk-avatar-popover-group { display: flex; flex-direction: column; gap: 7px; }
.wk-avatar-popover-title {
  font-size: var(--font-size-2xs); font-weight: 700; letter-spacing: 0.04em;
  text-transform: uppercase; color: var(--color-text-muted);
}
.wk-avatar-popover-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
.wk-avatar-swatch {
  aspect-ratio: 1; border-radius: var(--radius-sm); overflow: hidden; padding: 0;
  background: var(--color-surface); border: 1.5px solid transparent; cursor: pointer;
  transition: border-color 0.12s, transform 0.1s;
}
.wk-avatar-swatch:hover { border-color: var(--color-border); transform: translateY(-1px); }
.wk-avatar-swatch.selected { border-color: var(--color-primary); }
.wk-avatar-swatch svg { width: 100%; height: 100%; display: block; pointer-events: none; }
.wk-section {
  padding: 14px 28px; border-bottom: 1px solid var(--color-border-subtle);
  display: flex; flex-direction: column; gap: 11px;
}
.wk-section-title {
  font-size: var(--font-size-2xs); font-weight: 700; letter-spacing: 0.06em;
  text-transform: uppercase; color: var(--color-text-muted);
}
.wk-field { display: flex; flex-direction: column; gap: var(--space-2); }
.wk-field.flex1 { flex: 1; }
.wk-field label { font-size: var(--font-size-2xs); font-weight: 600; color: var(--color-text-secondary); }
.wk-field input, .wk-field select, .wk-field textarea {
  background: var(--color-surface); border: 1px solid var(--color-border);
  border-radius: var(--radius-sm); padding: var(--space-3) var(--space-4);
  color: var(--color-text); font-size: var(--font-size-xs); font-family: inherit;
  outline: none; width: 100%; box-sizing: border-box; resize: vertical;
}
.wk-field input:focus, .wk-field select:focus, .wk-field textarea:focus { border-color: var(--color-primary); }
.wk-field input:disabled, .wk-field select:disabled, .wk-field textarea:disabled { opacity: 0.5; cursor: not-allowed; }
.wk-mono-area { font-family: monospace; font-size: var(--font-size-xs); line-height: 1.6; min-height: 220px; }
.wk-hint { font-size: var(--font-size-2xs); color: var(--color-text-muted); }
.wk-required { color: var(--color-error); font-weight: 700; }
.wk-opt { font-weight: 400; color: var(--color-text-muted); }
.wk-row { display: flex; gap: 9px; align-items: flex-start; }
.wk-row.align-center { align-items: center; }
.wk-row.align-end { align-items: flex-end; }

/* Identity card: icon on the left, name + slug stacked on the right */
.wk-identity-card { display: flex; gap: 14px; align-items: flex-start; }
.wk-identity-fields-v { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 11px; }
.wk-name-input { font-size: var(--font-size-sm); font-weight: 700; }

.wk-field-inline { display: flex; align-items: center; gap: var(--space-4); }
.wk-field-inline label { font-size: var(--font-size-2xs); font-weight: 600; color: var(--color-text-secondary); white-space: nowrap; }
.wk-field-inline.standalone {
  justify-content: space-between; padding: 9px 12px;
  border: 1px solid var(--color-border-subtle); border-radius: var(--radius-md);
  background: var(--color-surface);
}

.wk-danger-zone { margin-top: auto; padding-top: 16px; border-top: 1px solid var(--color-border-subtle); }
.wk-btn.full { width: 100%; justify-content: center; }
.wk-btn.danger { border-color: rgba(var(--color-error-rgb), 0.35); color: var(--color-error); }
.wk-btn.danger:hover:not(:disabled) { background: rgba(var(--color-error-rgb), 0.08); }
.wk-slug-wrap {
  display: flex; align-items: center;
  background: var(--color-surface); border: 1px solid var(--color-border);
  border-radius: var(--radius-sm); overflow: hidden;
}
.wk-slug-prefix { padding: var(--space-3) var(--space-1) var(--space-3) var(--space-4); font-size: var(--font-size-xs); color: var(--color-text-muted); font-family: monospace; user-select: none; }
.wk-slug-input { border: none !important; border-radius: 0 !important; padding-left: 2px !important; background: transparent !important; font-family: monospace !important; }
.wk-slug-input:focus { box-shadow: none !important; }
.wk-pills { display: flex; gap: var(--space-3); }
.wk-pill {
  padding: var(--space-2) var(--space-5); border-radius: var(--radius-sm); border: 1px solid var(--color-border);
  background: transparent; cursor: pointer;
  font-size: var(--font-size-2xs); font-weight: 600; color: var(--color-text-muted); transition: all 0.1s;
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
  background: #fff; box-shadow: var(--shadow-soft);
  transition: left 0.2s;
  pointer-events: none;
}
.wk-toggle.on  .wk-toggle-knob { left: 21px; }
.wk-toggle.off .wk-toggle-knob { left: 3px; }

.wk-form-footer {
  display: flex; align-items: center; justify-content: flex-end; gap: var(--space-4);
  padding: var(--space-5) 28px; border-top: 1px solid var(--color-border-subtle);
  background: var(--color-bg); flex-shrink: 0;
}
.wk-form-error {
  display: flex; align-items: center; gap: var(--space-3);
  margin: 16px 40px 0; padding: var(--space-3) var(--space-4); border-radius: var(--radius-sm);
  background: rgba(var(--color-error-rgb), 0.08); border: 1px solid rgba(var(--color-error-rgb), 0.25);
  font-size: var(--font-size-xs); color: var(--color-error);
}

/* Test chat */
.wk-test-chat { flex: 1; display: flex; flex-direction: column; overflow: hidden; background: var(--color-surface); }
.wk-test-header {
  display: flex; align-items: center; gap: var(--space-4);
  padding: var(--space-5) 22px; border-bottom: 1px solid var(--color-border-subtle);
  background: var(--color-bg); flex-shrink: 0;
}
.wk-test-agent-name { font-size: var(--font-size-sm); font-weight: 700; color: var(--color-text); }
.wk-test-badge {
  font-size: var(--font-size-2xs); font-weight: 600; padding: 2px var(--space-3); border-radius: var(--radius-xs);
  background: rgba(239,124,47,0.08); border: 1px solid rgba(239,124,47,0.2); color: var(--color-primary);
}
.wk-test-messages { flex: 1; overflow-y: auto; padding: 17px 22px; display: flex; flex-direction: column; gap: 15px; }
.wk-test-empty {
  flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 9px; color: var(--color-text-muted); text-align: center;
}
.wk-test-empty p { margin: 0; font-size: var(--font-size-sm); }
.wk-msg { display: flex; flex-direction: column; gap: 3px; max-width: 780px; }
.wk-msg.user { align-self: flex-end; align-items: flex-end; }
.wk-msg.assistant { align-self: flex-start; }
.wk-msg-role { font-size: var(--font-size-2xs); font-weight: 700; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.04em; padding: 0 3px; }
.wk-msg-body {
  padding: 7px 10px; border-radius: 9px;
  font-size: var(--font-size-sm); line-height: 1.6; white-space: pre-wrap; word-break: break-word;
}
.wk-msg.user .wk-msg-body { background: var(--color-primary); color: #fff; border-bottom-right-radius: var(--radius-xs); }
.wk-msg.assistant .wk-msg-body { background: var(--color-bg); border: 1px solid var(--color-border-subtle); border-bottom-left-radius: var(--radius-xs); color: var(--color-text); }
.wk-cursor {
  display: inline-block; width: 2px; height: 1em; background: currentColor;
  margin-left: 2px; vertical-align: middle;
  animation: blink 0.9s step-end infinite;
}
@keyframes blink { 0%, 100% { opacity:1 } 50% { opacity:0 } }
.wk-test-input-bar {
  display: flex; align-items: flex-end; gap: var(--space-3);
  padding: 11px 22px; border-top: 1px solid var(--color-border-subtle);
  background: var(--color-bg); flex-shrink: 0;
}
.wk-test-input {
  flex: 1; background: var(--color-surface); border: 1px solid var(--color-border);
  border-radius: var(--radius-md); padding: 7px 10px;
  color: var(--color-text); font-size: var(--font-size-sm); font-family: inherit;
  outline: none; resize: none; line-height: 1.5; max-height: 180px;
}
.wk-test-input:focus { border-color: var(--color-primary); }
.wk-test-input:disabled { opacity: 0.5; }
.wk-send-btn {
  width: 36px; height: 36px; border-radius: var(--radius-md); border: none;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; flex-shrink: 0; transition: opacity 0.1s;
}
.wk-send-btn:not(.stop) { background: var(--color-cta); color: #fff; }
.wk-send-btn:not(.stop):disabled { opacity: 0.4; cursor: default; }
.wk-send-btn.stop { background: rgba(var(--color-error-rgb), 0.12); color: var(--color-error); border: 1px solid rgba(var(--color-error-rgb), 0.25); }

/* Documents */
.wk-documents { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.wk-doc-detail-body { flex: 1; overflow-y: auto; padding: 22px 28px; display: flex; flex-direction: column; gap: 9px; }

.wk-doc-icon {
  width: 38px; height: 38px; border-radius: 9px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  background: color-mix(in srgb, var(--color-primary) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-primary) 20%, transparent);
  color: var(--color-primary);
}

.wk-doc-file-list { display: flex; flex-direction: column; gap: 3px; }
.wk-doc-file-row {
  display: flex; align-items: center; justify-content: space-between; gap: var(--space-6);
  padding: 7px 10px; border-radius: var(--radius-md);
  background: var(--color-bg); border: 1px solid var(--color-border-subtle);
  transition: border-color 0.12s;
}
.wk-doc-file-row:hover { border-color: var(--color-border); }
.wk-doc-file-info { display: flex; flex-direction: column; gap: var(--space-1); min-width: 0; flex: 1; }
.wk-doc-file-name { font-size: var(--font-size-xs); font-weight: 600; color: var(--color-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.wk-doc-file-meta { font-size: var(--font-size-2xs); color: var(--color-text-muted); }
.wk-doc-file-actions { display: flex; align-items: center; gap: var(--space-3); flex-shrink: 0; }
.wk-doc-status { display: flex; align-items: center; gap: var(--space-2); font-size: var(--font-size-2xs); font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }
.wk-doc-error { color: var(--color-error); display: flex; cursor: help; }

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
  border-radius: var(--radius-xl); width: 420px; max-width: calc(100vw - 48px);
  box-shadow: var(--shadow-large);
  animation: wk-modal-in 0.18s ease;
}
@keyframes wk-modal-in { from { opacity: 0; transform: scale(0.95) translateY(8px); } to { opacity: 1; transform: none; } }
.wk-modal-header { display: flex; align-items: center; justify-content: space-between; padding: 13px 14px 0; }
.wk-modal-title { font-size: var(--font-size-base); font-weight: 700; }
.wk-modal-body { padding: 14px; display: flex; flex-direction: column; gap: 11px; }
.wk-modal-footer { display: flex; justify-content: flex-end; gap: var(--space-3); padding: 0 14px 13px; }
.wk-field { display: flex; flex-direction: column; gap: var(--space-3); }
.wk-field-label { font-size: var(--font-size-2xs); font-weight: 600; color: var(--color-text-muted); }
.wk-input {
  padding: var(--space-3) var(--space-4); border-radius: var(--radius-sm); font-size: var(--font-size-xs);
  background: var(--color-bg); border: 1px solid var(--color-border);
  color: var(--color-text); outline: none; transition: border-color 0.12s;
}
.wk-input:focus { border-color: var(--color-primary); }
.wk-input::placeholder { color: var(--color-text-muted); }

.wk-workspace { background: var(--color-surface); }
.wk-body { min-width: 0; }

.wk-resource-tabs {
  display: grid; grid-template-columns: repeat(5, minmax(0, 1fr));
  width: min(720px, 48vw); border: 1px solid var(--color-border);
  border-radius: var(--radius-md); overflow: hidden; background: var(--color-bg);
  justify-self: center;
}
.wk-resource-tab {
  display: flex; align-items: center; justify-content: center; gap: var(--space-4);
  min-height: 36px; border: 0; border-right: 1px solid var(--color-border-subtle);
  background: transparent; color: var(--color-text-secondary);
  font-size: var(--font-size-sm); font-weight: 650; cursor: pointer; padding: 0 12px;
}
.wk-resource-tab:last-child { border-right: 0; }
.wk-resource-tab:hover { background: var(--color-hover); color: var(--color-text); }
.wk-resource-tab.active {
  color: var(--color-text); box-shadow: inset 0 -2px 0 var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 7%, transparent);
}

.wk-console-layout {
  flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr);
  padding: 14px 24px 20px; overflow: hidden;
}
.wk-agent-roster {
  min-width: 0; overflow-y: auto;
  display: grid; grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
  align-content: start; gap: 14px;
}
.wk-agent-card {
  position: relative; min-height: 148px;
  display: grid; grid-template-columns: auto minmax(0, 1fr);
  grid-template-rows: 1fr auto;
  gap: 10px 14px; padding: 14px 16px 12px;
  border: 1px solid var(--color-border); border-radius: var(--radius-md);
  background:
    radial-gradient(circle at 12% 12%, color-mix(in srgb, var(--color-primary) 7%, transparent), transparent 38%),
    var(--color-bg);
  color: var(--color-text); text-align: left; cursor: pointer;
  box-shadow: var(--shadow-medium);
  transition: border-color 0.15s, box-shadow 0.15s, transform 0.12s, background 0.15s;
}
.wk-agent-card:hover,
.wk-agent-card.featured {
  border-color: color-mix(in srgb, var(--color-primary) 70%, var(--color-border));
  background:
    radial-gradient(circle at 12% 12%, color-mix(in srgb, var(--color-primary) 12%, transparent), transparent 42%),
    color-mix(in srgb, var(--color-primary) 4%, var(--color-bg));
}
.wk-agent-card:hover {
  transform: translateY(-1px);
  box-shadow: var(--shadow-large);
}
.wk-agent-card .wk-avatar {
  align-self: start;
  border: 1px solid color-mix(in srgb, #fff 16%, transparent);
  box-shadow: inset 0 0 0 1px rgba(0,0,0,0.16), 0 12px 26px rgba(0,0,0,0.2);
  background-image:
    radial-gradient(circle at 35% 24%, rgba(255,255,255,0.34), transparent 20%),
    linear-gradient(145deg, rgba(255,255,255,0.14), rgba(0,0,0,0.18));
}
.wk-agent-card-main { min-width: 0; padding-top: 6px; padding-right: 32px; }
.wk-agent-title-row { display: flex; align-items: flex-start; justify-content: space-between; min-width: 0; }
.wk-agent-name {
  color: var(--color-text); font-size: var(--font-size-lg); line-height: 1.2; font-weight: 800;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.wk-agent-slug {
  margin-top: 2px; color: var(--color-primary); font-family: monospace;
  font-size: var(--font-size-xs); font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.wk-agent-desc {
  margin: 8px 0 0; color: var(--color-text-secondary);
  font-size: var(--font-size-sm); line-height: 1.45;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.wk-agent-card-actions {
  position: absolute; top: 16px; right: 14px;
  display: flex; align-items: center; gap: var(--space-4); color: var(--color-text-muted);
}
.wk-agent-icon-action {
  width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;
  border-radius: var(--radius-sm); transition: background 0.12s, color 0.12s;
}
.wk-agent-icon-action:hover { background: var(--color-hover); color: var(--color-primary); }
.wk-agent-meta {
  grid-column: 1 / -1;
  display: flex; align-items: center; gap: var(--space-5); min-width: 0;
}
.wk-agent-chip {
  display: inline-flex; align-items: center; justify-content: center;
  min-height: 22px; padding: 0 8px; border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
  color: var(--color-text-secondary); background: color-mix(in srgb, var(--color-surface) 76%, transparent);
  font-size: var(--font-size-xs); font-weight: 650; white-space: nowrap;
}
.wk-agent-chip:first-child {
  color: var(--color-primary);
  border-color: color-mix(in srgb, var(--color-primary) 45%, var(--color-border));
  background: color-mix(in srgb, var(--color-primary) 9%, transparent);
}
.wk-agent-health {
  margin-left: auto; display: inline-flex; align-items: center; gap: var(--space-3);
  color: var(--color-text-secondary); font-size: var(--font-size-xs); font-weight: 650; white-space: nowrap;
}
.wk-agent-health span {
  width: 7px; height: 7px; border-radius: 50%; background: var(--color-text-muted);
}
.wk-agent-health.ok { color: var(--color-success); }
.wk-agent-health.ok span { background: var(--color-success); }
.wk-agent-health.off { color: var(--color-accent); }
.wk-agent-health.off span { background: var(--color-accent); }

/* Tools & MCP tab */
.wk-tools-root { flex: 1; overflow: hidden; display: flex; flex-direction: column; }
.wk-tools-subbar {
  padding: 14px 28px; border-bottom: 1px solid var(--color-border-subtle);
  background: var(--color-bg); flex-shrink: 0;
}
.wk-tools-tabs { flex-shrink: 0; }
.wk-tools-scroll {
  flex: 1; overflow-y: auto; padding: 22px 28px 40px;
  display: flex; flex-direction: column;
}

/* MCP's card/list UI stretches full width like the rest of Workspace; the
   Internal reference below caps its own width — chip-and-text content reads
   better narrower than the console is wide. */
.wk-tools-internal { display: flex; flex-direction: column; gap: 20px; max-width: 780px; margin: 0 auto; width: 100%; }

.wk-tools-search { position: relative; }
.wk-tools-search-icon {
  position: absolute; left: 12px; top: 50%; transform: translateY(-50%);
  color: var(--color-text-muted); pointer-events: none;
}
.wk-tools-search input {
  width: 100%; box-sizing: border-box;
  background: var(--color-bg); border: 1px solid var(--color-border);
  border-radius: var(--radius-md); padding: 9px 12px 9px 34px;
  color: var(--color-text); font-size: var(--font-size-sm); outline: none;
  transition: border-color 0.12s;
}
.wk-tools-search input:focus { border-color: var(--color-primary); }
.wk-tools-search input::placeholder { color: var(--color-text-muted); }

.wk-tools-empty { padding: 48px 0; text-align: center; color: var(--color-text-muted); font-size: var(--font-size-sm); }

.wk-tools-category-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 12px;
}
.wk-tools-category-card {
  min-width: 0;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  overflow: hidden;
}
.wk-tools-category-head {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 9px;
  min-height: 44px;
  padding: 0 13px;
  border-bottom: 1px solid var(--color-border-subtle);
}
.wk-tools-category-icon {
  width: 28px; height: 28px;
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  color: var(--color-cta);
  border: 1px solid var(--color-border-subtle);
}
.wk-tools-category-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-text);
  font-size: var(--font-size-xs);
  font-weight: 700;
}
.wk-tools-group-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 22px;
  padding: 0 7px;
  border-radius: var(--radius-full);
  background: var(--color-surface);
  color: var(--color-text-muted);
  font-size: var(--font-size-2xs);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.wk-tools-tool-list {
  display: flex;
  flex-direction: column;
  padding: 8px;
  gap: 6px;
}
.wk-tools-tool-pill {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 0.82fr) minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  padding: 7px 9px;
  border-radius: var(--radius-sm);
  color: var(--color-text-secondary);
  background: var(--color-surface);
  border: 1px solid transparent;
}
.wk-tools-tool-pill:hover {
  border-color: var(--color-border);
  color: var(--color-text);
}
.wk-tools-tool-pill span,
.wk-tools-tool-pill code {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.wk-tools-tool-pill span {
  font-size: var(--font-size-xs);
  font-weight: 700;
}
.wk-tools-tool-pill code {
  color: var(--color-text-muted);
  font-family: var(--font-mono);
  font-size: var(--font-size-2xs);
  text-align: right;
}

/* MCP (moved from settings/CapabilitiesViews.tsx) */
.caps-mcp-header {
  display: flex; align-items: flex-start; justify-content: space-between;
  gap: 12px; flex-wrap: wrap;
}
.caps-mcp-actions-bar {
  display: flex; gap: 6px; align-items: center;
  flex-wrap: wrap; justify-content: flex-end;
}
.mcp-modal-shell { max-width: 560px; }
.caps-add-mcp-btn {
  background: var(--color-surface); border: 1px solid var(--color-border);
  color: var(--color-text); padding: 4px 8px; border-radius: 12px;
  font-size: 10px; font-weight: 600;
  display: flex; align-items: center; gap: 5px; cursor: pointer;
}
.caps-add-mcp-btn:hover { background: var(--color-hover); }
.caps-import-json-btn {
  background: var(--color-surface); border: 1px solid var(--color-border);
  color: var(--color-text); padding: 4px 8px; border-radius: 6px;
  font-size: 10px; font-weight: 600;
  display: flex; align-items: center; gap: 5px; cursor: pointer;
}
.caps-import-json-btn:hover { background: var(--color-hover); }
.caps-reload-btn {
  background: var(--color-cta); color: white;
  border: none; padding: 4px 10px; border-radius: 6px;
  font-size: 10px; font-weight: 700;
  display: flex; align-items: center; gap: 5px; cursor: pointer;
}
.caps-reload-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.caps-reload-badge {
  display: flex; align-items: center; gap: 3px;
  font-size: 10px; font-weight: 600;
  color: #f59e0b; background: rgba(245,158,11,0.1);
  padding: 2px 6px; border-radius: 5px;
  border: 1px solid rgba(245,158,11,0.25);
}
.caps-reload-result {
  display: flex; flex-direction: column; gap: 3px;
  background: var(--color-surface); border: 1px solid var(--color-border);
  border-radius: 8px; padding: 8px 11px;
}
.caps-reload-row { display: flex; align-items: center; gap: 6px; font-size: 11px; }
.caps-reload-row.ok { color: var(--color-success); }
.caps-reload-row.err { color: var(--color-error); }
.caps-reload-tools { color: var(--color-text-muted); font-size: 10px; }
.caps-reload-error { color: var(--color-error); font-size: 10px; }
.caps-mcp-list { display: flex; flex-direction: column; gap: 6px; }
.caps-mcp-card {
  background: var(--color-surface); border: 1px solid var(--color-border);
  border-radius: 9px; overflow: hidden;
  transition: opacity 0.15s;
}
.caps-mcp-card.disabled { opacity: 0.55; }
.caps-mcp-card.expanded { border-color: var(--color-primary); }
.caps-mcp-card-main {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 13px;
}
.caps-mcp-card-left { display: flex; align-items: center; gap: 11px; flex: 1; min-width: 0; }
.caps-tools-toggle {
  display: inline-flex; align-items: center; gap: 3px;
  font-size: 10px; font-weight: 600;
  background: var(--color-hover); color: var(--color-text-secondary);
  border: 1px solid var(--color-border); border-radius: 4px;
  padding: 2px 5px; cursor: pointer; transition: background 0.15s, color 0.15s, border-color 0.15s;
}
.caps-tools-toggle:hover,
.caps-tools-toggle.active {
  background: var(--color-primary-subtle); color: var(--color-cta);
  border-color: var(--color-cta);
}
.caps-no-tools-badge { font-size: 10px; color: var(--color-text-muted); opacity: 0.6; }
.caps-tools-list {
  border-top: 1px solid var(--color-border);
  padding: 7px 13px 10px;
  display: flex; flex-direction: column; gap: 5px;
  background: var(--color-bg);
}
.caps-tool-row {
  display: flex; align-items: baseline; gap: 8px;
  padding: 4px 0;
  border-bottom: 1px solid var(--color-border-subtle, rgba(255,255,255,0.05));
}
.caps-tool-row:last-child { border-bottom: none; }
.caps-tool-name {
  font-size: 10px; font-family: var(--font-mono, monospace);
  color: var(--color-cta); white-space: nowrap; flex-shrink: 0;
  background: var(--color-primary-subtle); padding: 2px 4px; border-radius: 3px;
}
.caps-tool-desc { font-size: 10px; color: var(--color-text-muted); line-height: 1.4; flex: 1; min-width: 0; }
.caps-mcp-icon { font-size: 21px; line-height: 1; flex-shrink: 0; width: 36px; text-align: center; }
.caps-mcp-info { flex: 1; min-width: 0; }
.caps-mcp-title { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; flex-wrap: wrap; }
.caps-mcp-name { font-weight: 700; font-size: 12px; color: var(--color-text); }
.caps-mcp-type-badge {
  display: flex; align-items: center; gap: 3px;
  font-size: 10px; font-weight: 600;
  background: var(--color-primary-subtle); color: var(--color-cta);
  padding: 2px 5px; border-radius: 4px;
}
.caps-mcp-source-badge {
  font-size: 10px; font-weight: 600; color: var(--color-text-muted);
  background: var(--color-hover); padding: 2px 4px; border-radius: 3px;
}
.caps-org-mcp-approve-btn {
  background: var(--color-cta); color: white;
  border: none; padding: 4px 10px; border-radius: 6px;
  font-size: 10px; font-weight: 700;
  display: flex; align-items: center; gap: 5px; cursor: pointer;
}
.caps-org-mcp-approve-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.caps-org-mcp-revoke-btn {
  background: var(--color-surface); border: 1px solid var(--color-success);
  color: var(--color-success); padding: 4px 10px; border-radius: 6px;
  font-size: 10px; font-weight: 600;
  display: flex; align-items: center; gap: 5px; cursor: pointer;
}
.caps-org-mcp-revoke-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.caps-mcp-detail code {
  font-size: 10px; color: var(--color-text-muted);
  font-family: var(--font-mono, monospace);
  background: var(--color-hover); padding: 2px 4px; border-radius: 3px;
  display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  max-width: 400px;
}
.caps-mcp-actions { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
.caps-mcp-toggle { position: relative; display: inline-flex; cursor: pointer; }
.caps-mcp-toggle input { opacity: 0; width: 0; height: 0; position: absolute; }
.caps-toggle-track {
  width: 36px; height: 20px; background: var(--color-border);
  border-radius: 8px; transition: background 0.2s; display: block;
}
.caps-mcp-toggle input:checked ~ .caps-toggle-track { background: var(--color-cta); }
.caps-toggle-track::after {
  content: ''; position: absolute; top: 3px; left: 3px;
  width: 14px; height: 14px; border-radius: 50%;
  background: white; transition: transform 0.2s;
}
.caps-mcp-toggle input:checked ~ .caps-toggle-track::after { transform: translateX(16px); }
.mcp-form-row-2 { display: grid; grid-template-columns: auto 1fr; gap: 12px; align-items: end; }
.mcp-env-textarea {
  width: 100%; background: var(--color-surface);
  border: 1.5px solid var(--color-border); border-radius: 8px;
  padding: 7px 10px; color: var(--color-text); font-family: var(--font-mono, monospace);
  font-size: 11px; line-height: 1.5; resize: vertical; outline: none; box-sizing: border-box;
}
.mcp-env-textarea:focus { border-color: var(--color-primary); }
.caps-mini-btn { background: none; border: none; color: var(--color-text-muted); cursor: pointer; display: flex; padding: 3px; border-radius: 3px; }
.caps-mini-btn:hover { color: var(--color-text); background: var(--color-hover); }
.caps-mini-btn.danger:hover { color: var(--color-error); background: rgba(var(--color-error-rgb),0.08); }
.caps-loading, .caps-empty {
  font-size: 12px; color: var(--color-text-muted);
  padding: 34px 0; text-align: center;
}
.caps-error {
  font-size: 11px; color: var(--color-error);
  padding: 8px 11px; border-radius: 6px;
  background: rgba(var(--color-error-rgb, 255,77,79), 0.08);
  margin-bottom: 16px;
}

@media (max-width: 1180px) {
  .wk-topbar { grid-template-columns: 1fr auto; height: auto; min-height: 52px; padding: 8px 14px; }
  .wk-resource-tabs { grid-column: 1 / -1; grid-row: 2; width: 100%; }
  .wk-console-layout { grid-template-columns: 1fr; overflow-y: auto; }
  .wk-agent-roster { grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); }
}

@keyframes spin { to { transform: rotate(360deg); } }
.spin { animation: spin 0.8s linear infinite; display: inline-block; }
`

export { CSS as WORKSPACE_PAGE_CSS }
