import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Close, Delete, LinkOne, Logout } from '@icon-park/react'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/auth'

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
              <button className="modal-close-btn" onClick={closeDeleteModal}><Close size={15} /></button>
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

  return (
    <div className="sv-view">
      <style>{ACCOUNT_CSS}</style>
      <header className="sv-view-header">
        <div className="sv-header-info">
          <h1>Connections</h1>
          <p>Linked accounts and identity integrations.</p>
        </div>
      </header>

      <div className="sv-card" style={{ marginBottom: 24 }}>
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

      <div className="sv-card">
        <div className="sv-card-head">
          <div className="sv-card-brand">
            <div className="sv-brand-icon"><LinkOne size={15} /></div>
            <div>
              <div className="sv-brand-name">Coming next</div>
              <div className="sv-brand-sub">GitHub, Google, Slack, and other user-linked accounts can be added here later</div>
            </div>
          </div>
        </div>
        <div className="sv-card-body">
          <div className="acct-note">
            This section is reserved for identity/account-linking flows, not runtime model providers.
          </div>
        </div>
      </div>
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
`
