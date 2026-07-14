import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Book, Plus, Delete, Upload, Sync, CheckOne, CloseOne, FolderClose,
  Setting, PreviewOpen, PreviewClose, LinkCloud,
} from '@icon-park/react'
import { api } from '@/api/client'
import type { Corpus, CorpusFile, IngestionJob, FileItem, EmbedderConfig, DoclingConfig } from '@/api/types'

// ─── helpers ──────────────────────────────────────────────────────────────────

function fmtDate(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  })
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === 'ingested' || status === 'completed'
      ? 'kv-badge-green'
      : status === 'failed'
      ? 'kv-badge-red'
      : 'kv-badge-grey'
  return <span className={`kv-badge ${cls}`}>{status}</span>
}

// ─── main view ────────────────────────────────────────────────────────────────

export function KnowledgeView() {
  const [corpora, setCorpora] = useState<Corpus[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showNewCorpus, setShowNewCorpus] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [embedderConfig, setEmbedderConfig] = useState<EmbedderConfig | null>(null)
  const [doclingConfig, setDoclingConfig] = useState<DoclingConfig | null>(null)

  const loadCorpora = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [corporaData, embData, doclingData] = await Promise.all([
        api.get<{ corpora: Corpus[]; count: number }>('/corpora'),
        api.get<EmbedderConfig>('/settings/embedder').catch(() => null),
        api.get<DoclingConfig>('/settings/docling').catch(() => null),
      ])
      setCorpora(corporaData?.corpora ?? [])
      if (embData) setEmbedderConfig(embData)
      if (doclingData) setDoclingConfig(doclingData)
    } catch (e: unknown) {
      const err = e as { message?: string }
      setError(err?.message ?? 'Failed to load corpora')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadCorpora() }, [loadCorpora])

  async function handleDelete(id: string) {
    try {
      await api.delete(`/corpora/${id}`)
      setCorpora((prev) => prev.filter((c) => c.id !== id))
      if (expandedId === id) setExpandedId(null)
    } catch (e: unknown) {
      const err = e as { message?: string }
      setError(err?.message ?? 'Failed to delete corpus')
    }
  }

  return (
    <div className="sv-view">
      <style>{KNOWLEDGE_CSS}</style>

      <header className="sv-view-header">
        <div className="sv-header-info">
          <h1>Knowledge Base</h1>
          <p>Manage document corpora for Retrieval-Augmented Generation (RAG).</p>
        </div>
        <button className="kv-add-btn" onClick={() => setShowNewCorpus(true)}>
          <Plus size={16} />
          <span>New Corpus</span>
        </button>
      </header>

      <EmbedderConfigCard
        config={embedderConfig}
        onSaved={setEmbedderConfig}
      />

      <DoclingConfigCard
        config={doclingConfig}
        onSaved={setDoclingConfig}
      />

      {error && (
        <div className="kv-error-banner">{error}</div>
      )}

      {loading ? (
        <div className="kv-loading">Loading corpora…</div>
      ) : corpora.length === 0 ? (
        <div className="kv-empty">
          <FolderClose size={40} />
          <p>No corpora yet. Create one to start ingesting documents.</p>
        </div>
      ) : (
        <div className="kv-corpus-list">
          {corpora.map((corpus) => (
            <CorpusCard
              key={corpus.id}
              corpus={corpus}
              expanded={expandedId === corpus.id}
              onToggle={() => setExpandedId(expandedId === corpus.id ? null : corpus.id)}
              onDelete={() => handleDelete(corpus.id)}
              onChunkCountUpdate={(count) =>
                setCorpora((prev) =>
                  prev.map((c) => (c.id === corpus.id ? { ...c, chunk_count: count } : c))
                )
              }
            />
          ))}
        </div>
      )}

      {showNewCorpus && (
        <NewCorpusModal
          onClose={() => setShowNewCorpus(false)}
          onCreated={(c) => {
            setCorpora((prev) => [c, ...prev])
            setShowNewCorpus(false)
          }}
        />
      )}
    </div>
  )
}

// ─── Embedder config card ─────────────────────────────────────────────────────

const PROVIDER_OPTIONS = [
  { value: 'openai', label: 'OpenAI-compatible' },
  { value: 'ollama', label: 'Ollama (local)' },
]

const DEFAULT_BASE_URLS: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  ollama: 'http://localhost:11434',
}

const SUGGESTED_MODELS: Record<string, string[]> = {
  openai: ['text-embedding-3-small', 'text-embedding-3-large', 'text-embedding-ada-002'],
  ollama: [],
}

