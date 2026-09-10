import { useState } from 'react'
import { SendEmail, Plus, CloseOne } from '@icon-park/react'
import { WindowCloseIcon } from '@/components/ui/WindowControlIcon'
import {
  useAdminInvitations,
  createAdminInvitation,
  revokeAdminInvitation,
} from '@/hooks/useAdminInvitations'
import { useAdminRoles } from '@/hooks/useAdminMemberships'
import type { OrgInvitation } from '@/api/types'

const STATUS_FILTERS: Array<{ id: string; label: string }> = [
  { id: '', label: 'All' },
  { id: 'pending', label: 'Pending' },
  { id: 'accepted', label: 'Accepted' },
  { id: 'revoked', label: 'Revoked' },
  { id: 'expired', label: 'Expired' },
]

function statusClass(status: string): string {
  if (status === 'accepted') return 'adm-ok'
  if (status === 'pending') return 'adm-warn'
  if (status === 'revoked' || status === 'expired') return 'adm-fail'
  return 'adm-neutral'
}

// AdminInvitationsView — Admin Console's Invitations tab. Distinct from
// Users (admin_memberships.go / AdminUsersView.tsx): a membership is someone
// who already has access, an invitation is a promise of access by email
// that hasn't been accepted yet. Every write here goes through
// /admin/invitations, which seshat-backend forwards to seshat-server's real
// iam.Invitation store - the exact one seshat-console's InvitationsPage.tsx
// edits.
export function AdminInvitationsView() {
  const [status, setStatus] = useState('')
  const { invitations, loading, error, refetch } = useAdminInvitations(status)
  const [inviting, setInviting] = useState(false)
  const [revokingId, setRevokingId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  async function handleRevoke(invitation: OrgInvitation) {
    if (revokingId) return
    if (!window.confirm(`Revoke the invitation sent to ${invitation.email}?`)) return
    setActionError(null)
    setRevokingId(invitation.id)
    try {
      await revokeAdminInvitation(invitation.id)
      await refetch()
    } catch (e: unknown) {
      setActionError((e as { message?: string })?.message ?? 'Failed to revoke this invitation.')
    } finally {
      setRevokingId(null)
    }
  }

  return (
    <div className="adm-root">
      <header className="adm-header">
        <div className="adm-filter-tabs">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              className={`adm-filter-tab ${status === f.id ? 'active' : ''}`}
              onClick={() => setStatus(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button className="adm-primary-btn" onClick={() => setInviting(true)}>
          <Plus size={12} /> Invite
        </button>
      </header>

      {(error || actionError) && (
        <div className="pv-action-error">
          {error || actionError}
          <button type="button" onClick={() => setActionError(null)} aria-label="Dismiss">×</button>
        </div>
      )}

      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Invited</th>
              <th>Expires</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="adm-td-center">Loading…</td></tr>
            ) : invitations.length === 0 ? (
              <tr><td colSpan={6} className="adm-td-center adm-muted">No invitations found</td></tr>
            ) : invitations.map((inv) => (
              <tr key={inv.id}>
                <td className="adm-strong">{inv.email}</td>
                <td className="adm-mono">{inv.role}</td>
                <td>
                  <span className={`adm-status-badge ${statusClass(inv.status)}`}>{inv.status}</span>
                </td>
                <td className="adm-muted">{new Date(inv.created_at).toLocaleDateString()}</td>
                <td className="adm-muted">{inv.expires_at ? new Date(inv.expires_at).toLocaleDateString() : '—'}</td>
                <td>
                  {inv.status === 'pending' && (
                    <div className="adm-roles" style={{ justifyContent: 'flex-end' }}>
                      <button
                        className="pv-icon-btn"
                        aria-label="Revoke invitation"
                        onClick={() => handleRevoke(inv)}
                        disabled={revokingId === inv.id}
                      >
                        <CloseOne size={13} />
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {inviting && (
        <InviteModal
          onClose={() => setInviting(false)}
          onSuccess={() => { setInviting(false); refetch() }}
        />
      )}
    </div>
  )
}

function InviteModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const { roles } = useAdminRoles()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('member')
  const [expiresInDays, setExpiresInDays] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit() {
    setSubmitting(true)
    setError('')
    try {
      const days = Number(expiresInDays)
      await createAdminInvitation({
        email,
        role,
        ...(days > 0 ? { expires_in_days: days } : {}),
      })
      onSuccess()
    } catch (e: unknown) {
      setError((e as { message?: string })?.message ?? 'Failed to send this invitation.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal-shell">
        <header className="modal-header">
          <h2><SendEmail size={16} /> Invite a member</h2>
          <button className="modal-close-btn" onClick={onClose}><WindowCloseIcon size={16} /></button>
        </header>
        <div className="modal-content">
          <div className="modal-field" style={{ marginBottom: 20 }}>
            <label>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
          </div>
          <div className="modal-field" style={{ marginBottom: 20 }}>
            <label>Role</label>
            <select className="adm-role-select adm-role-select--modal" value={role} onChange={(e) => setRole(e.target.value)}>
              {roles.map((r) => (
                <option key={r.code} value={r.code}>{r.name}</option>
              ))}
            </select>
          </div>
          <div className="modal-field">
            <label>Expires in <span className="modal-label-opt">(days, optional)</span></label>
            <input
              type="number"
              min={1}
              placeholder="7"
              value={expiresInDays}
              onChange={(e) => setExpiresInDays(e.target.value)}
            />
          </div>
          <p className="adm-muted" style={{ fontSize: 12, marginTop: 16 }}>
            They'll get an email with a link to accept and set their own password.
          </p>
          {error && <div className="modal-error">{error}</div>}
        </div>
        <footer className="modal-footer">
          <button className="modal-btn-cancel" onClick={onClose}>Cancel</button>
          <button className="modal-btn-submit" disabled={submitting || !email.trim()} onClick={handleSubmit}>
            {submitting ? 'Sending…' : 'Send invitation'}
          </button>
        </footer>
      </div>
    </div>
  )
}
