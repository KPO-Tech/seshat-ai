import { useState, useEffect, useCallback } from 'react'
import type { ReactNode } from 'react'
import {
  CheckOne,
  CloseOne,
  Connection,
  DatabaseSearch,
  DocDetail,
  LinkCloud,
  PreviewClose,
  PreviewOpen,
  Search,
  Setting,
  Sync,
} from '@icon-park/react'
import { api } from '@/api/client'
import { useCapabilityLink } from '@/components/settings/CapabilityLink'
import type { Corpus, DoclingConfig, EmbedderConfig, RerankerConfig } from '@/api/types'
import { loadSearchDefaults, saveSearchDefaults } from '@/apps/knowledge/hooks/searchDefaults'

const DEFAULT_BASE_URLS: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  mistral: 'https://api.mistral.ai/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai',
  ollama: 'http://localhost:11434',
}

const SUGGESTED_EMBEDDING_MODELS: Record<string, string[]> = {
  openai: ['text-embedding-3-small', 'text-embedding-3-large', 'text-embedding-ada-002'],
  mistral: ['mistral-embed'],
  gemini: ['gemini-embedding-001'],
  ollama: [],
}

const RERANKER_PRESETS = [
  { id: 'langsearch', label: 'LangSearch', baseURL: 'https://api.langsearch.com/v1/rerank', model: 'langsearch-reranker-v1' },
  { id: 'cohere', label: 'Cohere compatible', baseURL: 'https://api.cohere.com/v2/rerank', model: 'rerank-v3.5' },
  { id: 'tei', label: 'TEI / vLLM local', baseURL: 'http://localhost:8080/rerank', model: 'BAAI/bge-reranker-v2-m3' },
  { id: 'custom', label: 'Custom endpoint', baseURL: '', model: '' },
]

type TestState = 'idle' | 'running' | 'ok' | 'error'

export function KnowledgeView() {
  const [corpora, setCorpora] = useState<Corpus[]>([])
  const [error, setError] = useState<string | null>(null)
  const [embedderConfig, setEmbedderConfig] = useState<EmbedderConfig | null>(null)
  const [rerankerConfig, setRerankerConfig] = useState<RerankerConfig | null>(null)
  const [doclingConfig, setDoclingConfig] = useState<DoclingConfig | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const [corporaData, embData, rerankerData, doclingData] = await Promise.all([
        api.get<{ corpora: Corpus[]; count: number }>('/corpora').catch(() => ({ corpora: [], count: 0 })),
        api.get<EmbedderConfig>('/settings/embedder').catch(() => null),
        api.get<RerankerConfig>('/settings/reranker').catch(() => null),
        api.get<DoclingConfig>('/settings/docling').catch(() => null),
      ])
      setCorpora(corporaData?.corpora ?? [])
      if (embData) setEmbedderConfig(embData)
      if (rerankerData) setRerankerConfig(rerankerData)
      if (doclingData) setDoclingConfig(doclingData)
    } catch (e: unknown) {
      setError((e as { message?: string })?.message ?? 'Failed to load knowledge settings')
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const embedderReady = Boolean(embedderConfig?.enabled && embedderConfig.is_configured)
  const rerankerReady = Boolean(rerankerConfig?.enabled && rerankerConfig.is_configured)
  const doclingReady = doclingConfig?.enabled !== false
  const totalChunks = corpora.reduce((sum, corpus) => sum + (corpus.chunk_count || 0), 0)

  return (
    <div className="sv-view kv-page">
      <style>{KNOWLEDGE_CSS}</style>

      <header className="kv-hero">
        <div>
          <span className="kv-eyebrow">Knowledge settings</span>
          <h1>Retrieval pipeline</h1>
          <p>Configure ingestion, semantic search, reranking, and the defaults used by new Knowledge sessions.</p>
        </div>
        <button type="button" className="kv-ghost-btn" onClick={() => void load()}>
          <Sync size={13} /> Refresh
        </button>
      </header>

      <section className="kv-status-grid" aria-label="Knowledge pipeline status">
        <StatusTile label="Embedding" value={embedderReady ? 'Ready' : 'Review'} tone={embedderReady ? 'ok' : 'warn'} detail={embedderConfig?.model || 'No model selected'} />
        <StatusTile label="Reranker" value={rerankerReady ? 'Ready' : 'Off'} tone={rerankerReady ? 'ok' : 'muted'} detail={rerankerConfig?.model || 'Optional second pass'} />
        <StatusTile label="Conversion" value={doclingReady ? 'Enabled' : 'Disabled'} tone={doclingReady ? 'ok' : 'muted'} detail={doclingConfig?.base_url || 'Auto-detected local service'} />
        <StatusTile label="Corpus" value={`${corpora.length}`} tone="muted" detail={`${totalChunks} indexed chunks`} />
      </section>

      <EmbeddingCard config={embedderConfig} onSaved={setEmbedderConfig} />
      <RerankerCard config={rerankerConfig} onSaved={setRerankerConfig} />
      <DoclingCard config={doclingConfig} onSaved={setDoclingConfig} />
      <SearchDefaultsCard corpora={corpora} />

      {error && <div className="kv-error-banner">{error}</div>}
    </div>
  )
}

