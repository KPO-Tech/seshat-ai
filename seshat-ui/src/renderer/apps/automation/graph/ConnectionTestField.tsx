import { useState } from 'react'
import { api, ApiError } from '@/api/client'

type ConnectionTestResult = { ok: boolean; message: string }

type Props = {
  organizationId: string | undefined
  nodeType: string
  // Reads the node's currently-drafted parameters (not necessarily saved
  // yet) - matches n8n's own "test before save" UX for a credential. Called
  // lazily on click, not on every render.
  getParams: () => Record<string, unknown>
}

// One per-node section (like TestNodeField), but a narrower claim - this
// only proves the node's own secretRef-based connection works (a SQL Ping,
// a Redis PING, ...), not that the whole node runs correctly, so it stays
// local state instead of sharing GraphNode's canvas test badge (Tier 2.4).
// Only rendered when the node type's catalog entry has isTestable set (see
// ParameterForm.tsx) - most node types have no connection to test at all.
export function ConnectionTestField({ organizationId, nodeType, getParams }: Props) {
  const [status, setStatus] = useState<'idle' | 'running' | 'ok' | 'error'>('idle')
  const [message, setMessage] = useState<string | null>(null)

  async function test() {
    if (!organizationId) return
    setStatus('running')
    setMessage(null)
    try {
      const res = await api.post<ConnectionTestResult>('/dataflow/test-connection', {
        organization_id: organizationId,
        node_type: nodeType,
        parameters: getParams(),
      })
      setStatus(res.ok ? 'ok' : 'error')
      setMessage(res.message)
    } catch (err) {
      setStatus('error')
      setMessage(err instanceof ApiError ? err.message : 'Unable to test this connection.')
    }
  }

  return (
    <div className="gf-field gf-connection-test-field">
      <style>{CONNECTION_TEST_FIELD_CSS}</style>
      <button type="button" className="gf-action-btn" onClick={() => void test()} disabled={!organizationId || status === 'running'}>
        {status === 'running' ? 'Testing connection…' : 'Test connection'}
      </button>
      {message && status !== 'running' && (
        <div className={status === 'ok' ? 'gf-field-hint gf-connection-test-ok' : 'gf-field-error'}>{message}</div>
      )}
    </div>
  )
}

const CONNECTION_TEST_FIELD_CSS = `
.gf-connection-test-field {
  padding-top: 4px;
}

.gf-connection-test-ok {
  color: var(--color-success);
}
`
