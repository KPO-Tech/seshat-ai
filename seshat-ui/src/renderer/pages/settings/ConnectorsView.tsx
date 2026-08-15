import { useState, useEffect, useCallback, useRef } from 'react'
import { FolderClose, CloudStorage, Send, Plus, Close, LoadingOne, Caution } from '@icon-park/react'
import { api, ApiError } from '@/api/client'
import { WindowCloseIcon } from '@/components/ui/WindowControlIcon'
import type { Corpus, ConnectorAccount, ActionResult } from '@/api/types'

// ConnectorsView is the unified catalog for internal/connector-based
// integrations (seshat-ai roadmap Phase 3, "catalogue de connecteurs
// unifié") - distinct from McpView (raw MCP server config, no account/
// Discover/Sync/Act shape) and ConnectionsView (internal/inbox's own,
// older messaging-connector concept). Three concrete connectors are known
// here by name, same as the backend never built a dynamic connector-kind
// registry either - proportionate for proving the catalog concept works,
// not a plugin system.
export function ConnectorsView() {
  const [corpora, setCorpora] = useState<Corpus[]>([])

  useEffect(() => {
    api.get<{ corpora: Corpus[] }>('/corpora').then((res) => setCorpora(res.corpora ?? [])).catch(() => {})
  }, [])

  return (
    <div className="sv-view">
      <style>{CONNECTORS_CSS}</style>
      <header className="sv-view-header">
        <div className="sv-header-info">
          <h1>Connectors</h1>
          <p>External Knowledge and Action integrations, built on the shared connector framework.</p>
        </div>
      </header>

      <DriveConnectorCard corpora={corpora} />
      <StaticAccountConnectorCard
        kind="s3"
        title="S3-compatible storage"
        subtitle="Sync business documents from a bucket (AWS S3, MinIO, R2, Backblaze) into a corpus"
        icon={<CloudStorage size={15} />}
        capability="knowledge"
        corpora={corpora}
        renderConnectForm={(props) => <S3ConnectForm {...props} />}
      />
      <StaticAccountConnectorCard
        kind="mcp:demo-crm"
        title="Demo CRM (Action via MCP)"
        subtitle="Run a named action against the demo-crm-mcp server through a connected account"
        icon={<Send size={15} />}
        capability="action"
        corpora={corpora}
        renderConnectForm={(props) => <TokenConnectForm {...props} />}
      />
    </div>
  )
}

// ─── Google Drive card (OAuth) ─────────────────────────────────────────────────

