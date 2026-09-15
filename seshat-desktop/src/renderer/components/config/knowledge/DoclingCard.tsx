import { useEffect, useState } from 'react'
import { ConfigCard, Field, ResultMessage, SoftButton, StatusPill, TextInput, ToggleSwitch } from './KnowledgePrimitives'
import { saveDoclingConfig, testDoclingConfig } from './knowledgeApi'
import type { DoclingConfig, TestState } from './knowledgeTypes'

export function DoclingCard({ config, onSaved }: { config: DoclingConfig | null; onSaved: (config: DoclingConfig) => void }) {
  const [form, setForm] = useState({
    base_url: config?.base_url || '',
    enabled: config?.enabled ?? true
  })
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState<TestState>('idle')
  const [testError, setTestError] = useState<string | null>(null)
  const [latency, setLatency] = useState<number | null>(null)

  useEffect(() => {
    if (config) setForm({ base_url: config.base_url || '', enabled: config.enabled })
  }, [config])

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }))
    setDirty(true)
    setTesting('idle')
  }

  async function test() {
    setTesting('running')
    setTestError(null)
    setLatency(null)
    try {
      const result = await testDoclingConfig({ base_url: form.base_url })
      setTesting(result.ok ? 'ok' : 'error')
      setLatency(result.latency_ms)
      setTestError(result.error)
    } catch (error) {
      setTesting('error')
      setTestError((error as { message?: string })?.message ?? 'Docling test failed.')
    }
  }

  async function save() {
    setSaving(true)
    try {
      const saved = await saveDoclingConfig(form)
      onSaved(saved)
      setDirty(false)
    } catch (error) {
      setTesting('error')
      setTestError((error as { message?: string })?.message ?? 'Failed to save Docling settings.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ConfigCard
      title="Document conversion"
      description="Docling converts PDFs, Office files, images, and audio before ingestion."
      status={<StatusPill tone={form.enabled ? 'ok' : 'muted'}>{form.enabled ? 'Enabled' : 'Disabled'}</StatusPill>}
      action={<ToggleSwitch enabled={form.enabled} onChange={(enabled) => update('enabled', enabled)} />}
    >
      <div className="grid gap-4">
        <Field label="Docling server URL">
          <TextInput value={form.base_url} onChange={(event) => update('base_url', event.target.value)} placeholder="http://localhost:5001" />
        </Field>
        <ResultMessage state={testing} error={testError} latency={latency} />
        <div className="flex items-center gap-2">
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
