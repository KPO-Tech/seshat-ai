import { useState } from 'react'
import { User, Plus, Delete } from '@icon-park/react'
import { useAuthStore } from '@/stores/auth'
import { WindowCloseIcon } from '@/components/ui/WindowControlIcon'
import {
  useAdminMemberships,
  useAdminRoles,
  createAdminMember,
  updateAdminMembershipRole,
  deleteAdminMembership,
} from '@/hooks/useAdminMemberships'
import type { OrgMembership } from '@/api/types'

// AdminUsersView — Admin Console's Users tab. Deliberately built on
// /admin/memberships (seshat-server's iam.Membership), NOT the platform-
// wide /users resource: seshat-server's iam.Service.ListUsers/CreateUser/
// UpdateUser/DeleteUser all require the rare platform super-admin flag,
// never an organization's own "admin" role member. Memberships are the
// org-scoped resource a real org admin can actually manage (same one
// seshat-console's MembershipsPage.tsx edits) - role is the one field that
// can change here, which is exactly what's needed when someone changes
// position (their assigned role/title changes, not their account).
export function AdminUsersView() {
  const currentUserId = useAuthStore((s) => s.user?.id)
  const { memberships, loading, error, refetch } = useAdminMemberships()
  const { roles } = useAdminRoles()
  const [creating, setCreating] = useState(false)
  const [savingRoleId, setSavingRoleId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const roleByCode = new Map(roles.map((r) => [r.code, r]))

  async function handleRoleChange(membership: OrgMembership, role: string) {
    if (savingRoleId) return
    setActionError(null)
    setSavingRoleId(membership.id)
    try {
      await updateAdminMembershipRole(membership.id, role)
      await refetch()
    } catch (e: unknown) {
      setActionError((e as { message?: string })?.message ?? 'Failed to update this member\'s role.')
    } finally {
      setSavingRoleId(null)
    }
  }

  async function handleRemove(membership: OrgMembership) {
    if (deletingId) return
    const label = membership.user_display_name || membership.user_email || membership.user_id
    if (!window.confirm(`Remove ${label} from this organization? This cannot be undone.`)) return
    setActionError(null)
    setDeletingId(membership.id)
    try {
      await deleteAdminMembership(membership.id)
      await refetch()
    } catch (e: unknown) {
      setActionError((e as { message?: string })?.message ?? 'Failed to remove this member.')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="adm-root">
      <header className="adm-header">
        <div>
          <h1>Users</h1>
        </div>
        <button className="adm-primary-btn" onClick={() => setCreating(true)}>
          <Plus size={12} /> New member
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
              <th>Member</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Joined</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="adm-td-center">Loading…</td></tr>
            ) : memberships.length === 0 ? (
              <tr><td colSpan={6} className="adm-td-center adm-muted">No members found</td></tr>
            ) : memberships.map((m) => (
              <tr key={m.id}>
                <td>
                  <div className="adm-user-cell">
                    <div className="adm-avatar"><User size={11} /></div>
                    <span className="adm-user-name">{m.user_display_name || '—'}</span>
                  </div>
                </td>
                <td className="adm-mono">{m.user_email || '—'}</td>
                <td>
                  <select
                    className="adm-role-select"
                    value={m.role}
                    disabled={savingRoleId === m.id || m.user_id === currentUserId}
                    onChange={(e) => handleRoleChange(m, e.target.value)}
                  >
                    {!roleByCode.has(m.role) && <option value={m.role}>{m.role}</option>}
                    {roles.map((r) => (
                      <option key={r.code} value={r.code}>{r.name}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <span className={`adm-status-badge ${m.status === 'active' ? 'adm-ok' : 'adm-inactive'}`}>
                    {m.status}
                  </span>
                </td>
                <td className="adm-muted">{new Date(m.created_at).toLocaleDateString()}</td>
                <td>
                  <div className="adm-roles" style={{ justifyContent: 'flex-end' }}>
                    <button
                      className="pv-icon-btn"
                      title="Remove from organization"
                      onClick={() => handleRemove(m)}
                      disabled={deletingId === m.id || m.user_id === currentUserId}
                    >
                      <Delete size={13} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {creating && (
        <CreateMemberModal
          onClose={() => setCreating(false)}
          onSuccess={() => { setCreating(false); refetch() }}
        />
      )}
    </div>
  )
}

function CreateMemberModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const { roles } = useAdminRoles()
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [role, setRole] = useState('member')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit() {
    setSubmitting(true)
    setError('')
    try {
      await createAdminMember({ email, display_name: displayName || email, role })
      onSuccess()
    } catch (e: unknown) {
      setError((e as { message?: string })?.message ?? 'Failed to add this member.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal-shell">
        <header className="modal-header">
          <h2>New member</h2>
          <button className="modal-close-btn" onClick={onClose}><WindowCloseIcon size={16} /></button>
        </header>
        <div className="modal-content">
          <div className="modal-field" style={{ marginBottom: 20 }}>
            <label>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
          </div>
          <div className="modal-field" style={{ marginBottom: 20 }}>
            <label>Display name <span className="modal-label-opt">(optional)</span></label>
            <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </div>
          <div className="modal-field">
            <label>Role</label>
            <select className="adm-role-select adm-role-select--modal" value={role} onChange={(e) => setRole(e.target.value)}>
              {roles.map((r) => (
                <option key={r.code} value={r.code}>{r.name}</option>
              ))}
            </select>
          </div>
          <p className="adm-muted" style={{ fontSize: 12, marginTop: 16 }}>
            They'll get an email with a link to set their own password. Nobody here ever sees or sets it for them.
          </p>
          {error && <div className="modal-error">{error}</div>}
        </div>
        <footer className="modal-footer">
          <button className="modal-btn-cancel" onClick={onClose}>Cancel</button>
          <button className="modal-btn-submit" disabled={submitting || !email.trim()} onClick={handleSubmit}>
            {submitting ? 'Adding…' : 'Add member'}
          </button>
        </footer>
      </div>
    </div>
  )
}
