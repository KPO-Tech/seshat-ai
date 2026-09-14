import { useState, useEffect, useCallback, useRef } from 'react'
import { FolderClose, CloudStorage, Share, Plus, Close, LoadingOne, Caution } from '@icon-park/react'
import { api, ApiError } from '@/api/client'
import { WindowCloseIcon } from '@/components/ui/WindowControlIcon'
import type { Corpus, ConnectorAccount } from '@/api/types'

// Knowledge-capability connector cards (Drive/SharePoint OAuth, generic
// static-credential connect for s3/azureblob), shared between the Knowledge
// app's Sources page (apps/knowledge/components/SourcesWorkspace.tsx) and
// the global Settings > Connectors tab (pages/settings/ConnectorsView.tsx) -
// extracted from ConnectorsView.tsx so neither place has to keep its own
// copy of this OAuth-poll/connect-form logic. Action-capability pieces
// (ActionAccountRow and the demo-crm form) stay in ConnectorsView.tsx -
// Sources only ever deals in knowledge-capability accounts.

export type ConnectFormProps = {
  onSubmit: (body: {
    display_name: string
    external_account_id: string
    access_token: string
    refresh_token?: string
    config?: Record<string, unknown>
  }) => Promise<void>
  submitting: boolean
}

// ─── Google Drive card (OAuth) ─────────────────────────────────────────────

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

export function DriveConnectorCard({ corpora, lockedCorpusId }: { corpora: Corpus[]; lockedCorpusId?: string }) {
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
    <div className={CARD_CSS}>
      <div className={CARD_HEAD_CSS}>
        <div className={CARD_BRAND_CSS}>
          <div className={BRAND_ICON_CSS}><FolderClose size={15} /></div>
          <div>
            <div className={BRAND_NAME_CSS}>Google Drive</div>
            <div className={BRAND_SUB_CSS}>Sync business documents (PDF, Word, PowerPoint, text) into a corpus</div>
          </div>
        </div>
      </div>
      <div className={CARD_BODY_CSS}>
        {error && <div className={INLINE_ERROR_CSS}><Caution size={13} /> {error}</div>}
        {loading && accounts.length === 0 ? (
          <div className={NOTE_CSS}>Loading…</div>
        ) : accounts.length === 0 ? (
          <div className={NOTE_CSS}>No Google Drive account connected yet.</div>
        ) : (
          accounts.map((account) => (
            <ConnectorAccountRow
              key={account.id}
              account={account}
              corpora={corpora}
              lockedCorpusId={lockedCorpusId}
              onDisconnect={() => void handleDisconnect(account.id)}
              onSync={(corpusId) => void handleSync(account.id, corpusId)}
            />
          ))
        )}
        <button className={PRIMARY_BTN_CSS} onClick={() => void handleConnect()} disabled={connecting}>
          {connecting ? <LoadingOne size={12} className="animate-spin" /> : <Plus size={12} />}
          {connecting ? 'Waiting for Google sign-in…' : 'Connect a Google Drive account'}
        </button>
      </div>
    </div>
  )
}

// ─── SharePoint card (OAuth) ────────────────────────────────────────────────
//
// Same OAuth-poll shape as DriveConnectorCard above (a second copy rather
// than extracting a shared component — Drive's own routes stay untouched
// by design, see helps/roadmap.md, and duplicating ~60 lines once costs
// less than a generic abstraction would for exactly two current OAuth
// connectors), but list/disconnect/sync go through the SAME generic
// /connectors/sharepoint/... routes StaticAccountConnectorCard uses below —
// only oauth/start is a dedicated SharePoint route (the generic
// POST /connectors/{kind}/accounts is a manual static-token connect, not
// an authorization-code flow).