function StatusTile({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: 'ok' | 'warn' | 'muted' }) {
  return (
    <article className={`kv-status-tile ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <em>{detail}</em>
    </article>
  )
}

function EmbeddingCard({ config, onSaved }: { config: EmbedderConfig | null; onSaved: (cfg: EmbedderConfig) => void }) {
  const { status: linkStatus, link: linkCapability, unlink: unlinkCapability, busy: linkBusy } = useCapabilityLink('embeddings')
  const candidates = linkStatus?.candidates ?? []
  const [source, setSource] = useState('__custom__')
  const [sourceInitialized, setSourceInitialized] = useState(false)
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
  const [testState, setTestState] = useState<TestState>('idle')
  const [testError, setTestError] = useState<string | null>(null)
  const [testLatency, setTestLatency] = useState<number | null>(null)
  const [detectedModels, setDetectedModels] = useState<string[]>([])
  const [detecting, setDetecting] = useState(false)

  useEffect(() => {
    if (!config) return
    setForm((current) => ({
      ...current,
      provider: config.provider || 'openai',
      base_url: config.base_url || '',
      model: config.model || '',
      enabled: config.enabled,
    }))
  }, [config])

  useEffect(() => {
    if (sourceInitialized || !config || !linkStatus) return
    if (config.provider === 'ollama') {
      setSource('__ollama__')
    } else if (linkStatus.linked_provider_id && candidates.some((candidate) => candidate.id === linkStatus.linked_provider_id)) {
      setSource(linkStatus.linked_provider_id)
    } else {
      setSource('__custom__')
    }
    setSourceInitialized(true)
  }, [candidates, config, linkStatus, sourceInitialized])

  function update<K extends keyof typeof form>(key: K, value: typeof form[K]) {
    setForm((current) => ({ ...current, [key]: value }))
    setDirty(true)
    setTestState('idle')
  }

  function handleSourceChange(value: string) {
    setSource(value)
    setDetectedModels([])
    setDirty(true)
    setTestState('idle')
    if (value === '__ollama__') {
      setForm((current) => ({ ...current, provider: 'ollama', base_url: DEFAULT_BASE_URLS.ollama, model: '', api_key: '' }))
      return
    }
    if (value === '__custom__') {
      setForm((current) => ({ ...current, provider: 'openai', base_url: current.base_url || DEFAULT_BASE_URLS.openai, api_key: '' }))
      return
    }
    const candidate = candidates.find((item) => item.id === value)
    if (candidate) {
      setForm((current) => ({
        ...current,
        provider: candidate.provider,
        base_url: candidate.base_url || DEFAULT_BASE_URLS[candidate.provider] || current.base_url,
        model: candidate.model || current.model,
        api_key: '',
      }))
    }
  }

  async function save() {
    setSaving(true)
    try {
      if (isProviderCandidate(source)) {
        await linkCapability(source)
      } else if (linkStatus?.linked_provider_id) {
        await unlinkCapability()
      }
      const body: Record<string, unknown> = {
        provider: form.provider,
        base_url: form.base_url,
        model: form.model,
        enabled: form.enabled,
      }
      if (!isProviderCandidate(source) && form.api_key !== '') body.api_key = form.api_key
      const saved = await api.put<EmbedderConfig>('/settings/embedder', body)
      onSaved(saved)
      setForm((current) => ({ ...current, api_key: '' }))
      setDirty(false)
    } catch (e: unknown) {
      setTestState('error')
      setTestError((e as { message?: string })?.message ?? 'Failed to save embedding settings')
    } finally {
      setSaving(false)
    }
  }

  async function detectModels() {
    setDetecting(true)
    try {
      const result = await api.post<{ embedding_models: string[]; error?: string }>('/settings/embedder/detect-models', {
        provider: form.provider,
        base_url: form.base_url,
      })
      if (result.error) {
        setTestState('error')
        setTestError(result.error)
      } else {
        const models = result.embedding_models ?? []
        setDetectedModels(models)
        if (models.length > 0 && !form.model) {
          setForm((current) => ({ ...current, model: models[0] }))
          setDirty(true)
        }
      }
    } catch (e: unknown) {
      setTestState('error')
      setTestError((e as { message?: string })?.message ?? 'Model detection failed')
    } finally {
      setDetecting(false)
    }
  }

  async function test() {
    setTestState('running')
    setTestError(null)
    setTestLatency(null)
    try {
      const body: Record<string, unknown> = { provider: form.provider, base_url: form.base_url, model: form.model }
      if (form.api_key !== '') body.api_key = form.api_key
      const result = await api.post<{ ok: boolean; latency_ms: number; error: string | null }>('/settings/embedder/test', body)
      if (result.ok) {
        setTestState('ok')
        setTestLatency(result.latency_ms)
      } else {
        setTestState('error')
        setTestError(result.error ?? 'Embedding test failed')
      }
    } catch (e: unknown) {
      setTestState('error')
      setTestError((e as { message?: string })?.message ?? 'Embedding test failed')
    }
  }

  const inherited = isProviderCandidate(source)
  const activeCandidate = candidates.find((item) => item.id === source)
  const suggestions = detectedModels.length > 0 ? detectedModels : (SUGGESTED_EMBEDDING_MODELS[form.provider] ?? [])

  return (
    <section className="kv-card">
      <CardHeader
        icon={<LinkCloud size={16} />}
        title="Embedding"
        subtitle="Used for ingestion vectors and semantic search."
        status={config?.is_configured ? 'Configured' : 'Not configured'}
        ok={Boolean(config?.is_configured)}
      >
        <Toggle checked={form.enabled} onChange={(value) => update('enabled', value)} label="Enabled" />
      </CardHeader>

      <div className="kv-card-body">
        <div className="kv-grid two">
          <Field label="Provider source">
            <select value={source} onChange={(event) => handleSourceChange(event.target.value)}>
              {candidates.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>{candidate.name}</option>
              ))}
              <option value="__ollama__">Ollama local</option>
              <option value="__custom__">Custom endpoint</option>
            </select>
          </Field>
          <Field label="Base URL">
            <input value={form.base_url} onChange={(event) => update('base_url', event.target.value)} placeholder="https://api.openai.com/v1" />
          </Field>
        </div>

        {inherited && activeCandidate && (
          <div className="kv-note ok">
            <CheckOne size={12} /> Reusing the API key from <strong>{activeCandidate.name}</strong>. Compatible providers are filtered by the backend.
          </div>
        )}

        <div className="kv-grid two">
          {!inherited && (
            <SecretField
              label="API key"
              value={form.api_key}
              show={showKey}
              placeholder={config?.has_api_key ? 'Leave blank to keep current key' : 'sk-...'}
              onToggle={() => setShowKey((value) => !value)}
              onChange={(value) => update('api_key', value)}
            />
          )}
          <Field label={detectedModels.length > 0 ? `Embedding model (${detectedModels.length} detected)` : 'Embedding model'}>
            <div className="kv-inline-field">
              <input list="embedding-models" value={form.model} onChange={(event) => update('model', event.target.value)} placeholder="text-embedding-3-small" />
              {form.provider === 'ollama' && (
                <button type="button" className="kv-icon-btn" onClick={() => void detectModels()} disabled={detecting || !form.base_url}>
                  <Sync size={13} className={detecting ? 'kv-spin' : undefined} />
                </button>
              )}
            </div>
            <datalist id="embedding-models">
              {suggestions.map((model) => <option key={model} value={model} />)}
            </datalist>
          </Field>
        </div>

        <TestMessage state={testState} error={testError} latency={testLatency} />
      </div>

      <CardFooter dirty={dirty} saving={saving || linkBusy} testState={testState} canTest={Boolean(form.base_url && form.model)} onTest={() => void test()} onSave={() => void save()} />
    </section>
  )
}

function RerankerCard({ config, onSaved }: { config: RerankerConfig | null; onSaved: (cfg: RerankerConfig) => void }) {
  const [preset, setPreset] = useState(presetFor(config?.base_url || ''))
  const [form, setForm] = useState({
    base_url: config?.base_url ?? '',
    api_key: '',
    model: config?.model ?? '',
    enabled: config?.enabled ?? false,
  })
  const [showKey, setShowKey] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testState, setTestState] = useState<TestState>('idle')
  const [testError, setTestError] = useState<string | null>(null)
  const [testLatency, setTestLatency] = useState<number | null>(null)

  useEffect(() => {
    if (!config) return
    setPreset(presetFor(config.base_url || ''))
    setForm((current) => ({ ...current, base_url: config.base_url || '', model: config.model || '', enabled: config.enabled }))
  }, [config])

  function update<K extends keyof typeof form>(key: K, value: typeof form[K]) {
    setForm((current) => ({ ...current, [key]: value }))
    setDirty(true)
    setTestState('idle')
  }

  function choosePreset(value: string) {
    setPreset(value)
    const next = RERANKER_PRESETS.find((item) => item.id === value)
    if (!next) return
    setForm((current) => ({
      ...current,
      base_url: next.baseURL || current.base_url,
      model: next.model || current.model,
      api_key: '',
      enabled: true,
    }))
    setDirty(true)
    setTestState('idle')
  }

  async function save() {
    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        base_url: form.base_url,
        model: form.model,
        enabled: form.enabled,
      }
      if (form.api_key !== '') body.api_key = form.api_key
      const saved = await api.put<RerankerConfig>('/settings/reranker', body)
      onSaved(saved)
      setForm((current) => ({ ...current, api_key: '' }))
      setDirty(false)
    } catch (e: unknown) {
      setTestState('error')
      setTestError((e as { message?: string })?.message ?? 'Failed to save reranker settings')
    } finally {
      setSaving(false)
    }
  }

  async function test() {
    setTestState('running')
    setTestError(null)
    setTestLatency(null)
    try {
      const result = await api.post<{ ok: boolean; latency_ms: number; error: string | null }>('/settings/reranker/test', {
        base_url: form.base_url,
        model: form.model,
        api_key: form.api_key,
      })
      if (result.ok) {
        setTestState('ok')
        setTestLatency(result.latency_ms)
      } else {
        setTestState('error')
        setTestError(result.error ?? 'Reranker test failed')
      }
    } catch (e: unknown) {
      setTestState('error')
      setTestError((e as { message?: string })?.message ?? 'Reranker test failed')
    }
  }

  return (
    <section className="kv-card">
      <CardHeader
        icon={<DatabaseSearch size={16} />}
        title="Reranker"
        subtitle="Optional second pass for better result ordering after retrieval."
        status={config?.is_configured ? 'Configured' : 'Optional'}
        ok={Boolean(config?.is_configured)}
      >
        <Toggle checked={form.enabled} onChange={(value) => update('enabled', value)} label="Enabled" />
      </CardHeader>

      <div className="kv-card-body">
        <div className="kv-grid three">
          <Field label="Endpoint type">
            <select value={preset} onChange={(event) => choosePreset(event.target.value)}>
              {RERANKER_PRESETS.map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Endpoint URL">
            <input value={form.base_url} onChange={(event) => update('base_url', event.target.value)} placeholder="http://localhost:8080/rerank" />
          </Field>
          <Field label="Model">
            <input value={form.model} onChange={(event) => update('model', event.target.value)} placeholder="BAAI/bge-reranker-v2-m3" />
          </Field>
        </div>

        <SecretField
          label="API key"
          value={form.api_key}
          show={showKey}
          placeholder={config?.has_api_key ? 'Leave blank to keep current key' : 'Optional for local TEI/vLLM'}
          onToggle={() => setShowKey((value) => !value)}
          onChange={(value) => update('api_key', value)}
        />

        <div className="kv-note">
          <Connection size={12} /> Rerank endpoints must support Cohere, LangSearch, TEI, or vLLM rerank response shapes.
        </div>
        <TestMessage state={testState} error={testError} latency={testLatency} />
      </div>

      <CardFooter dirty={dirty} saving={saving} testState={testState} canTest={Boolean(form.base_url)} onTest={() => void test()} onSave={() => void save()} />
    </section>
  )
}

function DoclingCard({ config, onSaved }: { config: DoclingConfig | null; onSaved: (cfg: DoclingConfig) => void }) {
  const [form, setForm] = useState({ base_url: config?.base_url ?? '', enabled: config?.enabled ?? true })
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testState, setTestState] = useState<TestState>('idle')
  const [testError, setTestError] = useState<string | null>(null)
  const [testLatency, setTestLatency] = useState<number | null>(null)

  useEffect(() => {
    if (config) setForm({ base_url: config.base_url || '', enabled: config.enabled })
  }, [config])

  function update<K extends keyof typeof form>(key: K, value: typeof form[K]) {
    setForm((current) => ({ ...current, [key]: value }))
    setDirty(true)
    setTestState('idle')
  }

  async function save() {
    setSaving(true)
    try {
      const saved = await api.put<DoclingConfig>('/settings/docling', form)
      onSaved(saved)
      setDirty(false)
    } catch (e: unknown) {
      setTestState('error')
      setTestError((e as { message?: string })?.message ?? 'Failed to save document conversion settings')
    } finally {
      setSaving(false)
    }
  }

  async function test() {
    setTestState('running')
    setTestError(null)
    setTestLatency(null)
    try {
      const result = await api.post<{ ok: boolean; latency_ms: number; error: string | null }>('/settings/docling/test', { base_url: form.base_url })
      if (result.ok) {
        setTestState('ok')
        setTestLatency(result.latency_ms)
      } else {
        setTestState('error')
        setTestError(result.error ?? 'Docling test failed')
      }
    } catch (e: unknown) {
      setTestState('error')
      setTestError((e as { message?: string })?.message ?? 'Docling test failed')
    }
  }

  return (
    <section className="kv-card">
      <CardHeader
        icon={<DocDetail size={16} />}
        title="Document conversion"
        subtitle="Converts PDFs, Office documents, images, and audio into markdown before ingestion."
        status={form.enabled ? 'Enabled' : 'Disabled'}
        ok={form.enabled}
      >
        <Toggle checked={form.enabled} onChange={(value) => update('enabled', value)} label="Enabled" />
      </CardHeader>
      <div className="kv-card-body">
        <Field label="Docling server URL">
          <input value={form.base_url} onChange={(event) => update('base_url', event.target.value)} placeholder="http://localhost:5001 (blank uses auto-detected local service)" />
        </Field>
        <TestMessage state={testState} error={testError} latency={testLatency} />
      </div>
      <CardFooter dirty={dirty} saving={saving} testState={testState} canTest={Boolean(form.base_url)} onTest={() => void test()} onSave={() => void save()} />
    </section>
  )
}

function SearchDefaultsCard({ corpora }: { corpora: Corpus[] }) {
  const [prefs, setPrefs] = useState(() => loadSearchDefaults())

  function update(next: typeof prefs) {
    setPrefs(next)
    saveSearchDefaults(next)
  }

  return (
    <section className="kv-card">
      <CardHeader
        icon={<Search size={16} />}
        title="Retrieval defaults"
        subtitle="Default corpus scope and result count for new Knowledge sessions."
        status={`${prefs.topK} chunks`}
        ok
      />
      <div className="kv-card-body">
        <div className="kv-grid two">
          <Field label="Default collection">
            <select value={prefs.corpusId} onChange={(event) => update({ ...prefs, corpusId: event.target.value })}>
              <option value="all">All included knowledge</option>
              {corpora.map((corpus) => (
                <option key={corpus.id} value={corpus.id}>{corpus.name}</option>
              ))}
            </select>
          </Field>
          <Field label={`Matching chunks (${prefs.topK})`}>
            <input type="range" min={3} max={20} value={prefs.topK} onChange={(event) => update({ ...prefs, topK: Number(event.target.value) })} />
          </Field>
        </div>
      </div>
    </section>
  )
}

function CardHeader({ icon, title, subtitle, status, ok, children }: { icon: ReactNode; title: string; subtitle: string; status: string; ok: boolean; children?: ReactNode }) {
  return (
    <div className="kv-card-header">
      <div className="kv-card-title">
        <span className="kv-card-icon">{icon}</span>
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
      </div>
      <div className="kv-card-actions">
        <span className={`kv-pill ${ok ? 'ok' : 'warn'}`}>{ok ? <CheckOne size={11} /> : null}{status}</span>
        {children}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="kv-field">
      <span>{label}</span>
      {children}
    </label>
  )
}

function SecretField({ label, value, show, placeholder, onToggle, onChange }: { label: string; value: string; show: boolean; placeholder: string; onToggle: () => void; onChange: (value: string) => void }) {
  return (
    <Field label={label}>
      <div className="kv-secret">
        <input type={show ? 'text' : 'password'} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} autoComplete="new-password" />
        <button type="button" onClick={onToggle} aria-label={show ? 'Hide key' : 'Show key'}>
          {show ? <PreviewClose size={13} /> : <PreviewOpen size={13} />}
        </button>
      </div>
    </Field>
  )
}

function Toggle({ checked, label, onChange }: { checked: boolean; label: string; onChange: (checked: boolean) => void }) {
  return (
    <label className="kv-toggle">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  )
}

function TestMessage({ state, error, latency }: { state: TestState; error: string | null; latency: number | null }) {
  if (state === 'idle' || state === 'running') return null
  if (state === 'ok') {
    return <div className="kv-message ok"><CheckOne size={12} /> Connected in {latency ?? 0}ms.</div>
  }
  return <div className="kv-message error"><CloseOne size={12} /> {error ?? 'Connection failed.'}</div>
}

function CardFooter({ dirty, saving, testState, canTest, onTest, onSave }: { dirty: boolean; saving: boolean; testState: TestState; canTest: boolean; onTest: () => void; onSave: () => void }) {
  return (
    <div className="kv-card-footer">
      <button type="button" className="kv-secondary-btn" onClick={onTest} disabled={!canTest || testState === 'running'}>
        {testState === 'running' ? <Sync size={12} className="kv-spin" /> : <Setting size={12} />}
        {testState === 'running' ? 'Testing...' : 'Test connection'}
      </button>
      <button type="button" className="kv-primary-btn" onClick={onSave} disabled={!dirty || saving}>
        {saving ? 'Saving...' : dirty ? 'Save changes' : 'Saved'}
      </button>
    </div>
  )
}

function isProviderCandidate(source: string) {
  return source !== '__ollama__' && source !== '__custom__'
}

function presetFor(baseURL: string) {
  const match = RERANKER_PRESETS.find((item) => item.baseURL && item.baseURL === baseURL)
  return match?.id ?? 'custom'
}

const KNOWLEDGE_CSS = `
.kv-page {
  max-width: 1296px;
  margin: 0 auto;
  padding-bottom: 32px;
}

.kv-hero {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}

.kv-eyebrow {
  display: block;
  margin-bottom: 6px;
  color: var(--color-primary);
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
}

.kv-hero h1 {
  margin: 0;
  color: var(--color-text);
  font-size: 26px;
  line-height: 1.1;
}

.kv-hero p {
  margin: 7px 0 0;
  color: var(--color-text-secondary);
  font-size: 13px;
}

.kv-status-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}

.kv-status-tile {
  min-width: 0;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg);
  padding: 14px 16px;
}

.kv-status-tile span {
  display: block;
  color: var(--color-text-muted);
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
}

.kv-status-tile strong {
  display: block;
  margin-top: 8px;
  color: var(--color-text);
  font-size: 25px;
  line-height: 1;
}

.kv-status-tile em {
  display: block;
  margin-top: 8px;
  overflow: hidden;
  color: var(--color-text-secondary);
  font-size: 12px;
  font-style: normal;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.kv-status-tile.ok strong { color: var(--color-success); }
.kv-status-tile.warn strong { color: var(--color-warning, var(--color-primary)); }
.kv-status-tile.muted strong { color: var(--color-text); }

.kv-card {
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg);
  margin-bottom: 14px;
  overflow: hidden;
}

.kv-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 16px 18px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface);
}

