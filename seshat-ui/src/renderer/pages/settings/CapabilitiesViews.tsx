import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router'
import {
  Plus, Close, Sync, Attention, Down,
  Edit, Upload, Check, Terminal, Globe, Api, CheckOne, Lock,
} from '@icon-park/react'
import { api } from '@/api/client'

// ─── Types ────────────────────────────────────────────────────────────────────

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
type ToolEntry   = { name: string; description?: string }

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

const _EMPTY_SERVER: Omit<MCPServer, 'id' | 'source' | 'created_at' | 'updated_at'> = {
  name: '', display_name: '', server_type: 'stdio',
  command: '', args: [], env: {}, url: '', headers: {},
  timeout_secs: 30, icon: '🔌', enabled: true,
}

type CapTab = 'mcp' | 'multimodal'

// ─── Top-level view ───────────────────────────────────────────────────────────

export function CapabilitiesView() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<CapTab>('mcp')

  return (
    <div className="sv-view">
      <header className="sv-view-header" style={{ marginBottom: 28 }}>
        <div className="sv-header-info">
          <h1>Capabilities</h1>
          <p>MCP servers and multimodal extensions for your agents</p>
        </div>
        <button className="caps-add-mcp-btn" onClick={() => navigate('/skills-creator')}>
          Manage skills
        </button>
      </header>

      <div className="caps-tabs">
        {(['mcp', 'multimodal'] as CapTab[]).map(t => (
          <button
            key={t}
            className={`caps-tab-btn ${tab === t ? 'active' : ''}`}
            onClick={() => setTab(t)}
          >
            {t === 'mcp' ? 'MCP' : 'Multimodal'}
          </button>
        ))}
      </div>

      <div className="caps-tab-content">
        {tab === 'mcp'        && <McpPanel />}
        {tab === 'multimodal' && <MultimodalPanel />}
      </div>
    </div>
  )
}

// ─── MCP panel ────────────────────────────────────────────────────────────────

function McpPanel() {
  const [servers, setServers] = useState<MCPServer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pendingReload, setPendingReload] = useState(false)
  const [reloading, setReloading] = useState(false)
  const [reloadStatuses, setReloadStatuses] = useState<ReloadStatus[] | null>(null)
  const [toolsByServer, setToolsByServer] = useState<Record<string, ToolEntry[]>>({})
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
      const data = await api.get<{ tools: Record<string, ToolEntry[]> }>('/mcp/tools')
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
              <button className="caps-icon-btn" title="Refresh list" onClick={load}>
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
  tools?: ToolEntry[]
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
          <button className="modal-close-btn" onClick={onClose}><Close size={16} /></button>
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

// ─── Multimodal panel ─────────────────────────────────────────────────────────

function MultimodalPanel() {
  return (
    <>
      <div className="sv-card" style={{ marginBottom: 24 }}>
        <div className="sv-card-head">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div className="sv-card-brand">
              <div>
                <div className="sv-brand-name">Image Generation</div>
                <div className="sv-brand-sub">Generate images directly in conversations</div>
              </div>
            </div>
            <input type="checkbox" />
          </div>
        </div>
        <div className="sv-card-body">
          <div className="sv-toggle-row">
            <div>
              <div className="sv-setting-label">Image Model</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--color-text-muted)', fontSize: 13 }}>
              No available image models, configure a provider first. <Attention size={11} />
            </div>
          </div>
        </div>
      </div>

      <SpeechToTextCard />
    </>
  )
}

type WhisperStatus = {
  supported: boolean
  running: boolean
  port?: number
  activeModelId: string
  downloadedModelIds: string[]
}
type WhisperModelInfo = { id: string; filename: string; label: string; approxSizeBytes: number; description: string }
type WhisperProgress = { phase: 'binary' | 'model'; modelId?: string; receivedBytes: number; totalBytes: number }

