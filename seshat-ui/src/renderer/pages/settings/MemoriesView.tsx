import { useState, useEffect, useCallback } from 'react'
import {
  Brain, Delete, Sync, PreviewOpen, PreviewClose, Plus, Edit,
  Server, Folder, CloudStorage, CheckOne, Caution,
} from '@icon-park/react'
import { api } from '@/api/client'
import type { UserMemory, StorageStatus, StorageConfigData } from '@/api/types'

const MEMORY_TYPES: Record<string, { label: string; color: string }> = {
  preference: { label: 'Preferences', color: '#ef7c2f' },
  instruction: { label: 'Instructions', color: '#6faabb' },
  pattern: { label: 'Patterns', color: '#a78fcc' },
  fact: { label: 'Facts', color: '#6fb77b' },
  context: { label: 'Context', color: '#c89a6a' },
}

const MEMORY_TYPE_OPTIONS = Object.entries(MEMORY_TYPES).map(([value, meta]) => ({
  value,
  label: meta.label,
}))

type MemoryFormState = {
  type: string
  key: string
  value: string
  importance: number
  source: string
}

type MemoryEditorState =
  | { mode: 'create'; initial: MemoryFormState }
  | { mode: 'edit'; memory: UserMemory; initial: MemoryFormState }

const EMPTY_MEMORY_FORM: MemoryFormState = {
  type: 'fact',
  key: '',
  value: '',
  importance: 0.5,
  source: 'manual',
}

function importanceDots(v: number) {
  const filled = Math.round(v * 5)
  return Array.from({ length: 5 }, (_, i) => (
    <span key={i} className={`mv-dot ${i < filled ? 'filled' : ''}`} />
  ))
}