.kv-card-title {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 12px;
}

.kv-card-icon {
  width: 38px;
  height: 38px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg);
  color: var(--color-primary);
}

.kv-card-title h2 {
  margin: 0;
  color: var(--color-text);
  font-size: 15px;
  line-height: 1.2;
}

.kv-card-title p {
  margin: 4px 0 0;
  color: var(--color-text-muted);
  font-size: 12px;
  line-height: 1.35;
}

.kv-card-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 0 0 auto;
}

.kv-card-body {
  display: flex;
  flex-direction: column;
  gap: 13px;
  padding: 16px 18px;
}

.kv-card-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 18px;
  border-top: 1px solid var(--color-border);
  background: var(--color-surface);
}

.kv-primary-btn,
.kv-secondary-btn,
.kv-ghost-btn,
.kv-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border-radius: 7px;
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.kv-primary-btn {
  margin-left: auto;
  border: 1px solid transparent;
  background: var(--color-primary);
  color: white;
  padding: 7px 12px;
}

.kv-secondary-btn,
.kv-ghost-btn {
  border: 1px solid var(--color-border);
  background: var(--color-bg);
  color: var(--color-text-secondary);
  padding: 7px 12px;
}

.kv-primary-btn:disabled,
.kv-secondary-btn:disabled,
.kv-icon-btn:disabled {
  cursor: default;
  opacity: 0.5;
}