function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`
  return `${Math.round(bytes / 1_000_000)} MB`
}

function SpeechToTextCard() {
  const [status, setStatus] = useState<WhisperStatus | null>(null)
  const [models, setModels] = useState<WhisperModelInfo[]>([])
  const [addModelId, setAddModelId] = useState<string>('')
  const [busyModelId, setBusyModelId] = useState<string | null>(null)
  const [settingUp, setSettingUp] = useState(false)
  const [progress, setProgress] = useState<WhisperProgress | null>(null)
  const [serverBusy, setServerBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refreshStatus = useCallback(async () => {
    try {
      setStatus((await window.nexus?.whisper?.status()) ?? null)
    } catch {
      setStatus(null)
    }
  }, [])

  useEffect(() => {
    void refreshStatus()
    window.nexus?.whisper?.models().then(setModels).catch(() => {})
  }, [refreshStatus])

  useEffect(() => {
    return window.nexus?.whisper?.onProgress?.(setProgress)
  }, [])

  const downloadedModels = models.filter((m) => status?.downloadedModelIds.includes(m.id))
  const availableModels = models.filter((m) => !status?.downloadedModelIds.includes(m.id))

  useEffect(() => {
    if (!addModelId && availableModels.length > 0) setAddModelId(availableModels[0].id)
  }, [availableModels, addModelId])

  async function handleInitialSetup() {
    setError(null)
    setSettingUp(true)
    setProgress(null)
    try {
      await window.nexus?.whisper?.downloadDefaults()
      await refreshStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set up local transcription.')
    } finally {
      setSettingUp(false)
      setProgress(null)
    }
  }

  async function handleAddModel() {
    if (!addModelId) return
    setError(null)
    setBusyModelId(addModelId)
    setProgress(null)
    try {
      await window.nexus?.whisper?.downloadModel(addModelId)
      await refreshStatus()
      setAddModelId('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to download this model.')
    } finally {
      setBusyModelId(null)
      setProgress(null)
    }
  }

  async function handleActivate(modelId: string) {
    setError(null)
    setBusyModelId(modelId)
    try {
      await window.nexus?.whisper?.activateModel(modelId)
      await refreshStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to switch models.')
    } finally {
      setBusyModelId(null)
    }
  }

  async function handleDeleteModel(modelId: string) {
    setError(null)
    setBusyModelId(modelId)
    try {
      await window.nexus?.whisper?.deleteModel(modelId)
      await refreshStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete this model.')
    } finally {
      setBusyModelId(null)
    }
  }

  async function handleEnable() {
    setError(null)
    setServerBusy(true)
    try {
      await window.nexus?.whisper?.enable()
      await refreshStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start local transcription.')
    } finally {
      setServerBusy(false)
    }
  }

  async function handleDisable() {
    setError(null)
    setServerBusy(true)
    try {
      await window.nexus?.whisper?.disable()
      await refreshStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to stop local transcription.')
    } finally {
      setServerBusy(false)
    }
  }

  const progressPercent = progress && progress.totalBytes > 0
    ? Math.round((progress.receivedBytes / progress.totalBytes) * 100)
    : null
  const hasModels = (status?.downloadedModelIds.length ?? 0) > 0
  const busy = settingUp || busyModelId !== null

  return (
    <div className="sv-card">
      <div className="sv-card-head">
        <div className="sv-card-brand">
          <div>
            <div className="sv-brand-name">Speech to Text</div>
            <div className="sv-brand-sub">Voice input transcription for the mic button in chat</div>
          </div>
        </div>
      </div>
      <div className="sv-card-body">
        <div className="sv-toggle-row">
          <div>
            <div className="sv-setting-label">Local (whisper.cpp)</div>
            <div className="sv-setting-desc">
              {status?.supported === false
                ? "Not available on macOS yet: whisper.cpp doesn't publish a prebuilt server binary for it."
                : 'Runs on this machine, no API key needed. Falls back to your configured OpenAI provider when off.'}
            </div>
          </div>
          {status && status.supported !== false && hasModels && (
            status.running ? (
              <button className="sv-danger-btn" onClick={() => void handleDisable()} disabled={serverBusy}>
                {serverBusy ? 'Stopping…' : 'Disable'}
              </button>
            ) : (
              <button className="modal-btn-submit" onClick={() => void handleEnable()} disabled={serverBusy || busy}>
                {serverBusy ? 'Starting…' : 'Enable'}
              </button>
            )
          )}
        </div>

        {status?.supported !== false && !hasModels && (
          <button
            className="modal-btn-submit"
            style={{ marginTop: 12 }}
            onClick={() => void handleInitialSetup()}
            disabled={settingUp}
          >
            {settingUp ? 'Downloading…' : 'Download & Enable (Tiny + Small)'}
          </button>
        )}

        {status?.supported !== false && hasModels && (
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)' }}>Downloaded models</label>
            {downloadedModels.map((m) => {
              const isActive = status?.activeModelId === m.id
              const isBusy = busyModelId === m.id
              return (
                <div key={m.id} className="sv-toggle-row" style={{ padding: '8px 0' }}>
                  <div>
                    <div className="sv-setting-label">
                      {m.label} <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>({formatBytes(m.approxSizeBytes)})</span>
                      {isActive && <span style={{ marginLeft: 8, color: 'var(--color-success)', fontSize: 12 }}><CheckOne size={10} /> Active</span>}
                    </div>
                    <div className="sv-setting-desc">{m.description}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {!isActive && (
                      <button className="caps-mini-btn" onClick={() => void handleActivate(m.id)} disabled={isBusy}>
                        {isBusy ? 'Switching…' : 'Use this model'}
                      </button>
                    )}
                    {!isActive && (
                      <button className="caps-mini-btn danger" title="Delete" onClick={() => void handleDeleteModel(m.id)} disabled={isBusy}>
                        <Close size={11} />
                      </button>
                    )}
                  </div>
                </div>
              )
            })}

            {availableModels.length > 0 && (
              <div className="sv-field" style={{ marginTop: 8 }}>
                <label>Add another model</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div className="sv-select-static" style={{ flex: 1 }}>
                    <select
                      value={addModelId}
                      onChange={(e) => setAddModelId(e.target.value)}
                      disabled={busy}
                      style={{ width: '100%', background: 'transparent', border: 'none', color: 'inherit', font: 'inherit' }}
                    >
                      {availableModels.map((m) => (
                        <option key={m.id} value={m.id}>{m.label} ({formatBytes(m.approxSizeBytes)})</option>
                      ))}
                    </select>
                  </div>
                  <button className="caps-mini-btn" onClick={() => void handleAddModel()} disabled={busy || !addModelId}>
                    {busyModelId === addModelId ? 'Downloading…' : 'Download'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {(settingUp || busyModelId) && (
          <div className="sv-setting-desc" style={{ marginTop: 8 }}>
            {progress
              ? `${progress.phase === 'binary' ? 'Downloading whisper.cpp' : `Downloading ${models.find((m) => m.id === progress.modelId)?.label ?? 'model'}`}${progressPercent !== null ? `: ${progressPercent}%` : '…'}`
              : 'Working…'}
          </div>
        )}
        {status?.running && !settingUp && !busyModelId && (
          <div className="sv-setting-desc" style={{ marginTop: 8, color: 'var(--color-success)' }}>
            <CheckOne size={11} /> Running locally on port {status.port}.
          </div>
        )}
        {error && (
          <div className="sv-setting-desc" style={{ marginTop: 8, color: 'var(--color-error)' }}>
            {error}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── CSS ──────────────────────────────────────────────────────────────────────

export const CAPABILITIES_CSS = `
/* ── Tab switcher ── */
.caps-tabs {
  display: flex;
  gap: 2px;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 3px;
  width: fit-content;
  margin-bottom: 28px;
}