function DriveConnectorCard({ corpora }: { corpora: Corpus[] }) {
  const [accounts, setAccounts] = useState<ConnectorAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get<{ accounts: ConnectorAccount[] }>('/knowledge/connectors/gdrive/accounts')
      setAccounts(res.accounts ?? [])
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to load Google Drive accounts.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [load])

  async function handleConnect() {
    setConnecting(true)
    setError(null)
    try {
      const started = await api.post<{ authorization_url: string }>('/knowledge/connectors/gdrive/oauth/start')
      if (window.nexus?.openExternal) {
        await window.nexus.openExternal(started.authorization_url)
      } else {
        window.open(started.authorization_url, '_blank', 'noopener,noreferrer')
      }
      const knownIds = new Set(accounts.map((a) => a.id))
      let attempts = 0
      if (pollRef.current) clearInterval(pollRef.current)
      pollRef.current = setInterval(async () => {
        attempts++
        try {
          const res = await api.get<{ accounts: ConnectorAccount[] }>('/knowledge/connectors/gdrive/accounts')
          setAccounts(res.accounts ?? [])
          if ((res.accounts ?? []).some((a) => !knownIds.has(a.id))) {
            if (pollRef.current) clearInterval(pollRef.current)
            pollRef.current = null
            setConnecting(false)
            return
          }
        } catch {
          // Keep polling until the attempt budget expires.
        }
        if (attempts >= 30 && pollRef.current) {
          clearInterval(pollRef.current)
          pollRef.current = null
          setConnecting(false)
        }
      }, 2000)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to start the Google Drive connection.')
      setConnecting(false)
    }
  }

  async function handleDisconnect(id: string) {
    try {
      await api.delete(`/connectors/gdrive/accounts/${id}`)
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to disconnect.')
    }
  }

  async function handleSync(id: string, corpusId: string) {
    try {
      await api.post(`/knowledge/connectors/gdrive/accounts/${id}/sync?corpus_id=${encodeURIComponent(corpusId)}`)
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Sync failed.')
    }
  }

  return (
    <div className="sv-card cnv-card">
      <div className="sv-card-head">
        <div className="sv-card-brand">
          <div className="sv-brand-icon"><FolderClose size={15} /></div>
          <div>
            <div className="sv-brand-name">Google Drive</div>
            <div className="sv-brand-sub">Sync business documents (PDF, Word, PowerPoint, text) into a corpus</div>
          </div>
        </div>
      </div>
      <div className="sv-card-body cnv-stack">
        {error && <div className="cnv-inline-error"><Caution size={13} /> {error}</div>}
        {loading && accounts.length === 0 ? (
          <div className="cnv-note">Loading…</div>
        ) : accounts.length === 0 ? (
          <div className="cnv-note">No Google Drive account connected yet.</div>
        ) : (
          accounts.map((account) => (
            <ConnectorAccountRow
              key={account.id}
              account={account}
              corpora={corpora}
              onDisconnect={() => void handleDisconnect(account.id)}
              onSync={(corpusId) => void handleSync(account.id, corpusId)}
            />
          ))
        )}
        <button className="cnv-primary-btn" onClick={() => void handleConnect()} disabled={connecting}>
          {connecting ? <LoadingOne size={12} className="spin" /> : <Plus size={12} />}
          {connecting ? 'Waiting for Google sign-in…' : 'Connect a Google Drive account'}
        </button>
      </div>
    </div>
  )
}

// ─── Generic static-credential connector card (S3, MCP Action) ────────────────

type ConnectFormProps = {
  onSubmit: (body: {
    display_name: string
    external_account_id: string
    access_token: string
    refresh_token?: string
    config?: Record<string, unknown>
  }) => Promise<void>
  submitting: boolean
}

