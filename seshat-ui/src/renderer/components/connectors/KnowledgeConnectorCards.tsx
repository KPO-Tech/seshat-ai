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
              lockedCorpusId={lockedCorpusId}
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
    <div className="sv-card cnv-card">
      <div className="sv-card-head">
        <div className="sv-card-brand">
          <div className="sv-brand-icon"><Share size={15} /></div>
          <div>
            <div className="sv-brand-name">SharePoint</div>
            <div className="sv-brand-sub">Sync business documents (PDF, Word, PowerPoint, text) into a corpus</div>
          </div>
        </div>
      </div>
      <div className="sv-card-body cnv-stack">
        {error && <div className="cnv-inline-error"><Caution size={13} /> {error}</div>}
        {loading && accounts.length === 0 ? (
          <div className="cnv-note">Loading…</div>
        ) : accounts.length === 0 ? (
          <div className="cnv-note">No SharePoint account connected yet.</div>
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
        <button className="cnv-primary-btn" onClick={() => void handleConnect()} disabled={connecting}>
          {connecting ? <LoadingOne size={12} className="spin" /> : <Plus size={12} />}
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
      <div className="modal-content">
        <div className="modal-field">
          <label>Display name</label>
          <input type="text" placeholder="e.g. Company Docs container" value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoFocus />
        </div>
        <div className="modal-field" style={{ marginTop: 12 }}>
          <label>Storage account name *</label>
          <input type="text" placeholder="mystorageaccount" value={accountName} onChange={(e) => setAccountName(e.target.value)} />
        </div>
        <div className="modal-field" style={{ marginTop: 12 }}>
          <label>Container *</label>
          <input type="text" placeholder="documents" value={container} onChange={(e) => setContainer(e.target.value)} />
        </div>
        <div className="modal-field" style={{ marginTop: 12 }}>
          <label>Prefix</label>
          <input type="text" placeholder="Optional, e.g. docs/" value={prefix} onChange={(e) => setPrefix(e.target.value)} />
        </div>
        <div className="modal-field" style={{ marginTop: 12 }}>
          <label>Account key *</label>
          <input type="password" value={accountKey} onChange={(e) => setAccountKey(e.target.value)} />
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
    <div className="sv-toggle-row cnv-row">
      <div className="cnv-row-info">
        <div className="sv-setting-label">{account.display_name || account.external_account_id}</div>
        <div className="sv-setting-desc">
          {account.status === 'error' && account.last_error ? account.last_error : account.status}
        </div>
      </div>
      <div className="cnv-row-actions">
        {!lockedCorpusId && (
          <select className="cnv-corpus-select" value={corpusId} onChange={(e) => setCorpusId(e.target.value)}>
            <option value="" disabled>Select a corpus…</option>
            {corpora.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
        <button
          className="cnv-ghost-btn"
          disabled={!effectiveCorpusId || syncing}
          onClick={async () => {
            setSyncing(true)
            try { onSync(effectiveCorpusId) } finally { setSyncing(false) }
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

// Base card/modal chrome (.sv-card, .sv-toggle-row, .modal-*) is normally
// provided by Settings' own shared stylesheet (SettingsNav.tsx) - ported
// here too (same rules, kept in sync manually) so these cards render
// correctly wherever they're used, including the Knowledge app's Sources
// page, which never loads Settings' stylesheet.
export const KNOWLEDGE_CONNECTOR_CARDS_CSS = `
.sv-card {
  background: var(--color-bg);
  border: 1.5px solid var(--color-border);
  border-radius: 12px;
  overflow: hidden;
  transition: border-color 0.2s;
  flex-shrink: 0;
}
.sv-card:focus-within { border-color: var(--color-primary); }
.sv-card-head {
  padding: 14px 16px;
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
}
.sv-card-brand { display: flex; align-items: center; gap: 10px; }
.sv-brand-icon {
  width: 32px;
  height: 32px;
  background: var(--color-bg);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-primary);
  border: 1px solid var(--color-border);
}
.sv-brand-name { font-weight: 700; font-size: var(--font-size-sm); }
.sv-brand-sub { font-size: var(--font-size-2xs); color: var(--color-text-muted); }
.sv-card-body { padding: 16px; display: flex; flex-direction: column; gap: 14px; }
.sv-toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 9px 12px;
  background: var(--color-surface);
  border-radius: 10px;
  border: 1px solid var(--color-border);
}
.sv-setting-label { font-size: var(--font-size-sm); font-weight: 600; color: var(--color-text); }
.sv-setting-desc { font-size: var(--font-size-2xs); color: var(--color-text-muted); margin-top: 2px; }
.modal-backdrop {
  position: fixed; inset: 0; background: rgba(0,0,0,0.4);
  display: flex; align-items: center; justify-content: center;
  z-index: 1000; backdrop-filter: blur(2px);
  padding: 24px; box-sizing: border-box;
}
.modal-shell {
  background: var(--color-bg); width: 100%; max-width: 560px;
  border-radius: 14px; box-shadow: 0 30px 80px rgba(0,0,0,0.2);
  animation: slide-up 0.3s ease-out;
  display: flex; flex-direction: column;
  max-height: calc(100vh - 48px); overflow: hidden;
}
.modal-header {
  padding: 14px 18px; display: flex; align-items: center;
  justify-content: space-between; border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}
.modal-header h2 { font-size: var(--font-size-lg); margin: 0; font-weight: 700; color: var(--color-text); }
.modal-close-btn { background: none; border: none; color: var(--color-text-muted); cursor: pointer; display: flex; }
.modal-content { padding: 16px 18px; overflow-y: auto; flex: 1; min-height: 0; }
.modal-field label { display: block; font-size: var(--font-size-sm); font-weight: 700; margin-bottom: 8px; color: var(--color-text); }
.modal-field input, .modal-field textarea { width: 100%; background: var(--color-surface); border: 1.5px solid var(--color-border); padding: 9px 12px; border-radius: 10px; color: var(--color-text); font-size: var(--font-size-sm); outline: none; font-family: inherit; }
.modal-field input:focus, .modal-field textarea:focus { border-color: var(--color-primary); }
.modal-footer {
  padding: 12px 18px; display: flex; justify-content: flex-end; gap: 8px;
  border-top: 1px solid var(--color-border); flex-shrink: 0;
}
.modal-btn-submit { background: var(--color-cta); color: white; border: none; padding: 7px 16px; border-radius: 8px; font-weight: 700; cursor: pointer; font-size: var(--font-size-xs); }
.modal-btn-submit:disabled { opacity: 0.5; cursor: not-allowed; }
@keyframes slide-up { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
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
`

export { CloudStorage }
