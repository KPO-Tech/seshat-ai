import { useState, useEffect } from 'react'
import { Send, Close, LoadingOne, Caution } from '@icon-park/react'
import { api, ApiError } from '@/api/client'
import { WindowCloseIcon } from '@/components/ui/WindowControlIcon'
import type { Corpus, ConnectorAccount, ActionResult } from '@/api/types'
import {
  DriveConnectorCard,
  SharePointConnectorCard,
  StaticAccountConnectorCard,
  S3ConnectForm,
  CloudStorage,
  KNOWLEDGE_CONNECTOR_CARDS_CSS,
} from '@/components/connectors/KnowledgeConnectorCards'

// ConnectorsView is the unified catalog for internal/connector-based
// integrations (seshat-ai roadmap Phase 3, "catalogue de connecteurs
// unifié") - distinct from McpView (raw MCP server config, no account/
// Discover/Sync/Act shape) and ConnectionsView (internal/inbox's own,
// older messaging-connector concept). Three concrete connectors are known
// here by name, same as the backend never built a dynamic connector-kind
// registry either - proportionate for proving the catalog concept works,
// not a plugin system. The knowledge-capability cards (Drive/SharePoint/S3)
// live in components/connectors/KnowledgeConnectorCards.tsx, shared with
// the Knowledge app's Sources page - only the action-capability piece
// (ActionAccountRow/TokenConnectForm, below) is specific to this view.
export function ConnectorsView() {
  const [corpora, setCorpora] = useState<Corpus[]>([])

  useEffect(() => {
    api.get<{ corpora: Corpus[] }>('/corpora').then((res) => setCorpora(res.corpora ?? [])).catch(() => {})
  }, [])

  return (
    <div className="sv-view">
      <style>{KNOWLEDGE_CONNECTOR_CARDS_CSS}</style>
      <style>{CONNECTORS_CSS}</style>
      <header className="sv-view-header">
        <div className="sv-header-info">
          <h1>Connectors</h1>
          <p>External Knowledge and Action integrations, built on the shared connector framework.</p>
        </div>
      </header>

      <DriveConnectorCard corpora={corpora} />
      <SharePointConnectorCard corpora={corpora} />
      <StaticAccountConnectorCard
        kind="s3"
        title="S3-compatible storage"
        subtitle="Sync business documents from a bucket (AWS S3, MinIO, R2, Backblaze) into a corpus"
        icon={<CloudStorage size={15} />}
        corpora={corpora}
        renderConnectForm={(props) => <S3ConnectForm {...props} />}
      />
      <ActionConnectorCard
        kind="mcp:demo-crm"
        title="Demo CRM (Action via MCP)"
        subtitle="Run a named action against the demo-crm-mcp server through a connected account"
        icon={<Send size={15} />}
      />
    </div>
  )
}

// ─── Action-capability connector card (kept local: distinct Act semantics,
// no corpus/sync concept, not needed by the Knowledge Sources page) ───────

function ActionConnectorCard({
  kind,
  title,
  subtitle,
  icon,
}: {
  kind: string
  title: string
  subtitle: string
  icon: React.ReactNode
}) {
  const [accounts, setAccounts] = useState<ConnectorAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const res = await api.get<{ accounts: ConnectorAccount[] }>(`/connectors/${kind}/accounts`)
      setAccounts(res.accounts ?? [])
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Unable to load ${title} accounts.`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  async function handleConnect(body: { display_name: string; external_account_id: string; access_token: string }) {
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
          accounts.map((account) => (
            <ActionAccountRow key={account.id} kind={kind} account={account} onDisconnect={() => void handleDisconnect(account.id)} />
          ))
        )}
        <button className="cnv-primary-btn" onClick={() => setShowModal(true)}>
          Connect an account
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
            <TokenConnectForm onSubmit={handleConnect} submitting={submitting} />
          </div>
        </div>
      )}
    </div>
  )
}

// ConnectFormProps for the local action-only form below - a small subset
// of the shared module's shape (no refresh_token/config, mcp/action's demo
// connector only ever needs one static token).
type ConnectFormProps = {
  onSubmit: (body: { display_name: string; external_account_id: string; access_token: string }) => Promise<void>
  submitting: boolean
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

// ─── Action-capability account row (kept local; ConnectorAccountRow, the
// knowledge-capability equivalent, lives in the shared module) ────────────

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

// CONNECTORS_CSS carries only the action-capability rules now -
// KNOWLEDGE_CONNECTOR_CARDS_CSS (imported above) already provides
// .cnv-card/.cnv-stack/.cnv-note/.cnv-row*/.cnv-primary-btn/.cnv-ghost-btn/
// .cnv-inline-error, shared with the Knowledge Sources page.
const CONNECTORS_CSS = `
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