.caps-tab-btn {
  background: transparent;
  border: none;
  padding: 5px 13px;
  border-radius: 5px;
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all 0.15s;
  text-transform: capitalize;
}

.caps-tab-btn:hover {
  color: var(--color-text);
  background: var(--color-hover);
}

.caps-tab-btn.active {
  background: var(--color-surface-elevated);
  color: var(--color-text);
  box-shadow: 0 1px 3px rgba(0,0,0,0.12);
}

.caps-tab-content { display: flex; flex-direction: column; }

/* ── MCP modal ── */
.mcp-modal-shell { max-width: 560px; }

/* ── MCP header + action bar ── */
.caps-mcp-header {
  display: flex; align-items: flex-start; justify-content: space-between;
  gap: 12px; flex-wrap: wrap;
}
.caps-mcp-actions-bar {
  display: flex; gap: 6px; align-items: center;
  flex-wrap: wrap; justify-content: flex-end;
}

/* ── MCP ── */
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
.caps-reload-row {
  display: flex; align-items: center; gap: 6px;
  font-size: 11px;
}
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

.caps-no-tools-badge {
  font-size: 10px; color: var(--color-text-muted); opacity: 0.6;
}

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
.caps-tool-desc {
  font-size: 10px; color: var(--color-text-muted);
  line-height: 1.4; flex: 1; min-width: 0;
}

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

/* toggle switch */
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

.caps-mini-btn.danger:hover { color: var(--color-error); background: rgba(var(--color-error-rgb),0.08); }

.caps-mcp-item {
  background: var(--color-surface); border-radius: 9px;
  padding: 8px 11px; display: flex; align-items: center; justify-content: space-between;
}

.caps-item-left { display: flex; align-items: center; gap: 8px; color: var(--color-text-secondary); }
.caps-mcp-name { font-weight: 600; font-size: 12px; color: var(--color-text); }

.caps-mcp-meta {
  font-size: 10px; color: var(--color-text-muted);
  background: var(--color-surface); border: 1px solid var(--color-border);
  padding: 2px 4px; border-radius: 3px;
}

.caps-mcp-tools {
  font-size: 10px; color: var(--color-text-muted); font-weight: 500;
}

.caps-mcp-error {
  display: flex; align-items: center; gap: 3px;
  font-size: 10px; color: var(--color-error);
}

.caps-mcp-dot {
  width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
}
.caps-mcp-dot.connected { background: #00B42A; }
.caps-mcp-dot.failed    { background: var(--color-error); }
.caps-mcp-dot.pending   { background: var(--color-text-muted); }

.caps-mini-btn { background: none; border: none; color: var(--color-text-muted); cursor: pointer; display: flex; padding: 3px; border-radius: 3px; }
.caps-mini-btn:hover { color: var(--color-text); background: var(--color-hover); }

/* ── States ── */
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
`
