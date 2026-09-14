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
function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

const CARD_CSS = 'mb-6 shrink-0 overflow-hidden rounded-xl border-[1.5px] border-[var(--color-border)] bg-app-bg transition-colors duration-200 focus-within:border-[var(--color-primary)]'
const CARD_HEAD_CSS = 'border-b border-[var(--color-border)] bg-app-surface px-4 py-3.5'
const CARD_BRAND_CSS = 'flex items-center gap-2.5'
const BRAND_ICON_CSS = 'flex size-8 items-center justify-center rounded-lg border border-[var(--color-border)] bg-app-bg text-[var(--color-primary)]'
const BRAND_NAME_CSS = 'text-sm font-bold text-app-text'
const BRAND_SUB_CSS = 'text-[var(--font-size-2xs)] text-app-text-muted'
const CARD_BODY_CSS = 'flex flex-col gap-3 p-4'
const NOTE_CSS = 'text-[12px] leading-[1.6] text-app-text-secondary'
const INLINE_ERROR_CSS = 'flex items-center gap-1.5 rounded-lg border border-[rgba(var(--color-error-rgb),0.35)] bg-[rgba(var(--color-error-rgb),0.1)] px-[9px] py-2 text-[11px] leading-[1.5] text-app-error'
const PRIMARY_BTN_CSS = 'inline-flex w-fit shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-[7px] border-0 bg-[var(--color-cta)] px-3 py-[7px] font-inherit text-[11px] font-bold text-white disabled:cursor-default disabled:opacity-45'
const GHOST_BTN_CSS = 'inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-[7px] border border-[var(--color-border)] bg-transparent px-3 py-[7px] font-inherit text-[11px] font-bold text-app-text-secondary hover:bg-[var(--color-hover)] hover:text-app-text disabled:cursor-default disabled:opacity-45'
const MODAL_BACKDROP_CSS = 'fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 p-6 [backdrop-filter:blur(2px)]'
const MODAL_SHELL_CSS = 'flex max-h-[calc(100vh-48px)] w-full max-w-[560px] animate-[slide-up_0.3s_ease-out] flex-col overflow-hidden rounded-[14px] bg-app-bg shadow-[0_30px_80px_rgba(0,0,0,0.2)]'
const MODAL_HEADER_CSS = 'flex shrink-0 items-center justify-between border-b border-[var(--color-border)] px-[18px] py-3.5'
const MODAL_CONTENT_CSS = 'min-h-0 flex-1 overflow-y-auto px-[18px] py-4'
const MODAL_FOOTER_CSS = 'flex shrink-0 justify-end gap-2 border-t border-[var(--color-border)] px-[18px] py-3'
const MODAL_SUBMIT_CSS = 'cursor-pointer rounded-lg border-0 bg-[var(--color-cta)] px-4 py-[7px] text-[var(--font-size-xs)] font-bold text-white disabled:cursor-not-allowed disabled:opacity-50'
const FIELD_CSS = 'mt-3 first:mt-0'
const FIELD_LABEL_CSS = 'mb-2 block text-sm font-bold text-app-text'
const FIELD_INPUT_CSS = 'w-full rounded-[10px] border-[1.5px] border-[var(--color-border)] bg-app-surface px-3 py-[9px] font-inherit text-sm text-app-text outline-none focus:border-[var(--color-primary)]'