.kv-grid {
  display: grid;
  gap: 12px;
}

.kv-grid.two {
  grid-template-columns: minmax(220px, 0.9fr) minmax(260px, 2fr);
}

.kv-grid.three {
  grid-template-columns: minmax(180px, 0.8fr) minmax(260px, 1.4fr) minmax(220px, 1fr);
}

.kv-field {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 6px;
}

.kv-field > span {
  color: var(--color-text-secondary);
  font-size: 11px;
  font-weight: 800;
}

.kv-field input,
.kv-field select {
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  border: 1px solid var(--color-border);
  border-radius: 7px;
  background: var(--color-bg);
  color: var(--color-text);
  font: inherit;
  font-size: 13px;
  outline: none;
  padding: 8px 10px;
}

.kv-field input:focus,
.kv-field select:focus {
  border-color: var(--color-primary);
}

.kv-inline-field,
.kv-secret {
  display: flex;
  align-items: center;
  gap: 7px;
}

.kv-inline-field input,
.kv-secret input {
  flex: 1 1 auto;
}

.kv-icon-btn,
.kv-secret button {
  width: 35px;
  height: 35px;
  border: 1px solid var(--color-border);
  background: var(--color-bg);
  color: var(--color-text-secondary);
}

.kv-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border-radius: 999px;
  padding: 3px 8px;
  font-size: 11px;
  font-weight: 800;
}