function StaticAccountConnectorCard({
  kind,
  title,
  subtitle,
  icon,
  capability,
  corpora,
  renderConnectForm,
}: {
  kind: string
  title: string
  subtitle: string
  icon: React.ReactNode
  capability: 'knowledge' | 'action'
  corpora: Corpus[]
  renderConnectForm: (props: ConnectFormProps) => React.ReactNode
}) {
  const [accounts, setAccounts] = useState<ConnectorAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get<{ accounts: ConnectorAccount[] }>(`/connectors/${kind}/accounts`)
      setAccounts(res.accounts ?? [])
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Unable to load ${title} accounts.`)
    } finally {
      setLoading(false)
    }
  }, [kind, title])

  useEffect(() => { void load() }, [load])

  async function handleConnect(body: Parameters<ConnectFormProps['onSubmit']>[0]) {
    setSubmitting(true)
    setError(null)
    try {
      await api.post(`/connectors/${kind}/accounts`, body)
      setShowModal(false)
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to connect this account.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDisconnect(id: string) {
    try {
      await api.delete(`/connectors/${kind}/accounts/${id}`)
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to disconnect.')
    }
  }

  async function handleSync(id: string, corpusId: string) {
    try {
      await api.post(`/connectors/${kind}/accounts/${id}/sync?corpus_id=${encodeURIComponent(corpusId)}`)
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Sync failed.')
    }
  }

  return (
    <div className="sv-card cnv-card">
      <div className="sv-card-head">
        <div className="sv-card-brand">
          <div className="sv-brand-icon">{icon}</div>
          <div>
            <div className="sv-brand-name">{title}</div>
            <div className="sv-brand-sub">{subtitle}</div>
          </div>
        </div>
      </div>
      <div className="sv-card-body cnv-stack">
        {error && <div className="cnv-inline-error"><Caution size={13} /> {error}</div>}
        {loading && accounts.length === 0 ? (
          <div className="cnv-note">Loading…</div>
        ) : accounts.length === 0 ? (
          <div className="cnv-note">No account connected yet.</div>
        ) : (
          accounts.map((account) =>
            capability === 'knowledge' ? (
              <ConnectorAccountRow
                key={account.id}
                account={account}
                corpora={corpora}
                onDisconnect={() => void handleDisconnect(account.id)}
                onSync={(corpusId) => void handleSync(account.id, corpusId)}
              />
            ) : (
              <ActionAccountRow
                key={account.id}
                kind={kind}
                account={account}
                onDisconnect={() => void handleDisconnect(account.id)}
              />
            )
          )
        )}
        <button className="cnv-primary-btn" onClick={() => setShowModal(true)}>
          <Plus size={12} /> Connect an account
        </button>
      </div>

      {showModal && (
        <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false) }}>
          <div className="modal-shell">
            <header className="modal-header">
              <h2>Connect {title}</h2>
              <button className="modal-close-btn" onClick={() => setShowModal(false)}>
                <WindowCloseIcon size={16} />
              </button>
            </header>
            {renderConnectForm({ onSubmit: handleConnect, submitting })}
          </div>
        </div>
      )}
    </div>
  )
}

function S3ConnectForm({ onSubmit, submitting }: ConnectFormProps) {
  const [displayName, setDisplayName] = useState('')
  const [bucket, setBucket] = useState('')
  const [region, setRegion] = useState('us-east-1')
  const [endpoint, setEndpoint] = useState('')
  const [prefix, setPrefix] = useState('')
  const [accessKeyId, setAccessKeyId] = useState('')
  const [secretAccessKey, setSecretAccessKey] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    if (!bucket.trim() || !endpoint.trim() || !accessKeyId.trim() || !secretAccessKey.trim()) return
    setError(null)
    try {
      await onSubmit({
        display_name: displayName.trim() || bucket.trim(),
        external_account_id: bucket.trim(),
        access_token: accessKeyId.trim(),
        refresh_token: secretAccessKey.trim(),
        config: { bucket: bucket.trim(), region: region.trim(), endpoint: endpoint.trim(), prefix: prefix.trim() },
      })
    } catch (e: unknown) {
      const err = e as { message?: string }
      setError(err?.message ?? 'Failed to connect.')
    }
  }

  return (
    <>
      <div className="modal-content">
        <div className="modal-field">
          <label>Display name</label>
          <input type="text" placeholder="e.g. Company Docs bucket" value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoFocus />
        </div>
        <div className="modal-field" style={{ marginTop: 12 }}>
          <label>Bucket *</label>
          <input type="text" placeholder="my-bucket" value={bucket} onChange={(e) => setBucket(e.target.value)} />
        </div>
        <div className="modal-field" style={{ marginTop: 12 }}>
          <label>Endpoint *</label>
          <input type="text" placeholder="http://127.0.0.1:9000" value={endpoint} onChange={(e) => setEndpoint(e.target.value)} />
        </div>
        <div className="modal-field" style={{ marginTop: 12 }}>
          <label>Region</label>
          <input type="text" value={region} onChange={(e) => setRegion(e.target.value)} />
        </div>
        <div className="modal-field" style={{ marginTop: 12 }}>
          <label>Key prefix</label>
          <input type="text" placeholder="Optional, e.g. docs/" value={prefix} onChange={(e) => setPrefix(e.target.value)} />
        </div>
        <div className="modal-field" style={{ marginTop: 12 }}>
          <label>Access key ID *</label>
          <input type="text" value={accessKeyId} onChange={(e) => setAccessKeyId(e.target.value)} />
        </div>
        <div className="modal-field" style={{ marginTop: 12 }}>
          <label>Secret access key *</label>
          <input type="password" value={secretAccessKey} onChange={(e) => setSecretAccessKey(e.target.value)} />
        </div>
        {error && <div className="cnv-inline-error" style={{ marginTop: 12 }}><Caution size={13} /> {error}</div>}
      </div>
      <footer className="modal-footer">
        <button className="modal-btn-submit" disabled={submitting} onClick={() => void handleSubmit()}>
          {submitting ? 'Connecting…' : 'Connect'}
        </button>
      </footer>
    </>
  )
}

function TokenConnectForm({ onSubmit, submitting }: ConnectFormProps) {
  const [displayName, setDisplayName] = useState('')
  const [externalId, setExternalId] = useState('')
  const [token, setToken] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    if (!token.trim()) return
    setError(null)
    try {
      await onSubmit({
        display_name: displayName.trim() || 'Demo CRM account',
        external_account_id: externalId.trim(),
        access_token: token.trim(),
      })
    } catch (e: unknown) {
      const err = e as { message?: string }
      setError(err?.message ?? 'Failed to connect.')
    }
  }

  return (
    <>
      <div className="modal-content">
        <div className="modal-field">
          <label>Display name</label>
          <input type="text" placeholder="e.g. Demo CRM" value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoFocus />
        </div>
        <div className="modal-field" style={{ marginTop: 12 }}>
          <label>External account ID</label>
          <input type="text" placeholder="Optional label" value={externalId} onChange={(e) => setExternalId(e.target.value)} />
        </div>
        <div className="modal-field" style={{ marginTop: 12 }}>
          <label>Access token *</label>
          <input type="password" value={token} onChange={(e) => setToken(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSubmit()} />
        </div>
        {error && <div className="cnv-inline-error" style={{ marginTop: 12 }}><Caution size={13} /> {error}</div>}
      </div>
      <footer className="modal-footer">
        <button className="modal-btn-submit" disabled={submitting} onClick={() => void handleSubmit()}>
          {submitting ? 'Connecting…' : 'Connect'}
        </button>
      </footer>
    </>
  )
}

// ─── Shared account rows ────────────────────────────────────────────────────────

function ConnectorAccountRow({
  account,
  corpora,
  onDisconnect,
  onSync,
}: {
  account: ConnectorAccount
  corpora: Corpus[]
  onDisconnect: () => void
  onSync: (corpusId: string) => void
}) {
  const [corpusId, setCorpusId] = useState(corpora[0]?.id ?? '')
  const [syncing, setSyncing] = useState(false)

  return (
    <div className="sv-toggle-row cnv-row">
      <div className="cnv-row-info">
        <div className="sv-setting-label">{account.display_name || account.external_account_id}</div>
        <div className="sv-setting-desc">
          {account.status === 'error' && account.last_error ? account.last_error : account.status}
        </div>
      </div>
      <div className="cnv-row-actions">
        <select className="cnv-corpus-select" value={corpusId} onChange={(e) => setCorpusId(e.target.value)}>
          <option value="" disabled>Select a corpus…</option>
          {corpora.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button
          className="cnv-ghost-btn"
          disabled={!corpusId || syncing}
          onClick={async () => {
            setSyncing(true)
            try { onSync(corpusId) } finally { setSyncing(false) }
          }}
        >
          {syncing ? <LoadingOne size={12} className="spin" /> : 'Sync'}
        </button>
        <button className="cnv-ghost-btn" onClick={onDisconnect}>
          <Close size={12} /> Disconnect
        </button>
      </div>
    </div>
  )
}

function ActionAccountRow({
  kind,
  account,
  onDisconnect,
}: {
  kind: string
  account: ConnectorAccount
  onDisconnect: () => void
}) {
  const [action, setAction] = useState('create_contact')
  const [payload, setPayload] = useState('{\n  "name": "Ada Lovelace",\n  "email": "ada@example.com"\n}')
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<ActionResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleRun() {
    setRunning(true)
    setError(null)
    setResult(null)
    try {
      const parsedPayload = payload.trim() ? JSON.parse(payload) : {}
      const res = await api.post<ActionResult>(`/connectors/${kind}/accounts/${account.id}/act`, {
        action: action.trim(),
        payload: parsedPayload,
      })
      setResult(res)
    } catch (e: unknown) {
      if (e instanceof SyntaxError) {
        setError('Payload is not valid JSON.')
      } else {
        const err = e as { message?: string }
        setError(err?.message ?? 'Action failed.')
      }
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="cnv-action-row">
      <div className="sv-toggle-row cnv-row">
        <div className="cnv-row-info">
          <div className="sv-setting-label">{account.display_name || account.external_account_id}</div>
          <div className="sv-setting-desc">
            {account.status === 'error' && account.last_error ? account.last_error : account.status}
          </div>
        </div>
        <button className="cnv-ghost-btn" onClick={onDisconnect}>
          <Close size={12} /> Disconnect
        </button>
      </div>
      <div className="cnv-action-form">
        <input
          type="text"
          className="cnv-action-name"
          placeholder="action name, e.g. create_contact"
          value={action}
          onChange={(e) => setAction(e.target.value)}
        />
        <textarea
          className="cnv-action-payload"
          rows={4}
          value={payload}
          onChange={(e) => setPayload(e.target.value)}
          spellCheck={false}
        />
        <button className="cnv-primary-btn" disabled={!action.trim() || running} onClick={() => void handleRun()}>
          {running ? <LoadingOne size={12} className="spin" /> : 'Run'}
        </button>
        {error && <div className="cnv-inline-error"><Caution size={13} /> {error}</div>}
        {result && (
          <pre className={`cnv-result ${result.Success ? 'cnv-result-ok' : 'cnv-result-fail'}`}>
            {JSON.stringify(result, null, 2)}
          </pre>
        )}
      </div>
    </div>
  )
}

const CONNECTORS_CSS = `
.cnv-card { margin-bottom: 24px; }
.cnv-stack { display: flex; flex-direction: column; gap: 12px; }
.cnv-note { color: var(--color-text-secondary); font-size: 12px; line-height: 1.6; }
.cnv-row-info { min-width: 0; }
.cnv-row { align-items: center; gap: 12px; flex-wrap: wrap; }
.cnv-row-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.cnv-corpus-select {
  border: 1px solid var(--color-border);
  background: var(--color-bg-secondary);
  color: var(--color-text);
  border-radius: 7px;
  padding: 6px 8px;
  font-size: 11px;
  font-family: inherit;
  max-width: 160px;
}
.cnv-primary-btn,
.cnv-ghost-btn {
  border: 1px solid var(--color-border);
  font-size: 11px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  cursor: pointer;
  padding: 7px 12px;
  border-radius: 7px;
  font-family: inherit;
  flex-shrink: 0;
}
.cnv-primary-btn { width: fit-content; border: none; background: var(--color-cta); color: white; }
.cnv-ghost-btn { background: transparent; color: var(--color-text-secondary); }
.cnv-ghost-btn:hover:not(:disabled) { background: var(--color-hover); color: var(--color-text); }
.cnv-primary-btn:disabled,
.cnv-ghost-btn:disabled { opacity: 0.45; cursor: default; }
.cnv-inline-error {
  display: flex;
  align-items: center;
  gap: 6px;
  border: 1px solid rgba(var(--color-error-rgb), 0.35);
  background: rgba(var(--color-error-rgb), 0.1);
  color: var(--color-error);
  border-radius: 8px;
  padding: 8px 9px;
  font-size: 11px;
  line-height: 1.5;
}
.cnv-action-row {
  display: flex;
  flex-direction: column;
  gap: 10px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 10px;
}
.cnv-action-row .cnv-row { border: none; padding: 0; }
.cnv-action-form { display: flex; flex-direction: column; gap: 8px; }
.cnv-action-name,
.cnv-action-payload {
  border: 1px solid var(--color-border);
  background: var(--color-bg-secondary);
  color: var(--color-text);
  border-radius: 7px;
  padding: 8px 9px;
  font-size: 12px;
  font-family: inherit;
}
.cnv-action-payload { font-family: ui-monospace, SFMono-Regular, monospace; resize: vertical; }
.cnv-result {
  border-radius: 8px;
  padding: 10px;
  font-size: 11px;
  font-family: ui-monospace, SFMono-Regular, monospace;
  overflow-x: auto;
  white-space: pre-wrap;
  margin: 0;
}
.cnv-result-ok { border: 1px solid rgba(var(--color-success-rgb), 0.35); background: rgba(var(--color-success-rgb), 0.08); }
.cnv-result-fail { border: 1px solid rgba(var(--color-error-rgb), 0.35); background: rgba(var(--color-error-rgb), 0.08); }
`