export function MemoriesView() {
  const [memories, setMemories] = useState<UserMemory[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [filter, setFilter] = useState<string>('all')
  const [error, setError] = useState<string | null>(null)
  const [editor, setEditor] = useState<MemoryEditorState | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.get<{ memories: UserMemory[]; count: number }>('/memories')
      setMemories(data.memories ?? [])
    } catch (e: unknown) {
      setError((e as { message?: string })?.message ?? 'Failed to load memories')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function handleDelete(id: string) {
    if (deletingId) return
    setDeletingId(id)
    try {
      await api.delete(`/memories/${id}`)
      setMemories((prev) => prev.filter((m) => m.id !== id))
    } catch { /* silently handle */ }
    finally { setDeletingId(null) }
  }

  async function handleClearAll() {
    if (clearing || !confirm('Clear all memories? This cannot be undone.')) return
    setClearing(true)
    try {
      await api.delete('/memories')
      setMemories([])
    } catch { /* silently handle */ }
    finally { setClearing(false) }
  }

  async function handleSaveMemory(form: MemoryFormState, existing?: UserMemory) {
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      if (existing) {
        const updated = await api.put<UserMemory>(`/memories/${existing.id}`, form)
        setMemories((prev) => prev.map((memory) => (memory.id === existing.id ? updated : memory)))
      } else {
        const created = await api.post<UserMemory>('/memories', form)
        setMemories((prev) => [created, ...prev])
      }
      setEditor(null)
    } catch (e: unknown) {
      setError((e as { message?: string })?.message ?? 'Failed to save memory')
    } finally {
      setSaving(false)
    }
  }

  const knownTypes = Object.keys(MEMORY_TYPES)
  const dynamicTypes = Array.from(new Set(memories.map((m) => m.type).filter((type) => !knownTypes.includes(type))))
  const shown = filter === 'all' ? memories : memories.filter((m) => m.type === filter)

  return (
    <div className="mv-root">
      <style>{MEMORIES_CSS}</style>

      <header className="mv-header">
        <div className="mv-header-info">
          <h1>Memories</h1>
          <p>Facts the AI has learned about you across conversations.</p>
        </div>
        <div className="mv-header-actions">
          <button className="mv-primary-btn" onClick={() => setEditor({ mode: 'create', initial: EMPTY_MEMORY_FORM })}>
            <Plus size={14} /> New memory
          </button>
          <button className="mv-ghost-btn" onClick={load} disabled={loading}>
            <Sync size={14} className={loading ? 'spin' : ''} /> Refresh
          </button>
          {memories.length > 0 && (
            <button className="mv-danger-btn" onClick={handleClearAll} disabled={clearing}>
              <Delete size={14} /> {clearing ? 'Clearing…' : 'Clear all'}
            </button>
          )}
        </div>
      </header>

      <div className="mv-content">
        <div className="mv-stats-row">
          {Object.entries(MEMORY_TYPES).map(([type, meta]) => {
            const count = memories.filter((m) => m.type === type).length
            return (
              <button
                key={type}
                className={`mv-stat-chip ${filter === type ? 'active' : ''}`}
                style={{ '--chip-color': meta.color } as React.CSSProperties}
                onClick={() => setFilter(filter === type ? 'all' : type)}
              >
                <span className="mv-chip-dot" />
                <span className="mv-chip-label">{meta.label}</span>
                <span className="mv-chip-count">{count}</span>
              </button>
            )
          })}
          {dynamicTypes.map((type) => {
            const count = memories.filter((m) => m.type === type).length
            return (
              <button
                key={type}
                className={`mv-stat-chip ${filter === type ? 'active' : ''}`}
                onClick={() => setFilter(filter === type ? 'all' : type)}
              >
                <span className="mv-chip-label">{type}</span>
                <span className="mv-chip-count">{count}</span>
              </button>
            )
          })}
          {filter !== 'all' && (
            <button className="mv-clear-filter" onClick={() => setFilter('all')}>
              All ({memories.length})
            </button>
          )}
        </div>

        {error && <div className="mv-error">{error}</div>}

        {loading ? (
          <div className="mv-empty"><Sync size={20} className="spin" /> Loading…</div>
        ) : shown.length === 0 ? (
          <div className="mv-empty">
            <Brain size={32} theme="outline" />
            <p>{memories.length === 0 ? 'No memories yet — create one manually or let conversations populate them.' : 'No memories of this type.'}</p>
          </div>
        ) : (
          <div className="mv-list">
            {shown.map((memory) => (
              <MemoryRow
                key={memory.id}
                memory={memory}
                onEdit={() => setEditor({ mode: 'edit', memory, initial: memoryToForm(memory) })}
                onDelete={() => handleDelete(memory.id)}
                deleting={deletingId === memory.id}
              />
            ))}
          </div>
        )}

        <div className="mv-section-gap" />
        <StorageCard />
      </div>

      {editor && (
        <MemoryEditorModal
          state={editor}
          saving={saving}
          onClose={() => setEditor(null)}
          onSave={(form) => handleSaveMemory(form, editor.mode === 'edit' ? editor.memory : undefined)}
        />
      )}
    </div>
  )
}

function MemoryRow({ memory, onEdit, onDelete, deleting }: {
  memory: UserMemory
  onEdit: () => void
  onDelete: () => void
  deleting: boolean
}) {
  const meta = MEMORY_TYPES[memory.type] ?? { label: memory.type, color: '#888' }
  const date = new Date(memory.created_at * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })

  return (
    <div className="mv-row">
      <span className="mv-type-badge" style={{ '--badge-color': meta.color } as React.CSSProperties}>
        {meta.label}
      </span>
      <div className="mv-row-body">
        <div className="mv-row-key">{memory.key}</div>
        {memory.value && <div className="mv-row-value">{memory.value}</div>}
        {memory.source && <div className="mv-row-source">Source: {memory.source}</div>}
      </div>
      <div className="mv-row-meta">
        <span className="mv-importance">{importanceDots(memory.importance)}</span>
        <span className="mv-date">{date}</span>
      </div>
      <div className="mv-row-actions">
        <button className="mv-action-btn" onClick={onEdit} title="Edit">
          <Edit size={14} />
        </button>
        <button className="mv-action-btn danger" onClick={onDelete} disabled={deleting} title="Delete">
          <Delete size={14} />
        </button>
      </div>
    </div>
  )
}

