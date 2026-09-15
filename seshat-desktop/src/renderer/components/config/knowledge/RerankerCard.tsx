import { useEffect, useState } from 'react'
import { ConfigCard, CustomSelect, Field, ResultMessage, SoftButton, StatusPill, TextInput, ToggleSwitch, type SelectOption } from './KnowledgePrimitives'
import { detectRerankerModel, saveRerankerConfig, testRerankerConfig } from './knowledgeApi'
import type { RerankerConfig, TestState } from './knowledgeTypes'

const RERANKER_PRESETS = [
  { id: 'tei', label: 'TEI local', base_url: 'http://localhost:8083/rerank', model: 'BAAI/bge-reranker-v2-m3' },
  { id: 'langsearch', label: 'LangSearch', base_url: 'https://api.langsearch.com/v1/rerank', model: 'langsearch-reranker-v1' },
  { id: 'cohere', label: 'Cohere compatible', base_url: 'https://api.cohere.com/v2/rerank', model: 'rerank-v3.5' },
  { id: 'custom', label: 'Custom endpoint', base_url: '', model: '' }
]

export function RerankerCard({ config, onSaved }: { config: RerankerConfig | null; onSaved: (config: RerankerConfig) => void }) {
  const [preset, setPreset] = useState('tei')
  const [form, setForm] = useState({
    base_url: config?.base_url || RERANKER_PRESETS[0].base_url,
    model: config?.model || RERANKER_PRESETS[0].model,
    api_key: '',
    enabled: config?.enabled ?? false
  })
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState<TestState>('idle')
  const [testError, setTestError] = useState<string | null>(null)
  const [latency, setLatency] = useState<number | null>(null)
  const [detecting, setDetecting] = useState(false)

  useEffect(() => {
    if (!config) return
    const match = RERANKER_PRESETS.find((item) => item.base_url === config.base_url)
    setPreset(match?.id ?? 'custom')
    setForm((current) => ({
      ...current,
      base_url: config.base_url || '',
      model: config.model || '',
      enabled: config.enabled
    }))
  }, [config])

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }))
    setDirty(true)
    setTesting('idle')
  }

  function choosePreset(value: string) {
    setPreset(value)
    const next = RERANKER_PRESETS.find((item) => item.id === value)
    if (!next) return
    setForm((current) => ({
      ...current,
      base_url: next.base_url || current.base_url,
      model: next.model || current.model,
      api_key: '',
      enabled: true
    }))
    setDirty(true)
    setTesting('idle')
  }

  async function detectModel() {
    setDetecting(true)
    setTestError(null)
    try {
      const result = await detectRerankerModel({ base_url: form.base_url })
      if (result.error) {
        setTesting('error')
        setTestError(result.error)
        return
      }
      if (result.model) update('model', result.model)
    } catch (error) {
      setTesting('error')
      setTestError((error as { message?: string })?.message ?? 'Model detection failed.')
    } finally {
      setDetecting(false)
    }
  }

  async function test() {
    setTesting('running')
    setTestError(null)
    setLatency(null)
    try {
      const result = await testRerankerConfig({
        base_url: form.base_url,
        model: form.model,
        api_key: form.api_key || undefined
      })
      setTesting(result.ok ? 'ok' : 'error')
      setLatency(result.latency_ms)
      setTestError(result.error)
    } catch (error) {
      setTesting('error')
      setTestError((error as { message?: string })?.message ?? 'Reranker test failed.')
    }
  }

  async function save() {
    setSaving(true)
    try {
      const saved = await saveRerankerConfig({
        base_url: form.base_url,
        model: form.model,
        enabled: form.enabled,
        api_key: form.api_key || undefined
      })
      onSaved(saved)
      setForm((current) => ({ ...current, api_key: '' }))
      setDirty(false)
    } catch (error) {
      setTesting('error')
      setTestError((error as { message?: string })?.message ?? 'Failed to save reranker settings.')
    } finally {
      setSaving(false)
    }
  }

  const presetOptions: SelectOption[] = RERANKER_PRESETS.map((item) => ({
    value: item.id,
    label: item.label,
    description: item.id === 'tei' ? 'Local reranking server' : item.id === 'custom' ? 'Bring your own endpoint' : item.model
  }))

  return (
    <ConfigCard
      title="Reranker"
      description="Optional second pass to reorder retrieved chunks before they reach the agent."
      status={<StatusPill tone={config?.is_configured ? 'ok' : 'muted'}>{config?.is_configured ? 'Ready' : 'Optional'}</StatusPill>}
      action={<ToggleSwitch enabled={form.enabled} onChange={(enabled) => update('enabled', enabled)} />}
    >
      <div className="grid gap-4">
        <div className="grid gap-3 md:grid-cols-[250px_minmax(0,1fr)]">
          <Field label="Endpoint">
            <CustomSelect value={preset} options={presetOptions} onChange={choosePreset} />
          </Field>
          <Field label="Base URL">
            <TextInput value={form.base_url} onChange={(event) => update('base_url', event.target.value)} placeholder="http://localhost:8083/rerank" />
          </Field>
        </div>
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
          <Field label="Model">
            <TextInput value={form.model} onChange={(event) => update('model', event.target.value)} placeholder="BAAI/bge-reranker-v2-m3" />
          </Field>
          <Field label="API key">
            <TextInput type="password" value={form.api_key} onChange={(event) => update('api_key', event.target.value)} placeholder={config?.has_api_key ? 'Keep current key' : 'Optional'} autoComplete="new-password" />
          </Field>
        </div>

        <ResultMessage state={testing} error={testError} latency={latency} />

        <div className="flex flex-wrap items-center gap-2">
          {preset === 'tei' && (
            <SoftButton type="button" onClick={() => void detectModel()} disabled={detecting || !form.base_url}>
              {detecting ? 'Detecting...' : 'Detect model'}
            </SoftButton>
          )}
          <SoftButton type="button" onClick={() => void test()} disabled={!form.base_url || testing === 'running'}>
            {testing === 'running' ? 'Testing...' : 'Test'}
          </SoftButton>
          <SoftButton type="button" tone={dirty ? 'primary' : 'success'} onClick={() => void save()} disabled={!dirty || saving} className="ml-auto">
            {saving ? 'Saving...' : dirty ? 'Save changes' : 'Saved'}
          </SoftButton>
        </div>
      </div>
    </ConfigCard>
  )
}