export function ConnectorsView() {
  const [corpora, setCorpora] = useState<Corpus[]>([])

  useEffect(() => {
    api.get<{ corpora: Corpus[] }>('/corpora').then((res) => setCorpora(res.corpora ?? [])).catch(() => {})
  }, [])

  return (
    <div className="sv-view">
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
    <div className={CARD_CSS}>
      <div className={CARD_HEAD_CSS}>
        <div className={CARD_BRAND_CSS}>
          <div className={BRAND_ICON_CSS}>{icon}</div>
          <div>
            <div className={BRAND_NAME_CSS}>{title}</div>
            <div className={BRAND_SUB_CSS}>{subtitle}</div>
          </div>
        </div>
      </div>
      <div className={CARD_BODY_CSS}>
        {error && <div className={INLINE_ERROR_CSS}><Caution size={13} /> {error}</div>}
        {loading && accounts.length === 0 ? (
          <div className={NOTE_CSS}>Loading…</div>
        ) : accounts.length === 0 ? (
          <div className={NOTE_CSS}>No account connected yet.</div>
        ) : (
          accounts.map((account) => (
            <ActionAccountRow key={account.id} kind={kind} account={account} onDisconnect={() => void handleDisconnect(account.id)} />
          ))
        )}
        <button className={PRIMARY_BTN_CSS} onClick={() => setShowModal(true)}>
          Connect an account
        </button>
      </div>

      {showModal && (
        <div className={MODAL_BACKDROP_CSS} onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false) }}>
          <div className={MODAL_SHELL_CSS}>
            <header className={MODAL_HEADER_CSS}>
              <h2 className="m-0 text-lg font-bold text-app-text">Connect {title}</h2>
              <button className="flex cursor-pointer border-0 bg-transparent text-app-text-muted" onClick={() => setShowModal(false)}>
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
      <div className={MODAL_CONTENT_CSS}>
        <div className={FIELD_CSS}>
          <label className={FIELD_LABEL_CSS}>Display name</label>
          <input className={FIELD_INPUT_CSS} type="text" placeholder="e.g. Demo CRM" value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoFocus />
        </div>
        <div className={FIELD_CSS}>
          <label className={FIELD_LABEL_CSS}>External account ID</label>
          <input className={FIELD_INPUT_CSS} type="text" placeholder="Optional label" value={externalId} onChange={(e) => setExternalId(e.target.value)} />
        </div>
        <div className={FIELD_CSS}>
          <label className={FIELD_LABEL_CSS}>Access token *</label>
          <input className={FIELD_INPUT_CSS} type="password" value={token} onChange={(e) => setToken(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSubmit()} />
        </div>
        {error && <div className={cx(INLINE_ERROR_CSS, 'mt-3')}><Caution size={13} /> {error}</div>}
      </div>
      <footer className={MODAL_FOOTER_CSS}>
        <button className={MODAL_SUBMIT_CSS} disabled={submitting} onClick={() => void handleSubmit()}>
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
    <div className="flex flex-col gap-2.5 rounded-[10px] border border-[var(--color-border)] p-2.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-app-text">{account.display_name || account.external_account_id}</div>
          <div className="mt-0.5 text-[var(--font-size-2xs)] text-app-text-muted">
            {account.status === 'error' && account.last_error ? account.last_error : account.status}
          </div>
        </div>
        <button className={GHOST_BTN_CSS} onClick={onDisconnect}>
          <Close size={12} /> Disconnect
        </button>
      </div>
      <div className="flex flex-col gap-2">
        <input
          type="text"
          className="rounded-[7px] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-[9px] py-2 font-inherit text-[12px] text-app-text"
          placeholder="action name, e.g. create_contact"
          value={action}
          onChange={(e) => setAction(e.target.value)}
        />
        <textarea
          className="resize-y rounded-[7px] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-[9px] py-2 font-mono text-[12px] text-app-text"
          rows={4}
          value={payload}
          onChange={(e) => setPayload(e.target.value)}
          spellCheck={false}
        />
        <button className={PRIMARY_BTN_CSS} disabled={!action.trim() || running} onClick={() => void handleRun()}>
          {running ? <LoadingOne size={12} className="animate-spin" /> : 'Run'}
        </button>
        {error && <div className={INLINE_ERROR_CSS}><Caution size={13} /> {error}</div>}
        {result && (
          <pre className={cx(
            'm-0 overflow-x-auto whitespace-pre-wrap rounded-lg p-2.5 font-mono text-[11px]',
            result.Success
              ? 'border border-[rgba(var(--color-success-rgb),0.35)] bg-[rgba(var(--color-success-rgb),0.08)]'
              : 'border border-[rgba(var(--color-error-rgb),0.35)] bg-[rgba(var(--color-error-rgb),0.08)]',
          )}>
            {JSON.stringify(result, null, 2)}
          </pre>
        )}
      </div>
    </div>
  )
}