function MemoryEditorModal({ state, saving, onClose, onSave }: {
  state: MemoryEditorState
  saving: boolean
  onClose: () => void
  onSave: (form: MemoryFormState) => void
}) {
  const [form, setForm] = useState<MemoryFormState>(state.initial)
  const [error, setError] = useState<string | null>(null)

  function update<K extends keyof MemoryFormState>(key: K, value: MemoryFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function handleSubmit() {
    if (!form.key.trim()) {
      setError('Key is required')
      return
    }
    setError(null)
    onSave({
      ...form,
      key: form.key.trim(),
      value: form.value.trim(),
      source: form.source.trim(),
    })
  }

  return (
    <div className="mv-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div className="mv-modal-shell" role="dialog" aria-modal="true" aria-label={state.mode === 'create' ? 'Create memory' : 'Edit memory'}>
        <div className="mv-modal-header">
          <div>
            <h2>{state.mode === 'create' ? 'New Memory' : 'Edit Memory'}</h2>
            <p>{state.mode === 'create' ? 'Create a curated memory for the agent.' : 'Adjust an existing memory entry.'}</p>
          </div>
          <button className="mv-modal-close" onClick={onClose}>×</button>
        </div>

        <div className="mv-modal-body">
          {error && <div className="mv-error">{error}</div>}

          <div className="mv-form-grid">
            <div className="mv-form-field">
              <label>Type</label>
              <select value={form.type} onChange={(event) => update('type', event.target.value)}>
                {MEMORY_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>

            <div className="mv-form-field">
              <label>Source</label>
              <input
                type="text"
                value={form.source}
                onChange={(event) => update('source', event.target.value)}
                placeholder="manual"
              />
            </div>
          </div>

          <div className="mv-form-field">
            <label>Key</label>
            <input
              type="text"
              value={form.key}
              onChange={(event) => update('key', event.target.value)}
              placeholder="Preferred language"
            />
          </div>

          <div className="mv-form-field">
            <label>Value</label>
            <textarea
              value={form.value}
              onChange={(event) => update('value', event.target.value)}
              placeholder="User prefers French UI copy and concise responses."
              rows={5}
            />
          </div>

          <div className="mv-form-field">
            <label>Importance</label>
            <div className="mv-importance-editor">
              <input
                type="range"
                min="0.1"
                max="1"
                step="0.1"
                value={form.importance}
                onChange={(event) => update('importance', Number(event.target.value))}
              />
              <span>{form.importance.toFixed(1)}</span>
            </div>
          </div>
        </div>

        <div className="mv-modal-footer">
          <button className="mv-ghost-btn" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="mv-primary-btn" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Saving…' : state.mode === 'create' ? 'Create Memory' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

const PROVIDER_OPTIONS = [
  { id: 'local', label: 'Local filesystem', icon: <Folder size={16} /> },
  { id: 's3', label: 'S3 / MinIO', icon: <CloudStorage size={16} /> },
]

function StorageCard() {
  const [status, setStatus] = useState<StorageStatus | null>(null)
  const [form, setForm] = useState<{
    provider: string
    local_path: string
    s3_endpoint: string
    s3_bucket: string
    s3_access_key: string
    s3_secret_key: string
    s3_region: string
    s3_key_prefix: string
  }>({
    provider: 'local', local_path: '', s3_endpoint: '', s3_bucket: '',
    s3_access_key: '', s3_secret_key: '', s3_region: 'us-east-1', s3_key_prefix: '',
  })
  const [showSecret, setShowSecret] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveOk, setSaveOk] = useState(false)

  useEffect(() => {
    api.get<StorageStatus>('/settings/storage')
      .then((data) => {
        setStatus(data)
        syncForm(data.config)
      })
      .catch(() => {})
  }, [])

  function syncForm(cfg: StorageConfigData) {
    setForm({
      provider: cfg.provider ?? 'local',
      local_path: cfg.local_path ?? '',
      s3_endpoint: cfg.s3_endpoint ?? '',
      s3_bucket: cfg.s3_bucket ?? '',
      s3_access_key: '',
      s3_secret_key: '',
      s3_region: cfg.s3_region || 'us-east-1',
      s3_key_prefix: cfg.s3_key_prefix ?? '',
    })
  }

  function update(key: string, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
    setDirty(true)
    setSaveOk(false)
  }

  async function handleSave() {
    setSaving(true)
    setSaveError(null)
    setSaveOk(false)
    try {
      const body: Record<string, unknown> = {
        provider: form.provider,
        local_path: form.local_path,
        s3_endpoint: form.s3_endpoint,
        s3_bucket: form.s3_bucket,
        s3_region: form.s3_region,
        s3_key_prefix: form.s3_key_prefix,
      }
      if (form.s3_access_key) body.s3_access_key = form.s3_access_key
      if (form.s3_secret_key) body.s3_secret_key = form.s3_secret_key
      const saved = await api.put<StorageStatus>('/settings/storage', body)
      setStatus(saved)
      syncForm(saved.config)
      setDirty(false)
      setSaveOk(true)
    } catch (e: unknown) {
      setSaveError((e as { message?: string })?.message ?? 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const isS3 = form.provider === 's3' || form.provider === 'minio'
  const restartRequired = status?.restart_required ?? false

  return (
    <div className="mv-storage-card">
      <div className="mv-storage-header">
        <div className="mv-storage-title">
          <div className="mv-storage-icon"><Server size={18} /></div>
          <div>
            <div className="mv-storage-name">File Storage</div>
            <div className="mv-storage-sub">Where uploaded documents and artifacts are stored</div>
          </div>
        </div>
        {status && (
          <div className={`mv-active-badge ${restartRequired ? 'pending' : 'running'}`}>
            {restartRequired ? <Caution size={12} /> : <CheckOne size={12} />}
            {restartRequired
              ? `Running: ${status.active_provider} — restart to apply changes`
              : `Running: ${status.active_provider}`}
          </div>
        )}
      </div>

      <div className="mv-storage-body">
        <div className="mv-sf-row">
          <label>Storage Provider</label>
          <div className="mv-provider-pills">
            {PROVIDER_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                className={`mv-pill ${form.provider === opt.id ? 'active' : ''}`}
                onClick={() => update('provider', opt.id)}
              >
                {opt.icon} {opt.label}
              </button>
            ))}
          </div>
        </div>

        {!isS3 && (
          <div className="mv-sf-row">
            <label>Storage Path <span className="mv-opt">(optional — leave blank for default)</span></label>
            <input
              type="text"
              placeholder="/data/nexus/storage"
              value={form.local_path}
              onChange={(e) => update('local_path', e.target.value)}
            />
          </div>
        )}

        {isS3 && (
          <>
            <div className="mv-sf-row">
              <label>Endpoint URL</label>
              <input
                type="text"
                placeholder="http://localhost:9000"
                value={form.s3_endpoint}
                onChange={(e) => update('s3_endpoint', e.target.value)}
              />
            </div>
            <div className="mv-sf-grid">
              <div className="mv-sf-row">
                <label>Bucket</label>
                <input
                  type="text"
                  placeholder="nexus"
                  value={form.s3_bucket}
                  onChange={(e) => update('s3_bucket', e.target.value)}
                />
              </div>
              <div className="mv-sf-row">
                <label>Region</label>
                <input
                  type="text"
                  placeholder="us-east-1"
                  value={form.s3_region}
                  onChange={(e) => update('s3_region', e.target.value)}
                />
              </div>
            </div>
            <div className="mv-sf-grid">
              <div className="mv-sf-row">
                <label>Access Key {status?.config.has_s3_access_key && <span className="mv-saved-hint">saved</span>}</label>
                <input
                  type="text"
                  placeholder={status?.config.has_s3_access_key ? '••••••••' : 'Access key ID'}
                  value={form.s3_access_key}
                  onChange={(e) => update('s3_access_key', e.target.value)}
                  autoComplete="off"
                />
              </div>
              <div className="mv-sf-row">
                <label>Secret Key {status?.config.has_s3_secret_key && <span className="mv-saved-hint">saved</span>}</label>
                <div className="mv-key-row">
                  <input
                    type={showSecret ? 'text' : 'password'}
                    placeholder={status?.config.has_s3_secret_key ? '••••••••' : 'Secret key'}
                    value={form.s3_secret_key}
                    onChange={(e) => update('s3_secret_key', e.target.value)}
                    autoComplete="new-password"
                  />
                  <button className="mv-eye-btn" onClick={() => setShowSecret((v) => !v)} tabIndex={-1}>
                    {showSecret ? <PreviewClose size={14} /> : <PreviewOpen size={14} />}
                  </button>
                </div>
              </div>
            </div>
            <div className="mv-sf-row mv-sf-row-sm">
              <label>Key Prefix <span className="mv-opt">(optional)</span></label>
              <input
                type="text"
                placeholder="nexus/"
                value={form.s3_key_prefix}
                onChange={(e) => update('s3_key_prefix', e.target.value)}
              />
            </div>
          </>
        )}

        {saveError && <div className="mv-save-error">{saveError}</div>}
        {saveOk && !restartRequired && (
          <div className="mv-save-ok"><CheckOne size={13} /> Saved — no restart needed.</div>
        )}
        {saveOk && restartRequired && (
          <div className="mv-save-warn"><Caution size={13} /> Saved — restart the server to apply.</div>
        )}

        {dirty && (
          <button className="mv-save-btn" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        )}
      </div>
    </div>
  )
}

function memoryToForm(memory: UserMemory): MemoryFormState {
  return {
    type: memory.type,
    key: memory.key,
    value: memory.value,
    importance: memory.importance,
    source: memory.source || 'manual',
  }
}

const MEMORIES_CSS = `
.mv-root { display: flex; flex-direction: column; }
.mv-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 28px; flex-wrap: wrap; gap: 12px; }
.mv-header-info h1 { font-size: 26px; font-weight: 700; margin: 0 0 6px; color: var(--color-text); }
.mv-header-info p { color: var(--color-text-muted); margin: 0; font-size: 15px; }
.mv-header-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.mv-primary-btn { background: var(--color-cta); border: none; color: white; font-size: 13px; font-weight: 600; display: flex; align-items: center; gap: 6px; cursor: pointer; padding: 8px 14px; border-radius: 8px; }
.mv-primary-btn:hover:not(:disabled) { opacity: 0.92; }
.mv-primary-btn:disabled { opacity: 0.5; cursor: default; }
.mv-ghost-btn { background: none; border: 1px solid var(--color-border); color: var(--color-text-secondary); font-size: 13px; font-weight: 600; display: flex; align-items: center; gap: 6px; cursor: pointer; padding: 7px 14px; border-radius: 8px; transition: background 0.1s; }
.mv-ghost-btn:hover { background: var(--color-hover); }
.mv-ghost-btn:disabled { opacity: 0.5; cursor: default; }
.mv-danger-btn { background: none; border: 1px solid rgba(201,107,92,0.3); color: var(--color-error); font-size: 13px; font-weight: 600; display: flex; align-items: center; gap: 6px; cursor: pointer; padding: 7px 14px; border-radius: 8px; }
.mv-danger-btn:hover { background: rgba(201,107,92,0.08); }
.mv-danger-btn:disabled { opacity: 0.5; cursor: default; }

.mv-content { display: flex; flex-direction: column; }
.mv-stats-row { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 20px; align-items: center; }
.mv-stat-chip { display: flex; align-items: center; gap: 6px; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 20px; padding: 5px 12px; cursor: pointer; font-size: 12px; font-weight: 600; color: var(--color-text-secondary); transition: all 0.1s; }
.mv-stat-chip:hover { border-color: var(--chip-color, var(--color-primary)); }
.mv-stat-chip.active { background: color-mix(in srgb, var(--chip-color, var(--color-primary)) 12%, transparent); border-color: var(--chip-color, var(--color-primary)); color: var(--chip-color, var(--color-primary)); }
.mv-chip-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--chip-color, var(--color-primary)); }
.mv-chip-count { background: var(--color-hover); padding: 1px 6px; border-radius: 10px; font-size: 11px; }
.mv-clear-filter { background: none; border: none; color: var(--color-text-muted); font-size: 12px; cursor: pointer; padding: 5px 8px; border-radius: 8px; }
.mv-clear-filter:hover { background: var(--color-hover); }

.mv-error { background: rgba(201,107,92,0.1); border: 1px solid rgba(201,107,92,0.3); padding: 10px 14px; border-radius: 8px; color: var(--color-error); font-size: 13px; margin-bottom: 16px; }
.mv-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 60px 20px; color: var(--color-text-muted); font-size: 14px; text-align: center; }
.mv-empty p { margin: 0; line-height: 1.5; }

.mv-list { display: flex; flex-direction: column; gap: 6px; margin-bottom: 8px; }
.mv-row { display: flex; align-items: flex-start; gap: 12px; background: var(--color-bg); border: 1px solid var(--color-border-subtle); border-radius: 10px; padding: 12px 14px; transition: border-color 0.1s; }
.mv-row:hover { border-color: var(--color-border); }
.mv-type-badge { flex-shrink: 0; font-size: 10px; font-weight: 800; padding: 2px 8px; border-radius: 4px; color: var(--badge-color); background: color-mix(in srgb, var(--badge-color) 12%, transparent); margin-top: 2px; letter-spacing: 0.03em; }
.mv-row-body { flex: 1; min-width: 0; }
.mv-row-key { font-size: 13px; font-weight: 600; color: var(--color-text); margin-bottom: 2px; }
.mv-row-value { font-size: 12px; color: var(--color-text-secondary); line-height: 1.4; white-space: pre-wrap; }
.mv-row-source { margin-top: 6px; font-size: 11px; color: var(--color-text-muted); }
.mv-row-meta { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; flex-shrink: 0; }
.mv-importance { display: flex; gap: 3px; }
.mv-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--color-border); }
.mv-dot.filled { background: var(--color-primary); }
.mv-date { font-size: 11px; color: var(--color-text-muted); white-space: nowrap; }
.mv-row-actions { display: flex; align-items: center; gap: 4px; opacity: 0; transition: opacity 0.1s; }
.mv-row:hover .mv-row-actions { opacity: 1; }
.mv-action-btn { background: none; border: none; color: var(--color-text-muted); cursor: pointer; padding: 4px; border-radius: 6px; }
.mv-action-btn:hover { background: var(--color-hover); color: var(--color-text); }
.mv-action-btn.danger:hover { color: var(--color-error); }
.mv-action-btn:disabled { opacity: 0.3; cursor: default; }

.mv-modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; padding: 24px; z-index: 1000; backdrop-filter: blur(3px); }
.mv-modal-shell { width: 100%; max-width: 680px; background: var(--color-bg); border: 1px solid var(--color-border); border-radius: 18px; box-shadow: 0 24px 64px rgba(0,0,0,0.28); overflow: hidden; }
.mv-modal-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 20px 24px; border-bottom: 1px solid var(--color-border-subtle); }
.mv-modal-header h2 { margin: 0 0 6px; font-size: 20px; }
.mv-modal-header p { margin: 0; font-size: 13px; color: var(--color-text-muted); }
.mv-modal-close { width: 32px; height: 32px; border-radius: 8px; border: none; background: transparent; color: var(--color-text-muted); cursor: pointer; font-size: 22px; line-height: 1; }
.mv-modal-close:hover { background: var(--color-hover); color: var(--color-text); }
.mv-modal-body { padding: 22px 24px; display: flex; flex-direction: column; gap: 16px; }
.mv-modal-footer { padding: 16px 24px 24px; display: flex; justify-content: flex-end; gap: 10px; }
.mv-form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.mv-form-field { display: flex; flex-direction: column; gap: 6px; }
.mv-form-field label { font-size: 12px; font-weight: 600; color: var(--color-text-secondary); }
.mv-form-field input, .mv-form-field select, .mv-form-field textarea { width: 100%; background: var(--color-surface); border: 1px solid var(--color-border); padding: 10px 12px; border-radius: 8px; color: var(--color-text); font-size: 13px; outline: none; font-family: inherit; }
.mv-form-field input:focus, .mv-form-field select:focus, .mv-form-field textarea:focus { border-color: var(--color-primary); }
.mv-form-field textarea { resize: vertical; min-height: 110px; }
.mv-importance-editor { display: flex; align-items: center; gap: 12px; }
.mv-importance-editor input { flex: 1; }
.mv-importance-editor span { min-width: 32px; font-size: 12px; color: var(--color-text-muted); }

.mv-section-gap { height: 32px; border-top: 1px solid var(--color-border-subtle); margin-bottom: 32px; }
.mv-storage-card { background: var(--color-bg); border: 1px solid var(--color-border); border-radius: 14px; overflow: hidden; }
.mv-storage-header { display: flex; align-items: center; justify-content: space-between; padding: 18px 22px; gap: 12px; flex-wrap: wrap; }
.mv-storage-title { display: flex; align-items: center; gap: 14px; }
.mv-storage-icon { width: 38px; height: 38px; border-radius: 10px; background: var(--color-surface); border: 1px solid var(--color-border); display: flex; align-items: center; justify-content: center; color: var(--color-text-secondary); }
.mv-storage-name { font-size: 15px; font-weight: 700; color: var(--color-text); }
.mv-storage-sub { font-size: 12px; color: var(--color-text-muted); margin-top: 2px; }
.mv-active-badge { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; padding: 5px 12px; border-radius: 8px; }
.mv-active-badge.running { background: rgba(111,183,123,0.12); color: var(--color-success); border: 1px solid rgba(111,183,123,0.25); }
.mv-active-badge.pending { background: rgba(239,124,47,0.1); color: var(--color-primary); border: 1px solid rgba(239,124,47,0.25); }
.mv-storage-body { padding: 0 22px 22px; border-top: 1px solid var(--color-border-subtle); padding-top: 20px; display: flex; flex-direction: column; gap: 16px; }
.mv-provider-pills { display: flex; gap: 8px; }
.mv-pill { display: flex; align-items: center; gap: 8px; background: var(--color-surface); border: 1.5px solid var(--color-border); color: var(--color-text-secondary); font-size: 13px; font-weight: 600; padding: 8px 16px; border-radius: 9px; cursor: pointer; transition: all 0.1s; }
.mv-pill:hover { border-color: var(--color-primary); color: var(--color-text); }
.mv-pill.active { border-color: var(--color-primary); color: var(--color-primary); background: var(--color-primary-subtle); }
.mv-sf-row { display: flex; flex-direction: column; gap: 6px; }
.mv-sf-row label { font-size: 12px; font-weight: 600; color: var(--color-text-secondary); display: flex; align-items: center; gap: 6px; }
.mv-sf-row-sm { max-width: 320px; }
.mv-opt { font-weight: 400; color: var(--color-text-muted); }
.mv-sf-row input { background: var(--color-surface); border: 1px solid var(--color-border); padding: 8px 12px; border-radius: 8px; color: var(--color-text); font-size: 13px; outline: none; font-family: inherit; width: 100%; }
.mv-sf-row input:focus { border-color: var(--color-primary); }
.mv-sf-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.mv-key-row { display: flex; }
.mv-key-row input { border-radius: 8px 0 0 8px; }
.mv-eye-btn { background: var(--color-surface); border: 1px solid var(--color-border); border-left: none; color: var(--color-text-muted); cursor: pointer; padding: 0 10px; border-radius: 0 8px 8px 0; display: flex; align-items: center; }
.mv-saved-hint { font-size: 10px; font-weight: 700; color: var(--color-success); background: rgba(111,183,123,0.12); padding: 1px 6px; border-radius: 4px; margin-left: 4px; }
.mv-save-btn { align-self: flex-start; background: var(--color-cta); color: white; border: none; padding: 9px 20px; border-radius: 9px; font-size: 13px; font-weight: 600; cursor: pointer; }
.mv-save-btn:hover:not(:disabled) { opacity: 0.9; }
.mv-save-btn:disabled { opacity: 0.5; cursor: default; }
.mv-save-error { background: rgba(201,107,92,0.1); border: 1px solid rgba(201,107,92,0.3); padding: 8px 12px; border-radius: 7px; color: var(--color-error); font-size: 12px; }
.mv-save-ok { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--color-success); }
.mv-save-warn { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--color-primary); }

.spin { animation: spin 1s linear infinite; }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
`