export function SharePointConnectorCard({ corpora, lockedCorpusId }: { corpora: Corpus[]; lockedCorpusId?: string }) {
  const [accounts, setAccounts] = useState<ConnectorAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get<{ accounts: ConnectorAccount[] }>('/connectors/sharepoint/accounts')
      setAccounts(res.accounts ?? [])
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to load SharePoint accounts.')
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
      const started = await api.post<{ authorization_url: string }>('/knowledge/connectors/sharepoint/oauth/start')
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
          const res = await api.get<{ accounts: ConnectorAccount[] }>('/connectors/sharepoint/accounts')
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
      setError(err instanceof ApiError ? err.message : 'Unable to start the SharePoint connection.')
      setConnecting(false)
    }
  }

  async function handleDisconnect(id: string) {
    try {
      await api.delete(`/connectors/sharepoint/accounts/${id}`)
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to disconnect.')
    }
  }

  async function handleSync(id: string, corpusId: string) {
    try {
      await api.post(`/connectors/sharepoint/accounts/${id}/sync?corpus_id=${encodeURIComponent(corpusId)}`)
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Sync failed.')
    }
  }

  return (
    <div className={CARD_CSS}>
      <div className={CARD_HEAD_CSS}>
        <div className={CARD_BRAND_CSS}>
          <div className={BRAND_ICON_CSS}><Share size={15} /></div>
          <div>
            <div className={BRAND_NAME_CSS}>SharePoint</div>
            <div className={BRAND_SUB_CSS}>Sync business documents (PDF, Word, PowerPoint, text) into a corpus</div>
          </div>
        </div>
      </div>
      <div className={CARD_BODY_CSS}>
        {error && <div className={INLINE_ERROR_CSS}><Caution size={13} /> {error}</div>}
        {loading && accounts.length === 0 ? (
          <div className={NOTE_CSS}>Loading…</div>
        ) : accounts.length === 0 ? (
          <div className={NOTE_CSS}>No SharePoint account connected yet.</div>
        ) : (
          accounts.map((account) => (
            <ConnectorAccountRow
              key={account.id}
              account={account}
              corpora={corpora}
              lockedCorpusId={lockedCorpusId}
              onDisconnect={() => void handleDisconnect(account.id)}
              onSync={(corpusId) => void handleSync(account.id, corpusId)}
            />
          ))
        )}
        <button className={PRIMARY_BTN_CSS} onClick={() => void handleConnect()} disabled={connecting}>
          {connecting ? <LoadingOne size={12} className="animate-spin" /> : <Plus size={12} />}
          {connecting ? 'Waiting for Microsoft sign-in…' : 'Connect a SharePoint account'}
        </button>
      </div>
    </div>
  )
}

// ─── Generic static-credential connector card (S3, Azure Blob, ...) ───────

export function StaticAccountConnectorCard({
  kind,
  title,
  subtitle,
  icon,
  corpora,
  lockedCorpusId,
  renderConnectForm,
}: {
  kind: string
  title: string
  subtitle: string
  icon: React.ReactNode
  corpora: Corpus[]
  lockedCorpusId?: string
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
            <ConnectorAccountRow
              key={account.id}
              account={account}
              corpora={corpora}
              lockedCorpusId={lockedCorpusId}
              onDisconnect={() => void handleDisconnect(account.id)}
              onSync={(corpusId) => void handleSync(account.id, corpusId)}
            />
          ))
        )}
        <button className={PRIMARY_BTN_CSS} onClick={() => setShowModal(true)}>
          <Plus size={12} /> Connect an account
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
            {renderConnectForm({ onSubmit: handleConnect, submitting })}
          </div>
        </div>
      )}
    </div>
  )
}

