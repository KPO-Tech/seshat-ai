import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import QRCode from 'qrcode'
import { Caution, Close, Delete, LinkOne, LoadingOne, Logout, Mail, Message, Plus } from '@icon-park/react'
import { api, ApiError } from '@/api/client'
import { WindowCloseIcon } from '@/components/ui/WindowControlIcon'
import { useAuthStore } from '@/stores/auth'
import { consumeWhatsAppPairStream, type ChannelAccount } from '@/apps/inbox'

export function AccountView() {
  const { logout, user } = useAuthStore()
  const navigate = useNavigate()
  const [loggingOut, setLoggingOut] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [confirmEmail, setConfirmEmail] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const [deleting, setDeleting] = useState(false)

  async function handleLogout() {
    setLoggingOut(true)
    try {
      await api.post('/auth/logout')
    } catch {
      // Best effort: the local auth store is still cleared below.
    }
    logout()
    navigate('/login', { replace: true })
  }

  function closeDeleteModal() {
    if (deleting) return
    setDeleteOpen(false)
    setConfirmEmail('')
    setDeleteError('')
  }

  async function handleDeleteAccount() {
    if (!user) return
    setDeleting(true)
    setDeleteError('')
    try {
      await api.delete('/users/me', { confirm_email: confirmEmail.trim() })
      logout()
      navigate('/login', { replace: true })
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'Failed to close account')
    } finally {
      setDeleting(false)
    }
  }

  const canDelete = !!user && confirmEmail.trim().toLowerCase() === user.email.trim().toLowerCase()

  return (
    <div className="sv-view">
      <style>{ACCOUNT_CSS}</style>
      <header className="sv-view-header">
        <div className="sv-header-info">
          <h1>Account</h1>
          <p>Manage your login session and account security.</p>
        </div>
      </header>

      <div className="sv-card" style={{ marginBottom: 24 }}>
        <div className="sv-card-head">
          <div className="sv-card-brand">
            <div className="sv-brand-icon"><Logout size={15} /></div>
            <div>
              <div className="sv-brand-name">Session</div>
              <div className="sv-brand-sub">Your active SeshatOS login on this device</div>
            </div>
          </div>
        </div>
        <div className="sv-card-body">
          <div className="sv-toggle-row">
            <div className="sv-toggle-info">
              <div>
                <div className="sv-setting-label">Sign out</div>
                <div className="sv-setting-desc">End your current session. You will need to log in again.</div>
              </div>
            </div>
            <button className="acct-ghost-btn" onClick={() => void handleLogout()} disabled={loggingOut}>
              <Logout size={12} />
              {loggingOut ? 'Signing out...' : 'Sign out'}
            </button>
          </div>
        </div>
      </div>

      <div className="sv-card acct-danger-card">
        <div className="sv-card-head acct-danger-head">
          <div className="sv-card-brand">
            <div className="sv-brand-icon acct-danger-icon"><Delete size={15} /></div>
            <div>
              <div className="sv-brand-name acct-danger-text">Danger zone</div>
              <div className="sv-brand-sub">Access is revoked immediately after confirmation</div>
            </div>
          </div>
        </div>
        <div className="sv-card-body">
          <div className="sv-toggle-row">
            <div className="sv-toggle-info">
              <div>
                <div className="sv-setting-label">Delete account</div>
                <div className="sv-setting-desc">Disable this account, revoke sessions and API keys, and sign out everywhere.</div>
              </div>
            </div>
            <button className="acct-danger-btn" onClick={() => setDeleteOpen(true)}>
              <Delete size={12} /> Delete account
            </button>
          </div>
        </div>
      </div>

      {deleteOpen && user && (
        <div className="modal-backdrop" onClick={closeDeleteModal}>
          <div className="modal-shell acct-delete-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h2>Delete account</h2>
              <button className="modal-close-btn" onClick={closeDeleteModal}><WindowCloseIcon size={15} /></button>
            </div>
            <div className="modal-content">
              <p className="acct-delete-copy">
                This closes your SeshatOS account immediately. To confirm, type <strong>{user.email}</strong> below.
              </p>
              <div className="modal-field">
                <label>Confirm your email</label>
                <input
                  type="email"
                  value={confirmEmail}
                  onChange={(event) => setConfirmEmail(event.target.value)}
                  placeholder={user.email}
                  autoFocus
                />
              </div>
              {deleteError && <div className="acct-inline-error">{deleteError}</div>}
            </div>
            <div className="modal-footer">
              <button className="modal-btn-cancel" onClick={closeDeleteModal} disabled={deleting}>Cancel</button>
              <button className="acct-danger-btn" onClick={() => void handleDeleteAccount()} disabled={!canDelete || deleting}>
                <Delete size={12} />
                {deleting ? 'Closing account...' : 'Delete account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export function ConnectionsView() {
  const navigate = useNavigate()
  const [accounts, setAccounts] = useState<ChannelAccount[]>([])
  const [accountsLoading, setAccountsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [gmailConnecting, setGmailConnecting] = useState(false)
  const [whatsappPairing, setWhatsappPairing] = useState<{ qr: string | null; error: string | null } | null>(null)
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null)

  const pairAbortRef = useRef<AbortController | null>(null)
  const gmailPollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const gmailAccounts = accounts.filter((a) => a.channel === 'gmail')
  const whatsappAccounts = accounts.filter((a) => a.channel === 'whatsapp')

  const loadAccounts = useCallback(async () => {
    setAccountsLoading(true)
    try {
      const res = await api.get<{ accounts: ChannelAccount[] }>('/inbox/accounts')
      setAccounts(res.accounts ?? [])
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to load connected accounts.')
    } finally {
      setAccountsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadAccounts()
    return () => {
      if (gmailPollRef.current) clearInterval(gmailPollRef.current)
      pairAbortRef.current?.abort()
    }
  }, [loadAccounts])

  async function handleConnectGmail() {
    setGmailConnecting(true)
    setError(null)
    try {
      const started = await api.post<{ authorization_url: string }>('/inbox/accounts/gmail/oauth/start')
      if (window.nexus?.openExternal) {
        await window.nexus.openExternal(started.authorization_url)
      } else {
        window.open(started.authorization_url, '_blank', 'noopener,noreferrer')
      }
      const knownIds = new Set(accounts.map((a) => a.id))
      let attempts = 0
      if (gmailPollRef.current) clearInterval(gmailPollRef.current)
      gmailPollRef.current = setInterval(async () => {
        attempts++
        try {
          const res = await api.get<{ accounts: ChannelAccount[] }>('/inbox/accounts')
          setAccounts(res.accounts ?? [])
          const connected = (res.accounts ?? []).some((a) => !knownIds.has(a.id) && a.channel === 'gmail')
          if (connected) {
            if (gmailPollRef.current) clearInterval(gmailPollRef.current)
            gmailPollRef.current = null
            setGmailConnecting(false)
            return
          }
        } catch {
          // Keep polling until the attempt budget expires.
        }
        if (attempts >= 30 && gmailPollRef.current) {
          clearInterval(gmailPollRef.current)
          gmailPollRef.current = null
          setGmailConnecting(false)
        }
      }, 2000)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to start Gmail connection.')
      setGmailConnecting(false)
    }
  }

  function handleConnectWhatsApp() {
    setWhatsappPairing({ qr: null, error: null })
    setError(null)
    const controller = new AbortController()
    pairAbortRef.current = controller

    const onQR = async (code: string) => {
      try {
        const dataUrl = await QRCode.toDataURL(code, { margin: 1, width: 260 })
        setWhatsappPairing({ qr: dataUrl, error: null })
      } catch {
        // The next QR rotation will retry.
      }
    }
    const onDone = async () => {
      setWhatsappPairing(null)
      await loadAccounts()
    }
    const onError = (message: string) => {
      setWhatsappPairing({ qr: null, error: message })
    }

    void consumeWhatsAppPairStream(controller.signal, onQR, onDone, onError)
  }

  function cancelWhatsAppPairing() {
    pairAbortRef.current?.abort()
    setWhatsappPairing(null)
  }

  async function handleDisconnect(accountId: string) {
    setDisconnectingId(accountId)
    setError(null)
    try {
      await api.delete(`/inbox/accounts/${accountId}`)
      await loadAccounts()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to disconnect.')
    } finally {
      setDisconnectingId(null)
    }
  }

  return (
    <div className="sv-view">
      <style>{ACCOUNT_CSS}</style>
      <header className="sv-view-header">
        <div className="sv-header-info">
          <h1>Connections</h1>
          <p>Linked accounts your agents can act on.</p>
        </div>
      </header>

      {error && <div className="acct-inline-error" style={{ marginBottom: 16 }}>{error}</div>}

      <div className="sv-card" style={{ marginBottom: 24 }}>
        <div className="sv-card-head">
          <div className="sv-card-brand">
            <div className="sv-brand-icon"><Mail size={15} /></div>
            <div>
              <div className="sv-brand-name">Gmail</div>
              <div className="sv-brand-sub">Connect one or more accounts so agents can read and reply to email</div>
            </div>
          </div>
        </div>
        <div className="sv-card-body acct-stack">
          {accountsLoading && gmailAccounts.length === 0 ? (
            <div className="acct-note">Loading...</div>
          ) : gmailAccounts.length === 0 ? (
            <div className="acct-note">No Gmail account connected yet.</div>
          ) : (
            gmailAccounts.map((account) => (
              <AccountRow
                key={account.id}
                account={account}
                onDisconnect={() => void handleDisconnect(account.id)}
                disconnecting={disconnectingId === account.id}
              />
            ))
          )}
          <button className="acct-primary-btn" onClick={() => void handleConnectGmail()} disabled={gmailConnecting}>
            {gmailConnecting ? <LoadingOne size={12} className="spin" /> : <Plus size={12} />}
            {gmailConnecting ? 'Waiting for Google sign-in...' : 'Connect a Gmail account'}
          </button>
        </div>
      </div>

      <div className="sv-card" style={{ marginBottom: 24 }}>
        <div className="sv-card-head">
          <div className="sv-card-brand">
            <div className="sv-brand-icon"><Message size={15} /></div>
            <div>
              <div className="sv-brand-name">WhatsApp</div>
              <div className="sv-brand-sub">Pair a device so agents can read and send WhatsApp messages</div>
            </div>
          </div>
        </div>
        <div className="sv-card-body acct-stack">
          {accountsLoading && whatsappAccounts.length === 0 ? (
            <div className="acct-note">Loading...</div>
          ) : whatsappAccounts.length === 0 ? (
            <div className="acct-note">No WhatsApp account connected yet.</div>
          ) : (
            whatsappAccounts.map((account) => (
              <AccountRow
                key={account.id}
                account={account}
                onDisconnect={() => void handleDisconnect(account.id)}
                disconnecting={disconnectingId === account.id}
              />
            ))
          )}
          <button className="acct-primary-btn" onClick={handleConnectWhatsApp}>
            <Plus size={12} /> Connect WhatsApp
          </button>
        </div>
      </div>

      <div className="sv-card">
        <div className="sv-card-head">
          <div className="sv-card-brand">
            <div className="sv-brand-icon"><LinkOne size={15} /></div>
            <div>
              <div className="sv-brand-name">Provider auth moved</div>
              <div className="sv-brand-sub">Model provider connections belong to Settings / Providers</div>
            </div>
          </div>
        </div>
        <div className="sv-card-body acct-stack">
          <div className="acct-note">
            OpenAI OAuth and model provider credentials stay separate from SeshatOS account login and register flows.
          </div>
          <button className="acct-primary-btn" onClick={() => navigate('/settings?tab=providers')}>
            Open Providers settings
          </button>
        </div>
      </div>

      {whatsappPairing && (
        <div className="modal-backdrop" onClick={cancelWhatsAppPairing}>
          <div className="modal-shell acct-pair-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h2>Connect WhatsApp</h2>
              <button className="modal-close-btn" onClick={cancelWhatsAppPairing}><WindowCloseIcon size={15} /></button>
            </div>
            <div className="modal-content acct-pair-content">
              <p>Scan this QR code from WhatsApp, Settings, Linked Devices, Link a Device.</p>
              {whatsappPairing.qr ? (
                <img src={whatsappPairing.qr} alt="WhatsApp pairing QR code" width={220} height={220} />
              ) : whatsappPairing.error ? (
                <div className="acct-inline-error"><Caution size={13} /> {whatsappPairing.error}</div>
              ) : (
                <LoadingOne size={22} className="spin" />
              )}
            </div>
            <div className="modal-footer">
              <button className="modal-btn-cancel" onClick={cancelWhatsAppPairing}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function AccountRow({
  account,
  onDisconnect,
  disconnecting,
}: {
  account: ChannelAccount
  onDisconnect: () => void
  disconnecting: boolean
}) {
  return (
    <div className="sv-toggle-row">
      <div className="acct-row-info">
        <div className="sv-setting-label">{account.display_name || account.external_account_id}</div>
        <div className="sv-setting-desc">
          {account.status === 'error' && account.last_error ? account.last_error : account.status}
        </div>
      </div>
      <button className="acct-ghost-btn" onClick={onDisconnect} disabled={disconnecting}>
        <Close size={12} /> {disconnecting ? 'Disconnecting...' : 'Disconnect'}
      </button>
    </div>
  )
}

const ACCOUNT_CSS = `
.acct-ghost-btn,
.acct-primary-btn,
.acct-danger-btn {
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

.acct-ghost-btn {
  background: transparent;
  color: var(--color-text-secondary);
}

.acct-ghost-btn:hover:not(:disabled) {
  background: var(--color-hover);
  color: var(--color-text);
}

.acct-primary-btn {
  width: fit-content;
  border: none;
  background: var(--color-cta);
  color: white;
}

.acct-danger-btn {
  width: fit-content;
  border-color: rgba(var(--color-error-rgb), 0.35);
  background: rgba(var(--color-error-rgb), 0.1);
  color: var(--color-error);
}

.acct-ghost-btn:disabled,
.acct-danger-btn:disabled {
  opacity: 0.45;
  cursor: default;
}

.acct-danger-card {
  border-color: rgba(var(--color-error-rgb), 0.3);
}

.acct-danger-head {
  background: rgba(var(--color-error-rgb), 0.05);
}

.acct-danger-icon {
  border-color: rgba(var(--color-error-rgb), 0.3);
  color: var(--color-error);
}

.acct-danger-text {
  color: var(--color-error);
}

.acct-delete-modal {
  max-width: 560px;
}

.acct-delete-copy {
  margin: 0 0 18px;
  color: var(--color-text-secondary);
  font-size: 12px;
  line-height: 1.6;
}

.acct-inline-error {
  margin-top: 14px;
  border: 1px solid rgba(var(--color-error-rgb), 0.35);
  background: rgba(var(--color-error-rgb), 0.1);
  color: var(--color-error);
  border-radius: 8px;
  padding: 8px 9px;
  font-size: 11px;
  line-height: 1.5;
}

.acct-stack {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.acct-note {
  color: var(--color-text-secondary);
  font-size: 12px;
  line-height: 1.6;
}

.acct-row-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.acct-pair-modal {
  max-width: 400px;
}

.acct-pair-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  text-align: center;
  padding-top: 4px;
}

.acct-pair-content p {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: 12px;
  line-height: 1.5;
}

.acct-pair-content img {
  border-radius: 10px;
  border: 1px solid var(--color-border);
}

.spin {
  animation: spin 1s linear infinite;
  display: inline-block;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
`