function EmbedderConfigCard({
  config,
  onSaved,
}: {
  config: EmbedderConfig | null
  onSaved: (cfg: EmbedderConfig) => void
}) {
  const [form, setForm] = useState({
    provider: config?.provider ?? 'openai',
    base_url: config?.base_url ?? '',
    api_key: '',
    model: config?.model ?? '',
    enabled: config?.enabled ?? true,
  })
  const [showKey, setShowKey] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testState, setTestState] = useState<'idle' | 'running' | 'ok' | 'error'>('idle')
  const [testError, setTestError] = useState<string | null>(null)
  const [testLatency, setTestLatency] = useState<number | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [detectedEmbedModels, setDetectedEmbedModels] = useState<string[]>([])
  const [detecting, setDetecting] = useState(false)

  // Sync when config loads
  useEffect(() => {
    if (config) {
      setForm(f => ({
        ...f,
        provider: config.provider || 'openai',
        base_url: config.base_url || '',
        model: config.model || '',
        enabled: config.enabled,
      }))
    }
  }, [config])

  // Auto-detect Ollama models when provider=ollama and base_url is available
  useEffect(() => {
    if (form.provider === 'ollama' && form.base_url && detectedEmbedModels.length === 0 && !detecting) {
      handleDetectModels()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.provider, form.base_url])

  function update<K extends keyof typeof form>(key: K, value: typeof form[K]) {
    if (key === 'provider') {
      const prov = value as string
      const defaultModel = prov !== 'ollama' ? (SUGGESTED_MODELS[prov]?.[0] ?? '') : ''
      setForm(f => ({
        ...f,
        provider: prov,
        base_url: DEFAULT_BASE_URLS[prov] ?? f.base_url,
        model: defaultModel,
      }))
      setDetectedEmbedModels([])
      setDirty(true)
      return
    }
    setForm(f => ({ ...f, [key]: value }))
    setDirty(true)
  }

  async function handleSave() {
    setSaving(true)
    setSaveError(null)
    try {
      const body: Record<string, unknown> = {
        provider: form.provider,
        base_url: form.base_url,
        model: form.model,
        enabled: form.enabled,
      }
      if (form.api_key !== '') body.api_key = form.api_key
      const saved = await api.put<EmbedderConfig>('/settings/embedder', body)
      onSaved(saved)
      setDirty(false)
      setForm(f => ({ ...f, api_key: '' }))
    } catch (e: unknown) {
      const err = e as { message?: string }
      setSaveError(err?.message ?? 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleDetectModels() {
    setDetecting(true)
    try {
      const result = await api.post<{ embedding_models: string[]; llm_models: string[]; error?: string }>(
        '/settings/embedder/detect-models',
        { provider: form.provider, base_url: form.base_url }
      )
      if (result.error) {
        setSaveError(result.error)
      } else {
        const models = result.embedding_models ?? []
        setDetectedEmbedModels(models)
        if (models.length > 0) {
          setForm(f => ({ ...f, model: f.model || models[0] }))
          setDirty(true)
        }
      }
    } catch (e: unknown) {
      setSaveError((e as { message?: string })?.message ?? 'Detection failed')
    } finally {
      setDetecting(false)
    }
  }

  async function handleTest() {
    setTestState('running')
    setTestError(null)
    setTestLatency(null)
    try {
      const body: Record<string, unknown> = {
        provider: form.provider,
        base_url: form.base_url,
        model: form.model,
      }
      if (form.api_key !== '') body.api_key = form.api_key
      const result = await api.post<{ ok: boolean; latency_ms: number; error: string | null }>(
        '/settings/embedder/test', body
      )
      if (result.ok) {
        setTestState('ok')
        setTestLatency(result.latency_ms)
      } else {
        setTestState('error')
        setTestError(result.error ?? 'Test failed')
      }
    } catch (e: unknown) {
      const err = e as { message?: string }
      setTestState('error')
      setTestError(err?.message ?? 'Request failed')
    }
  }

  const isConfigured = config?.is_configured ?? false
  const suggestions = detectedEmbedModels.length > 0 ? detectedEmbedModels : (SUGGESTED_MODELS[form.provider] ?? [])
  const isOllama = form.provider === 'ollama'

  return (
    <div className="kv-emb-card">
      <div className="kv-emb-header">
        <div className="kv-emb-title-row">
          <div className="kv-emb-icon">
            <LinkCloud size={18} />
          </div>
          <div>
            <div className="kv-emb-title">Embedding Model</div>
            <div className="kv-emb-subtitle">Used for document ingestion and semantic search</div>
          </div>
        </div>
        <div className="kv-emb-status-row">
          {isConfigured ? (
            <span className="kv-emb-badge kv-emb-badge-ok">
              <CheckOne size={12} /> Configured
            </span>
          ) : (
            <span className="kv-emb-badge kv-emb-badge-warn">
              Not configured
            </span>
          )}
          <label className="kv-emb-toggle">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={e => update('enabled', e.target.checked)}
            />
            <span className="kv-emb-toggle-label">Enabled</span>
          </label>
        </div>
      </div>

      <div className="kv-emb-body">
        <div className="kv-emb-row">
          <div className="kv-emb-field kv-emb-field-sm">
            <label>Provider</label>
            <select
              value={form.provider}
              onChange={e => update('provider', e.target.value)}
            >
              {PROVIDER_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="kv-emb-field kv-emb-field-lg">
            <label>Base URL</label>
            <input
              type="text"
              value={form.base_url}
              onChange={e => update('base_url', e.target.value)}
              placeholder={DEFAULT_BASE_URLS[form.provider] ?? 'https://…'}
            />
          </div>
        </div>

        <div className="kv-emb-row">
          <div className="kv-emb-field kv-emb-field-lg">
            <label>
              API Key
              {config?.has_api_key && form.api_key === '' && (
                <span className="kv-emb-key-hint"> (leave blank to keep current)</span>
              )}
            </label>
            <div className="kv-emb-key-wrap">
              <input
                type={showKey ? 'text' : 'password'}
                value={form.api_key}
                onChange={e => update('api_key', e.target.value)}
                placeholder={config?.has_api_key ? '••••••••••••' : 'sk-…'}
                autoComplete="new-password"
              />
              <button
                className="kv-emb-eye"
                type="button"
                onClick={() => setShowKey(v => !v)}
                tabIndex={-1}
              >
                {showKey ? <PreviewClose size={15} /> : <PreviewOpen size={15} />}
              </button>
            </div>
          </div>
          <div className="kv-emb-field kv-emb-field-md">
            <label>
              Embedding Model
              {detectedEmbedModels.length > 0 && (
                <span className="kv-emb-key-hint"> ({detectedEmbedModels.length} detected)</span>
              )}
            </label>
            <div className="kv-emb-model-row">
              <input
                type="text"
                list="emb-model-list"
                value={form.model}
                onChange={e => update('model', e.target.value)}
                placeholder="e.g. nomic-embed-text"
              />
              {isOllama && (
                <button
                  className="kv-emb-detect-btn"
                  type="button"
                  onClick={handleDetectModels}
                  disabled={detecting || !form.base_url}
                  title="Auto-detect embedding models from Ollama"
                >
                  {detecting ? <Sync size={13} className="kv-spin" /> : <Sync size={13} />}
                </button>
              )}
            </div>
            <datalist id="emb-model-list">
              {suggestions.map(m => <option key={m} value={m} />)}
            </datalist>
            {isOllama && detecting && (
              <span className="kv-emb-key-hint">Detecting models…</span>
            )}
            {isOllama && !detecting && detectedEmbedModels.length === 0 && form.base_url && (
              <span className="kv-emb-key-hint">No embedding models detected — make sure Ollama is running and models are pulled.</span>
            )}
          </div>
        </div>

        {(saveError || testError) && (
          <div className="kv-emb-error">{saveError ?? testError}</div>
        )}

        {testState === 'ok' && testLatency !== null && (
          <div className="kv-emb-ok">
            <CheckOne size={14} /> Connected — {testLatency}ms
          </div>
        )}
      </div>

      <div className="kv-emb-footer">
        <button
          className={`kv-emb-test-btn ${testState === 'running' ? 'kv-emb-btn-loading' : testState === 'ok' ? 'kv-emb-btn-ok' : testState === 'error' ? 'kv-emb-btn-error' : ''}`}
          onClick={handleTest}
          disabled={testState === 'running' || !form.base_url || !form.model}
          type="button"
        >
          {testState === 'running' ? (
            <><Sync size={14} className="kv-spin" /> Testing…</>
          ) : testState === 'ok' ? (
            <><CheckOne size={14} /> OK</>
          ) : testState === 'error' ? (
            <><CloseOne size={14} /> Failed</>
          ) : (
            <><Setting size={14} /> Test Connection</>
          )}
        </button>
        {dirty && (
          <button
            className="kv-emb-save-btn"
            onClick={handleSave}
            disabled={saving}
            type="button"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Docling config card ───────────────────────────────────────────────────────

function DoclingConfigCard({
  config,
  onSaved,
}: {
  config: DoclingConfig | null
  onSaved: (cfg: DoclingConfig) => void
}) {
  const [form, setForm] = useState({
    base_url: config?.base_url ?? '',
    enabled: config?.enabled ?? true,
  })
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testState, setTestState] = useState<'idle' | 'running' | 'ok' | 'error'>('idle')
  const [testError, setTestError] = useState<string | null>(null)
  const [testLatency, setTestLatency] = useState<number | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Sync when config loads
  useEffect(() => {
    if (config) {
      setForm({ base_url: config.base_url || '', enabled: config.enabled })
    }
  }, [config])

  function update<K extends keyof typeof form>(key: K, value: typeof form[K]) {
    setForm(f => ({ ...f, [key]: value }))
    setDirty(true)
  }

  async function handleSave() {
    setSaving(true)
    setSaveError(null)
    try {
      const saved = await api.put<DoclingConfig>('/settings/docling', form)
      onSaved(saved)
      setDirty(false)
    } catch (e: unknown) {
      const err = e as { message?: string }
      setSaveError(err?.message ?? 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleTest() {
    setTestState('running')
    setTestError(null)
    setTestLatency(null)
    try {
      const result = await api.post<{ ok: boolean; latency_ms: number; error: string | null }>(
        '/settings/docling/test',
        { base_url: form.base_url }
      )
      if (result.ok) {
        setTestState('ok')
        setTestLatency(result.latency_ms)
      } else {
        setTestState('error')
        setTestError(result.error ?? 'Test failed')
      }
    } catch (e: unknown) {
      const err = e as { message?: string }
      setTestState('error')
      setTestError(err?.message ?? 'Request failed')
    }
  }

  return (
    <div className="kv-emb-card">
      <div className="kv-emb-header">
        <div className="kv-emb-title-row">
          <div className="kv-emb-icon">
            <LinkCloud size={18} />
          </div>
          <div>
            <div className="kv-emb-title">Document Conversion (Docling)</div>
            <div className="kv-emb-subtitle">Converts PDF/DOCX/PPTX/XLSX/audio/images to markdown during upload and ingestion — self-hosted, on your network, or your organization's own</div>
          </div>
        </div>
        <div className="kv-emb-status-row">
          <label className="kv-emb-toggle">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={e => update('enabled', e.target.checked)}
            />
            <span className="kv-emb-toggle-label">Enabled</span>
          </label>
        </div>
      </div>

      <div className="kv-emb-body">
        <div className="kv-emb-row">
          <div className="kv-emb-field kv-emb-field-lg">
            <label>Server URL</label>
            <input
              type="text"
              value={form.base_url}
              onChange={e => update('base_url', e.target.value)}
              placeholder="http://localhost:5001 (leave blank to use the auto-detected local instance)"
            />
          </div>
        </div>

        {(saveError || testError) && (
          <div className="kv-emb-error">{saveError ?? testError}</div>
        )}

        {testState === 'ok' && testLatency !== null && (
          <div className="kv-emb-ok">
            <CheckOne size={14} /> Reachable — {testLatency}ms
          </div>
        )}
      </div>

      <div className="kv-emb-footer">
        <button
          className={`kv-emb-test-btn ${testState === 'running' ? 'kv-emb-btn-loading' : testState === 'ok' ? 'kv-emb-btn-ok' : testState === 'error' ? 'kv-emb-btn-error' : ''}`}
          onClick={handleTest}
          disabled={testState === 'running' || !form.base_url}
          type="button"
        >
          {testState === 'running' ? (
            <><Sync size={14} className="kv-spin" /> Testing…</>
          ) : testState === 'ok' ? (
            <><CheckOne size={14} /> OK</>
          ) : testState === 'error' ? (
            <><CloseOne size={14} /> Failed</>
          ) : (
            <><Setting size={14} /> Test Connection</>
          )}
        </button>
        {dirty && (
          <button
            className="kv-emb-save-btn"
            onClick={handleSave}
            disabled={saving}
            type="button"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Corpus card ──────────────────────────────────────────────────────────────

function CorpusCard({
  corpus,
  expanded,
  onToggle,
  onDelete,
  onChunkCountUpdate,
}: {
  corpus: Corpus
  expanded: boolean
  onToggle: () => void
  onDelete: () => void
  onChunkCountUpdate: (count: number) => void
}) {
  const [files, setFiles] = useState<CorpusFile[]>([])
  const [jobs, setJobs] = useState<IngestionJob[]>([])
  const [loadingFiles, setLoadingFiles] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadFiles = useCallback(async () => {
    setLoadingFiles(true)
    try {
      const data = await api.get<{ files: CorpusFile[] }>(`/corpora/${corpus.id}/files`)
      setFiles(data?.files ?? [])
    } catch { /* ignore */ }
    finally { setLoadingFiles(false) }
  }, [corpus.id])

  const loadJobs = useCallback(async () => {
    try {
      const data = await api.get<{ jobs: IngestionJob[] }>(`/corpora/${corpus.id}/ingest/jobs`)
      setJobs(data?.jobs ?? [])
      return data?.jobs ?? []
    } catch {
      return []
    }
  }, [corpus.id])

  // Start/stop polling based on job state
  const startPolling = useCallback(() => {
    if (pollRef.current) return
    pollRef.current = setInterval(async () => {
      const fresh = await loadJobs()
      const active = fresh.some((j) => j.status === 'pending' || j.status === 'running')
      if (!active) {
        clearInterval(pollRef.current!)
        pollRef.current = null
        // Refresh files to update status
        await loadFiles()
        // Update chunk count from completed jobs
        const total = fresh
          .filter((j) => j.status === 'completed')
          .reduce((sum, j) => sum + j.chunk_count, 0)
        if (total > 0) onChunkCountUpdate(total)
      }
    }, 3000)
  }, [loadJobs, loadFiles, onChunkCountUpdate])

  useEffect(() => {
    if (expanded) {
      loadFiles()
      loadJobs().then((data) => {
        const active = data.some((j) => j.status === 'pending' || j.status === 'running')
        if (active) startPolling()
      })
    } else {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }
  }, [expanded, loadFiles, loadJobs, startPolling])

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      // Upload file
      const uploaded = await api.upload<FileItem>('/files', formData)
      // Attach to corpus
      await api.post(`/corpora/${corpus.id}/files`, { file_id: uploaded.id })
      // Queue ingestion
      await api.post(`/corpora/${corpus.id}/ingest`, {})
      // Refresh
      await loadFiles()
      await loadJobs()
      startPolling()
    } catch (err: unknown) {
      const e = err as { message?: string }
      console.error('Upload failed:', e?.message)
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function handleDeleteCorpus() {
    if (deleting) return
    setDeleting(true)
    onDelete()
  }

  return (
    <div className={`kv-card ${expanded ? 'kv-card-expanded' : ''}`}>
      {/* Card header */}
      <div className="kv-card-header" onClick={onToggle}>
        <div className="kv-card-brand">
          <div className="kv-corpus-icon">
            <Book size={20} />
          </div>
          <div className="kv-corpus-meta">
            <div className="kv-corpus-name">{corpus.name}</div>
            {corpus.description && (
              <div className="kv-corpus-desc">{corpus.description}</div>
            )}
          </div>
        </div>
        <div className="kv-card-controls">
          <span className="kv-chunk-count">{corpus.chunk_count} chunks</span>
          <span className="kv-date">{fmtDate(corpus.created_at)}</span>
          <button
            className="kv-icon-btn"
            onClick={(e) => { e.stopPropagation(); handleDeleteCorpus() }}
            disabled={deleting}
            title="Delete corpus"
          >
            <Delete size={16} />
          </button>
        </div>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div className="kv-card-body">
          {/* Files section */}
          <div className="kv-section">
            <div className="kv-section-header">
              <span className="kv-section-title">FILES</span>
              <div className="kv-section-actions">
                <button
                  className="kv-ghost-btn"
                  onClick={loadFiles}
                  disabled={loadingFiles}
                  title="Refresh"
                >
                  <Sync size={14} className={loadingFiles ? 'kv-spin' : ''} />
                  Refresh
                </button>
                <button
                  className="kv-ghost-btn kv-upload-btn"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                >
                  <Upload size={14} />
                  {uploading ? 'Uploading…' : 'Upload & Attach'}
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  style={{ display: 'none' }}
                  onChange={handleUpload}
                />
              </div>
            </div>

            {loadingFiles ? (
              <div className="kv-list-empty">Loading files…</div>
            ) : files.length === 0 ? (
              <div className="kv-list-empty">No files attached. Upload a document to get started.</div>
            ) : (
              <div className="kv-file-list">
                {files.map((f) => (
                  <div key={f.file_id} className="kv-file-row">
                    <div className="kv-file-info">
                      <span className="kv-file-name">{f.filename}</span>
                      {f.chunk_count > 0 && (
                        <span className="kv-file-chunks">{f.chunk_count} chunks</span>
                      )}
                    </div>
                    <div className="kv-file-status">
                      {(f.status === 'ingested' || f.status === 'completed') && (
                        <CheckOne size={14} className="kv-status-icon-green" />
                      )}
                      {f.status === 'failed' && (
                        <CloseOne size={14} className="kv-status-icon-red" />
                      )}
                      <StatusBadge status={f.status} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Ingestion jobs section */}
          {jobs.length > 0 && (
            <div className="kv-section">
              <div className="kv-section-header">
                <span className="kv-section-title">INGEST JOBS</span>
              </div>
              <div className="kv-file-list">
                {jobs.map((job) => (
                  <div key={job.id} className="kv-file-row">
                    <div className="kv-file-info">
                      <span className="kv-file-name">{job.filename}</span>
                      <span className="kv-file-chunks">
                        attempt {job.attempt_count}/{job.max_attempts}
                      </span>
                    </div>
                    <div className="kv-file-status">
                      {(job.status === 'running' || job.status === 'pending') && (
                        <Sync size={14} className="kv-spin kv-status-icon-grey" />
                      )}
                      {(job.status === 'completed') && (
                        <CheckOne size={14} className="kv-status-icon-green" />
                      )}
                      {job.status === 'failed' && (
                        <CloseOne size={14} className="kv-status-icon-red" />
                      )}
                      <StatusBadge status={job.status} />
                    </div>
                    {job.last_error && (
                      <div className="kv-job-error">{job.last_error}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── New Corpus modal ─────────────────────────────────────────────────────────

function NewCorpusModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (c: Corpus) => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    if (!name.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      const corpus = await api.post<Corpus>('/corpora', {
        name: name.trim(),
        description: description.trim() || undefined,
      })
      onCreated(corpus)
    } catch (e: unknown) {
      const err = e as { message?: string }
      setError(err?.message ?? 'Failed to create corpus')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal-shell">
        <header className="modal-header">
          <h2>New Corpus</h2>
          <button className="modal-close-btn" onClick={onClose}>
            <CloseOne size={20} />
          </button>
        </header>
        <div className="modal-content">
          <div className="modal-field">
            <label>Name *</label>
            <input
              type="text"
              placeholder="e.g. Company Docs"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            />
          </div>
          <div className="modal-field" style={{ marginTop: 16 }}>
            <label>Description</label>
            <textarea
              rows={3}
              placeholder="Optional description…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          {error && (
            <div className="kv-modal-error">{error}</div>
          )}
        </div>
        <footer className="modal-footer">
          <button className="modal-btn-cancel" onClick={onClose}>Cancel</button>
          <button
            className="modal-btn-submit"
            disabled={!name.trim() || submitting}
            onClick={handleSubmit}
          >
            {submitting ? 'Creating…' : 'Create Corpus'}
          </button>
        </footer>
      </div>
    </div>
  )
}

// ─── CSS ──────────────────────────────────────────────────────────────────────

const KNOWLEDGE_CSS = `
.kv-add-btn {
  background: var(--color-primary);
  color: white;
  border: none;
  padding: 9px 18px;
  border-radius: 9px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 14px;
  cursor: pointer;
  flex-shrink: 0;
}
.kv-add-btn:hover { opacity: 0.9; }

.kv-error-banner {
  background: rgba(201,107,92,0.1);
  border: 1px solid rgba(201,107,92,0.3);
  color: var(--color-error);
  padding: 12px 16px;
  border-radius: 10px;
  font-size: 13px;
  margin-bottom: 20px;
}

.kv-loading {
  color: var(--color-text-muted);
  font-size: 14px;
  padding: 40px 0;
}

.kv-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 80px 20px;
  color: var(--color-text-muted);
  text-align: center;
}
.kv-empty p { margin: 0; font-size: 14px; }

.kv-corpus-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.kv-card {
  background: var(--color-bg);
  border: 1.5px solid var(--color-border);
  border-radius: 14px;
  overflow: hidden;
  transition: border-color 0.15s;
}
.kv-card-expanded {
  border-color: var(--color-primary);
  box-shadow: 0 4px 20px rgba(0,0,0,0.06);
}

.kv-card-header {
  padding: 18px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  gap: 16px;
}
.kv-card-header:hover { background: var(--color-hover); }

.kv-card-brand {
  display: flex;
  align-items: center;
  gap: 16px;
  flex: 1;
  min-width: 0;
}

.kv-corpus-icon {
  width: 40px;
  height: 40px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-primary);
  flex-shrink: 0;
}

.kv-corpus-meta { min-width: 0; }
.kv-corpus-name {
  font-weight: 700;
  font-size: 15px;
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.kv-corpus-desc {
  font-size: 12px;
  color: var(--color-text-muted);
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.kv-card-controls {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-shrink: 0;
}

.kv-chunk-count {
  font-size: 12px;
  font-weight: 700;
  color: var(--color-text-muted);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  padding: 3px 9px;
  border-radius: 7px;
}

.kv-date {
  font-size: 12px;
  color: var(--color-text-muted);
}

.kv-icon-btn {
  background: none;
  border: none;
  color: var(--color-text-muted);
  cursor: pointer;
  padding: 6px;
  display: flex;
  border-radius: 6px;
  transition: background 0.1s, color 0.1s;
}
.kv-icon-btn:hover { background: var(--color-hover); color: var(--color-error); }
.kv-icon-btn:disabled { opacity: 0.4; cursor: default; }

/* Expanded body */
.kv-card-body {
  border-top: 1px solid var(--color-border);
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.kv-section { display: flex; flex-direction: column; gap: 12px; }

.kv-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.kv-section-title {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.06em;
  color: var(--color-text-muted);
}

.kv-section-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.kv-ghost-btn {
  background: none;
  border: 1px solid var(--color-border);
  color: var(--color-text-secondary);
  font-size: 13px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  padding: 5px 12px;
  border-radius: 7px;
  transition: background 0.1s;
  font-family: inherit;
}
.kv-ghost-btn:hover { background: var(--color-hover); }
.kv-ghost-btn:disabled { opacity: 0.5; cursor: default; }

.kv-upload-btn {
  background: var(--color-primary-subtle);
  border-color: rgba(239,124,47,0.25);
  color: var(--color-primary);
}
.kv-upload-btn:hover { background: rgba(239,124,47,0.18); }

.kv-list-empty {
  font-size: 13px;
  color: var(--color-text-muted);
  padding: 16px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 10px;
}

.kv-file-list {
  border: 1px solid var(--color-border);
  border-radius: 12px;
  background: var(--color-bg);
  overflow: hidden;
}

.kv-file-row {
  padding: 11px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 1px solid var(--color-border-subtle, var(--color-border));
  flex-wrap: wrap;
}
.kv-file-row:last-child { border-bottom: none; }

.kv-file-info {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
}

.kv-file-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.kv-file-chunks {
  font-size: 11px;
  color: var(--color-text-muted);
  flex-shrink: 0;
}

.kv-file-status {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.kv-job-error {
  width: 100%;
  font-size: 11px;
  color: var(--color-error);
  padding: 4px 0 0;
}

/* Status badges */
.kv-badge {
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 6px;
}
.kv-badge-green {
  color: var(--color-success);
  background: rgba(111,175,123,0.14);
}
.kv-badge-red {
  color: var(--color-error);
  background: rgba(201,107,92,0.12);
}
.kv-badge-grey {
  color: var(--color-text-muted);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
}

.kv-status-icon-green { color: var(--color-success); }
.kv-status-icon-red   { color: var(--color-error); }
.kv-status-icon-grey  { color: var(--color-text-muted); }

.kv-spin {
  animation: kv-spin 1s linear infinite;
}
@keyframes kv-spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}

/* Modal */
.kv-modal-error {
  margin-top: 12px;
  background: rgba(201,107,92,0.1);
  border: 1px solid rgba(201,107,92,0.3);
  padding: 10px 14px;
  border-radius: 8px;
  color: var(--color-error);
  font-size: 13px;
}

/* ── Embedder config card ── */
.kv-emb-card {
  background: var(--color-bg);
  border: 1.5px solid var(--color-border);
  border-radius: 14px;
  margin-bottom: 24px;
  overflow: hidden;
}

.kv-emb-header {
  padding: 18px 24px 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  border-bottom: 1px solid var(--color-border);
}

.kv-emb-title-row {
  display: flex;
  align-items: center;
  gap: 14px;
}

.kv-emb-icon {
  width: 38px;
  height: 38px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-primary);
  flex-shrink: 0;
}

.kv-emb-title {
  font-weight: 700;
  font-size: 15px;
  color: var(--color-text);
}
.kv-emb-subtitle {
  font-size: 12px;
  color: var(--color-text-muted);
  margin-top: 2px;
}

.kv-emb-status-row {
  display: flex;
  align-items: center;
  gap: 14px;
}

.kv-emb-badge {
  font-size: 11px;
  font-weight: 700;
  padding: 3px 10px;
  border-radius: 7px;
  display: flex;
  align-items: center;
  gap: 5px;
}
.kv-emb-badge-ok {
  background: rgba(111,175,123,0.14);
  color: var(--color-success);
}
.kv-emb-badge-warn {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  color: var(--color-text-muted);
}

.kv-emb-toggle {
  display: flex;
  align-items: center;
  gap: 7px;
  cursor: pointer;
  font-size: 13px;
  color: var(--color-text-secondary);
  user-select: none;
}
.kv-emb-toggle input { cursor: pointer; }
.kv-emb-toggle-label { font-weight: 600; }

.kv-emb-body {
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.kv-emb-row {
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
}

.kv-emb-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.kv-emb-field label {
  font-size: 12px;
  font-weight: 700;
  color: var(--color-text-secondary);
  letter-spacing: 0.02em;
}
.kv-emb-key-hint {
  font-weight: 400;
  color: var(--color-text-muted);
}
.kv-emb-field input,
.kv-emb-field select {
  background: var(--color-surface);
  border: 1.5px solid var(--color-border);
  border-radius: 9px;
  padding: 9px 13px;
  font-size: 13px;
  font-family: inherit;
  color: var(--color-text);
  outline: none;
  transition: border-color 0.15s;
  width: 100%;
  box-sizing: border-box;
}
.kv-emb-field input:focus,
.kv-emb-field select:focus { border-color: var(--color-primary); }

.kv-emb-field-sm { flex: 0 0 160px; }
.kv-emb-field-md { flex: 1 1 200px; }
.kv-emb-field-lg { flex: 2 1 260px; }

.kv-emb-key-wrap {
  position: relative;
}
.kv-emb-key-wrap input { padding-right: 38px; }
.kv-emb-eye {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  color: var(--color-text-muted);
  cursor: pointer;
  padding: 2px;
  display: flex;
  align-items: center;
}
.kv-emb-eye:hover { color: var(--color-text); }

.kv-emb-error {
  background: rgba(201,107,92,0.1);
  border: 1px solid rgba(201,107,92,0.3);
  color: var(--color-error);
  padding: 9px 14px;
  border-radius: 8px;
  font-size: 13px;
}
.kv-emb-ok {
  background: rgba(111,175,123,0.1);
  border: 1px solid rgba(111,175,123,0.3);
  color: var(--color-success);
  padding: 9px 14px;
  border-radius: 8px;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.kv-emb-footer {
  padding: 14px 24px;
  border-top: 1px solid var(--color-border);
  display: flex;
  align-items: center;
  gap: 10px;
}

.kv-emb-test-btn,
.kv-emb-save-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.15s, opacity 0.15s;
  border: 1.5px solid var(--color-border);
}
.kv-emb-test-btn {
  background: var(--color-surface);
  color: var(--color-text-secondary);
}
.kv-emb-test-btn:hover:not(:disabled) { background: var(--color-hover); }
.kv-emb-test-btn:disabled { opacity: 0.5; cursor: default; }
.kv-emb-btn-loading { border-color: transparent; }
.kv-emb-btn-ok {
  background: rgba(111,175,123,0.12) !important;
  border-color: rgba(111,175,123,0.35) !important;
  color: var(--color-success) !important;
}
.kv-emb-btn-error {
  background: rgba(201,107,92,0.1) !important;
  border-color: rgba(201,107,92,0.3) !important;
  color: var(--color-error) !important;
}

.kv-emb-save-btn {
  background: var(--color-primary);
  color: white;
  border-color: transparent;
  margin-left: auto;
}
.kv-emb-save-btn:hover:not(:disabled) { opacity: 0.9; }
.kv-emb-save-btn:disabled { opacity: 0.5; cursor: default; }

.kv-emb-model-row {
  display: flex;
  gap: 6px;
  align-items: center;
}
.kv-emb-model-row input { flex: 1; }

.kv-emb-detect-btn {
  flex-shrink: 0;
  width: 34px;
  height: 34px;
  border: 1.5px solid var(--color-border);
  background: var(--color-surface);
  border-radius: 8px;
  color: var(--color-text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: border-color 0.15s, color 0.15s;
}
.kv-emb-detect-btn:hover:not(:disabled) { border-color: var(--color-primary); color: var(--color-primary); }
.kv-emb-detect-btn:disabled { opacity: 0.4; cursor: default; }
`