export function S3ConnectForm({ onSubmit, submitting }: ConnectFormProps) {
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
      <div className={MODAL_CONTENT_CSS}>
        <div className={FIELD_CSS}>
          <label className={FIELD_LABEL_CSS}>Display name</label>
          <input className={FIELD_INPUT_CSS} type="text" placeholder="e.g. Company Docs bucket" value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoFocus />
        </div>
        <div className={FIELD_CSS}>
          <label className={FIELD_LABEL_CSS}>Bucket *</label>
          <input className={FIELD_INPUT_CSS} type="text" placeholder="my-bucket" value={bucket} onChange={(e) => setBucket(e.target.value)} />
        </div>
        <div className={FIELD_CSS}>
          <label className={FIELD_LABEL_CSS}>Endpoint *</label>
          <input className={FIELD_INPUT_CSS} type="text" placeholder="http://127.0.0.1:9000" value={endpoint} onChange={(e) => setEndpoint(e.target.value)} />
        </div>
        <div className={FIELD_CSS}>
          <label className={FIELD_LABEL_CSS}>Region</label>
          <input className={FIELD_INPUT_CSS} type="text" value={region} onChange={(e) => setRegion(e.target.value)} />
        </div>
        <div className={FIELD_CSS}>
          <label className={FIELD_LABEL_CSS}>Key prefix</label>
          <input className={FIELD_INPUT_CSS} type="text" placeholder="Optional, e.g. docs/" value={prefix} onChange={(e) => setPrefix(e.target.value)} />
        </div>
        <div className={FIELD_CSS}>
          <label className={FIELD_LABEL_CSS}>Access key ID *</label>
          <input className={FIELD_INPUT_CSS} type="text" value={accessKeyId} onChange={(e) => setAccessKeyId(e.target.value)} />
        </div>
        <div className={FIELD_CSS}>
          <label className={FIELD_LABEL_CSS}>Secret access key *</label>
          <input className={FIELD_INPUT_CSS} type="password" value={secretAccessKey} onChange={(e) => setSecretAccessKey(e.target.value)} />
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

// AzureBlobAccountConfig shape (account_name/container/prefix) mirrors
// seshat-core/connectors.AzureBlobAccountConfig exactly - the account key
// itself is the one secret, carried as access_token like S3's access key id,
// with no refresh_token (Azure Blob has a single static credential, not a
// key pair).
export function AzureBlobConnectForm({ onSubmit, submitting }: ConnectFormProps) {
  const [displayName, setDisplayName] = useState('')
  const [accountName, setAccountName] = useState('')
  const [container, setContainer] = useState('')
  const [prefix, setPrefix] = useState('')
  const [accountKey, setAccountKey] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    if (!accountName.trim() || !container.trim() || !accountKey.trim()) return
    setError(null)
    try {
      await onSubmit({
        display_name: displayName.trim() || container.trim(),
        external_account_id: container.trim(),
        access_token: accountKey.trim(),
        config: { account_name: accountName.trim(), container: container.trim(), prefix: prefix.trim() },
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
          <input className={FIELD_INPUT_CSS} type="text" placeholder="e.g. Company Docs container" value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoFocus />
        </div>
        <div className={FIELD_CSS}>
          <label className={FIELD_LABEL_CSS}>Storage account name *</label>
          <input className={FIELD_INPUT_CSS} type="text" placeholder="mystorageaccount" value={accountName} onChange={(e) => setAccountName(e.target.value)} />
        </div>
        <div className={FIELD_CSS}>
          <label className={FIELD_LABEL_CSS}>Container *</label>
          <input className={FIELD_INPUT_CSS} type="text" placeholder="documents" value={container} onChange={(e) => setContainer(e.target.value)} />
        </div>
        <div className={FIELD_CSS}>
          <label className={FIELD_LABEL_CSS}>Prefix</label>
          <input className={FIELD_INPUT_CSS} type="text" placeholder="Optional, e.g. docs/" value={prefix} onChange={(e) => setPrefix(e.target.value)} />
        </div>
        <div className={FIELD_CSS}>
          <label className={FIELD_LABEL_CSS}>Account key *</label>
          <input className={FIELD_INPUT_CSS} type="password" value={accountKey} onChange={(e) => setAccountKey(e.target.value)} />
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

// ─── Shared account row (knowledge capability: sync + disconnect) ─────────

export function ConnectorAccountRow({
  account,
  corpora,
  lockedCorpusId,
  onDisconnect,
  onSync,
}: {
  account: ConnectorAccount
  corpora: Corpus[]
  // When set, this row is already inside a single-corpus context (e.g. the
  // Knowledge Sources page, itself scoped to one corpus at a time) - skip
  // the cross-corpus dropdown and sync straight against it. Omitted in
  // Settings > Connectors, which isn't corpus-scoped and still needs the
  // picker.
  lockedCorpusId?: string
  onDisconnect: () => void
  onSync: (corpusId: string) => void
}) {
  const [corpusId, setCorpusId] = useState(corpora[0]?.id ?? '')
  const [syncing, setSyncing] = useState(false)
  const effectiveCorpusId = lockedCorpusId ?? corpusId

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-[var(--color-border)] bg-app-surface px-3 py-[9px]">
      <div className="min-w-0">
        <div className="text-sm font-semibold text-app-text">{account.display_name || account.external_account_id}</div>
        <div className="mt-0.5 text-[var(--font-size-2xs)] text-app-text-muted">
          {account.status === 'error' && account.last_error ? account.last_error : account.status}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {!lockedCorpusId && (
          <select
            className="max-w-40 rounded-[7px] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-2 py-1.5 font-inherit text-[11px] text-app-text"
            value={corpusId}
            onChange={(e) => setCorpusId(e.target.value)}
          >
            <option value="" disabled>Select a corpus…</option>
            {corpora.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
        <button
          className={GHOST_BTN_CSS}
          disabled={!effectiveCorpusId || syncing}
          onClick={async () => {
            setSyncing(true)
            try { onSync(effectiveCorpusId) } finally { setSyncing(false) }
          }}
        >
          {syncing ? <LoadingOne size={12} className="animate-spin" /> : 'Sync'}
        </button>
        <button className={GHOST_BTN_CSS} onClick={onDisconnect}>
          <Close size={12} /> Disconnect
        </button>
      </div>
    </div>
  )
}

export { CloudStorage }
