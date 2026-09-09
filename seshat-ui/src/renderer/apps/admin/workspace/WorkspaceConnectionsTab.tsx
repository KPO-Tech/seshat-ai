import { useEffect, useMemo, useRef, useState } from 'react'
import { CheckOne, Close, LoadingOne } from '@icon-park/react'
import {
  OAUTH_CONNECTOR_KINDS, STATIC_CONNECTOR_KINDS, CONNECTOR_KIND_LABELS,
  type AnyConnectorKind,
} from '@seshat/connector-catalog'
import { api, ApiError } from '@/api/client'

// Mirrors the subset of seshat-server's connectors.ConnectorAccount (via
// seshat-backend's own cloudconnectors.ConnectorAccount mirror) this tab
// needs - see internal/cloud/connectors/types.go on the seshat-backend side.
type ConnectorAccount = {
  id: string
  kind: string
  display_name: string
  status: string
  last_error?: string
}

// Workspace → Connections (the self-service counterpart to Admin Console's
// own Connectors tab, which registers an organization's OAuth app once per
// service - AdminConnectorsView.tsx). Any org member connects their own
// account here against whichever app the organization already registered.
// No organization_id is sent from here at all - seshat-backend injects it
// server-side from the local session, same convention
// pages/settings/ConnectorsView.tsx's own gdrive/sharepoint connect flow
// already follows.
export function WorkspaceConnectionsTab() {
  const [accounts, setAccounts] = useState<ConnectorAccount[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [connectingKind, setConnectingKind] = useState<string | null>(null)
  const [staticFormKind, setStaticFormKind] = useState<string | null>(null)
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  async function load() {
    try {
      const res = await api.get<{ connector_accounts: ConnectorAccount[] }>('/connectors/my-accounts')
      setAccounts(res.connector_accounts ?? [])
      setError(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load your connections.')
    }
  }

  useEffect(() => {
    void load()
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [])

  const byKind = useMemo(() => new Map((accounts ?? []).map((a) => [a.kind, a])), [accounts])

  async function connectOAuth(kind: AnyConnectorKind) {
    setConnectingKind(kind)
    setError(null)
    try {
      const started = await api.post<{ authorization_url: string }>(`/connectors/${kind}/oauth/start`, {
        display_name: CONNECTOR_KIND_LABELS[kind],
      })
      if (window.nexus?.openExternal) {
        await window.nexus.openExternal(started.authorization_url)
      } else {
        window.open(started.authorization_url, '_blank', 'noopener,noreferrer')
      }
      const knownIds = new Set((accounts ?? []).map((a) => a.id))
      let attempts = 0
      if (pollRef.current) clearInterval(pollRef.current)
      pollRef.current = setInterval(async () => {
        attempts++
        try {
          const res = await api.get<{ connector_accounts: ConnectorAccount[] }>('/connectors/my-accounts')
          setAccounts(res.connector_accounts ?? [])
          if ((res.connector_accounts ?? []).some((a) => !knownIds.has(a.id))) {
            if (pollRef.current) clearInterval(pollRef.current)
            pollRef.current = null
            setConnectingKind(null)
            return
          }
        } catch {
          // Keep polling until the attempt budget expires.
        }
        if (attempts >= 30 && pollRef.current) {
          clearInterval(pollRef.current)
          pollRef.current = null
          setConnectingKind(null)
        }
      }, 2000)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Unable to start the ${CONNECTOR_KIND_LABELS[kind]} connection.`)
      setConnectingKind(null)
    }
  }

  async function disconnect(account: ConnectorAccount) {
    if (!window.confirm(`Disconnect ${CONNECTOR_KIND_LABELS[account.kind as AnyConnectorKind] ?? account.kind}?`)) return
    setDisconnectingId(account.id)
    try {
      await api.delete(`/connectors/my-accounts/${account.id}`)
      setAccounts((prev) => (prev ?? []).filter((a) => a.id !== account.id))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to disconnect this account.')
    } finally {
      setDisconnectingId(null)
    }
  }

  return (
    <div className="wct-root">
      <style>{WORKSPACE_CONNECTIONS_CSS}</style>
      <div className="wct-intro">
        <p>Connect your own account for each app your automations and agents can use. An organization admin must first register the app itself in Admin Console → Connectors before it shows up as connectable here.</p>
      </div>

      {error && <div className="wct-error">{error}</div>}

      {accounts === null ? (
        <div className="wct-loading">Loading…</div>
      ) : (
        <>
          <section className="wct-section">
            <h3>Connect an app</h3>
            <div className="wct-grid">
              {OAUTH_CONNECTOR_KINDS.map((kind) => (
                <ConnectionCard
                  key={kind}
                  kind={kind}
                  account={byKind.get(kind)}
                  connecting={connectingKind === kind}
                  disconnecting={disconnectingId === byKind.get(kind)?.id}
                  onConnect={() => void connectOAuth(kind)}
                  onDisconnect={(a) => void disconnect(a)}
                />
              ))}
            </div>
          </section>

          <section className="wct-section">
            <h3>Connect with an API key</h3>
            <div className="wct-grid">
              {STATIC_CONNECTOR_KINDS.map((kind) => (
                <StaticConnectionCard
                  key={kind}
                  kind={kind}
                  account={byKind.get(kind)}
                  formOpen={staticFormKind === kind}
                  disconnecting={disconnectingId === byKind.get(kind)?.id}
                  onOpenForm={() => setStaticFormKind(kind)}
                  onCloseForm={() => setStaticFormKind(null)}
                  onConnected={(account) => {
                    setAccounts((prev) => [...(prev ?? []).filter((a) => a.kind !== kind), account])
                    setStaticFormKind(null)
                  }}
                  onError={(message) => setError(message)}
                  onDisconnect={(a) => void disconnect(a)}
                />
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  )
}

function StatusPill({ status }: { status?: string }) {
  if (!status) return <span className="wct-status-pill">Not connected</span>
  return <span className="wct-status-pill connected"><CheckOne size={11} /> Connected</span>
}

function ConnectionCard({ kind, account, connecting, disconnecting, onConnect, onDisconnect }: {
  kind: AnyConnectorKind
  account: ConnectorAccount | undefined
  connecting: boolean
  disconnecting: boolean
  onConnect: () => void
  onDisconnect: (account: ConnectorAccount) => void
}) {
  return (
    <div className="wct-card">
      <div className="wct-card-main">
        <div className="wct-card-name">{CONNECTOR_KIND_LABELS[kind]}</div>
        <StatusPill status={account?.status} />
        {account?.last_error && <div className="wct-card-error">{account.last_error}</div>}
      </div>
      {account ? (
        <button type="button" className="wct-btn" onClick={() => onDisconnect(account)} disabled={disconnecting}>
          {disconnecting ? <LoadingOne size={13} className="spin" /> : 'Disconnect'}
        </button>
      ) : (
        <button type="button" className="wct-btn primary" onClick={onConnect} disabled={connecting}>
          {connecting ? 'Connecting…' : 'Connect'}
        </button>
      )}
    </div>
  )
}

function StaticConnectionCard({ kind, account, formOpen, disconnecting, onOpenForm, onCloseForm, onConnected, onError, onDisconnect }: {
  kind: AnyConnectorKind
  account: ConnectorAccount | undefined
  formOpen: boolean
  disconnecting: boolean
  onOpenForm: () => void
  onCloseForm: () => void
  onConnected: (account: ConnectorAccount) => void
  onError: (message: string) => void
  onDisconnect: (account: ConnectorAccount) => void
}) {
  const [secret, setSecret] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit() {
    if (!secret.trim()) return
    setSaving(true)
    try {
      const account = await api.post<ConnectorAccount>(`/connectors/${kind}/static-account`, {
        secret: secret.trim(),
        display_name: CONNECTOR_KIND_LABELS[kind],
      })
      onConnected(account)
      setSecret('')
    } catch (err) {
      onError(err instanceof ApiError ? err.message : `Unable to connect ${CONNECTOR_KIND_LABELS[kind]}.`)
    } finally {
      setSaving(false)
    }
  }

  if (formOpen) {
    return (
      <div className="wct-card wct-card-form">
        <div className="wct-card-name">{CONNECTOR_KIND_LABELS[kind]}</div>
        <input
          className="wct-input"
          type="password"
          placeholder="Paste your API key…"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          autoFocus
        />
        <div className="wct-card-form-actions">
          <button type="button" className="wct-btn primary" onClick={() => void submit()} disabled={saving || !secret.trim()}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button type="button" className="wct-btn" onClick={onCloseForm} disabled={saving}>
            <Close size={12} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="wct-card">
      <div className="wct-card-main">
        <div className="wct-card-name">{CONNECTOR_KIND_LABELS[kind]}</div>
        <StatusPill status={account?.status} />
        {account?.last_error && <div className="wct-card-error">{account.last_error}</div>}
      </div>
      {account ? (
        <button type="button" className="wct-btn" onClick={() => onDisconnect(account)} disabled={disconnecting}>
          {disconnecting ? <LoadingOne size={13} className="spin" /> : 'Disconnect'}
        </button>
      ) : (
        <button type="button" className="wct-btn primary" onClick={onOpenForm}>Connect</button>
      )}
    </div>
  )
}

const WORKSPACE_CONNECTIONS_CSS = `
.wct-root {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 4px 2px;
  overflow-y: auto;
}

.wct-intro p {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
  max-width: 640px;
}

.wct-loading {
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

.wct-error {
  color: #ff6b6b;
  font-size: var(--font-size-xs);
}

.wct-section h3 {
  margin: 0 0 10px;
  font-size: var(--font-size-2xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-text-muted);
}

.wct-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 10px;
}

.wct-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: var(--color-surface);
}

.wct-card-form {
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
}

.wct-card-main {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.wct-card-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text);
}

.wct-card-error {
  color: #ff6b6b;
  font-size: var(--font-size-2xs);
}

.wct-status-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  width: fit-content;
  padding: 2px 7px;
  border-radius: 999px;
  font-size: var(--font-size-2xs);
  font-weight: 600;
  background: var(--color-surface-elevated);
  color: var(--color-text-muted);
}

.wct-status-pill.connected {
  background: rgba(var(--color-success-rgb), 0.12);
  color: var(--color-success);
}

.wct-btn {
  flex-shrink: 0;
  height: 30px;
  padding: 0 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-bg);
  color: var(--color-text);
  font-size: var(--font-size-xs);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.wct-btn.primary {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: white;
}

.wct-input {
  height: 32px;
  padding: 0 9px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-bg);
  color: var(--color-text);
  font-size: var(--font-size-xs);
}

.wct-card-form-actions {
  display: flex;
  gap: 6px;
}
`