.kv-pill.ok {
  background: rgba(111, 175, 123, 0.13);
  color: var(--color-success);
}

.kv-pill.warn {
  border: 1px solid var(--color-border);
  background: var(--color-bg);
  color: var(--color-text-muted);
}

.kv-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 700;
}

.kv-toggle input {
  margin: 0;
}

.kv-note,
.kv-message {
  display: flex;
  align-items: center;
  gap: 7px;
  border: 1px solid var(--color-border);
  border-radius: 7px;
  background: var(--color-surface);
  color: var(--color-text-secondary);
  padding: 8px 10px;
  font-size: 12px;
  line-height: 1.35;
}

.kv-note.ok,
.kv-message.ok {
  border-color: rgba(111, 175, 123, 0.32);
  background: rgba(111, 175, 123, 0.08);
  color: var(--color-success);
}

.kv-message.error,
.kv-error-banner {
  border-color: rgba(201, 107, 92, 0.32);
  background: rgba(201, 107, 92, 0.08);
  color: var(--color-error);
}

.kv-error-banner {
  border-style: solid;
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 12px;
}

.kv-spin {
  animation: kv-spin 1s linear infinite;
}

@keyframes kv-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@media (max-width: 980px) {
  .kv-status-grid,
  .kv-grid.two,
  .kv-grid.three {
    grid-template-columns: 1fr;
  }

  .kv-card-header,
  .kv-hero {
    align-items: flex-start;
    flex-direction: column;
  }

  .kv-card-actions {
    flex-wrap: wrap;
  }
}
`
