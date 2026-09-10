import { useState } from 'react'
import { Delete, Plus } from '@icon-park/react'
import { WindowCloseIcon } from '@/components/ui/WindowControlIcon'
import {
  useAdminDesktopPolicyCatalog,
  useAdminDesktopPolicyBindings,
  setAdminDesktopPolicyBinding,
  deleteAdminDesktopPolicyBinding,
} from '@/hooks/useAdminDesktopPolicies'
import { useAdminRoles, useAdminMemberships } from '@/hooks/useAdminMemberships'
import { useAdminTeams } from '@/hooks/useAdminTeams'
import type { OrgDesktopPolicyBinding } from '@/api/types'

// "group" is the wire value (matches seshat-server's SubjectType enum) -
// labeled "Team" everywhere in the UI, same convention seshat-console uses.
const SUBJECT_TYPE_LABELS: Record<string, string> = {
  org: 'Whole organization',
  role: 'Role',
  user: 'User',
  group: 'Team',
}

// AdminDesktopPoliciesView — Admin Console's Desktop Policies tab. These
// bindings already actively control this exact device's behavior (see
// hooks/useDesktopPolicies.ts, which reads the resolved bundle and locks
// Settings/Providers accordingly) - until now an org admin had no way to see
// or manage them without opening seshat-console in a browser. Every write
// here goes to /admin/desktop-policy-bindings, which seshat-backend forwards
// straight to seshat-server's real iam.DesktopPolicyBinding store - the
// same one seshat-console's DesktopPoliciesPage.tsx edits.
export function AdminDesktopPoliciesView() {
  const { catalog, loading: catalogLoading } = useAdminDesktopPolicyCatalog()
  const { bindings, loading, error, refetch } = useAdminDesktopPolicyBindings()
  const [creating, setCreating] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const catalogByCode = new Map(catalog.map((p) => [p.code, p]))

  async function handleDelete(binding: OrgDesktopPolicyBinding) {
    if (deletingId) return
    if (!window.confirm('Remove this binding? The affected subject falls back to whatever else applies, or the catalog default.')) return
    setActionError(null)
    setDeletingId(binding.id)
    try {
      await deleteAdminDesktopPolicyBinding(binding.id)
      await refetch()
    } catch (e: unknown) {
      setActionError((e as { message?: string })?.message ?? 'Failed to remove this binding.')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="adm-root">
      <header className="adm-header">
        <div>
          <h1>Desktop Policies</h1>
        </div>
        <button className="adm-primary-btn" onClick={() => setCreating(true)}>
          <Plus size={12} /> New binding
        </button>
      </header>
      <p className="adm-muted" style={{ margin: '-16px 0 4px', fontSize: 12 }}>
        Restrict what the desktop app allows on a device - custom providers, local models, multiple workspaces, and
        settings changes. Every policy is allowed by default; assigning a binding can only restrict further, never
        loosen it.
      </p>

      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>What it controls</th>
              <th>Message when blocked</th>
            </tr>
          </thead>
          <tbody>
            {catalogLoading ? (
              <tr><td colSpan={3} className="adm-td-center">Loading…</td></tr>
            ) : catalog.map((p) => (
              <tr key={p.code}>
                <td className="adm-mono">{p.code}</td>
                <td>{p.admin_description}</td>
                <td className="adm-muted">{p.user_blocked_message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
              <th>Policy</th>
              <th>Applies to</th>
              <th>Value</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="adm-td-center">Loading…</td></tr>
            ) : bindings.length === 0 ? (
              <tr><td colSpan={4} className="adm-td-center adm-muted">No bindings yet - every policy is at its default (allowed)</td></tr>
            ) : bindings.map((b) => (
              <tr key={b.id}>
                <td>
                  <div className="adm-strong">{b.policy_code}</div>
                  {catalogByCode.get(b.policy_code) && (
                    <div className="adm-muted" style={{ fontSize: 10 }}>{catalogByCode.get(b.policy_code)!.admin_description}</div>
                  )}
                </td>
                <td>
                  <span className="adm-role-chip">{SUBJECT_TYPE_LABELS[b.subject_type] ?? b.subject_type}</span>
                  {b.subject_id && <span className="adm-mono adm-muted" style={{ marginLeft: 6 }}>{b.subject_id}</span>}
                </td>
                <td>
                  <span className={`adm-status-badge ${b.value ? 'adm-ok' : 'adm-fail'}`}>{b.value ? 'Allowed' : 'Blocked'}</span>
                </td>
                <td>
                  <div className="adm-roles" style={{ justifyContent: 'flex-end' }}>
                    <button
                      className="pv-icon-btn"
                      aria-label="Delete"
                      onClick={() => handleDelete(b)}
                      disabled={deletingId === b.id}
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
        <NewBindingModal
          catalog={catalog}
          onClose={() => setCreating(false)}
          onSuccess={() => { setCreating(false); refetch() }}
        />
      )}
    </div>
  )
}

function NewBindingModal({
  catalog,
  onClose,
  onSuccess,
}: {
  catalog: { code: string; admin_description: string }[]
  onClose: () => void
  onSuccess: () => void
}) {
  const { roles } = useAdminRoles()
  const { teams } = useAdminTeams()
  const { memberships } = useAdminMemberships()

  const [policyCode, setPolicyCode] = useState(catalog[0]?.code ?? '')
  const [subjectType, setSubjectType] = useState<'org' | 'role' | 'user' | 'group'>('org')
  const [subjectId, setSubjectId] = useState('')
  const [value, setValue] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  function handleSubjectTypeChange(next: 'org' | 'role' | 'user' | 'group') {
    setSubjectType(next)
    setSubjectId('')
  }

  async function handleSubmit() {
    setSubmitting(true)
    setError('')
    try {
      await setAdminDesktopPolicyBinding({
        policy_code: policyCode,
        subject_type: subjectType,
        subject_id: subjectType === 'org' ? '' : subjectId,
        value,
      })
      onSuccess()
    } catch (e: unknown) {
      setError((e as { message?: string })?.message ?? 'Failed to save this binding.')
    } finally {
      setSubmitting(false)
    }
  }

  const needsSubject = subjectType !== 'org'
  const canSubmit = policyCode && (!needsSubject || subjectId)

  return (
    <div className="modal-backdrop">
      <div className="modal-shell">
        <header className="modal-header">
          <h2>New desktop policy binding</h2>
          <button className="modal-close-btn" onClick={onClose}><WindowCloseIcon size={16} /></button>
        </header>
        <div className="modal-content">
          <div className="modal-field" style={{ marginBottom: 20 }}>
            <label>Policy</label>
            <select className="adm-role-select adm-role-select--modal" value={policyCode} onChange={(e) => setPolicyCode(e.target.value)}>
              {catalog.map((p) => (
                <option key={p.code} value={p.code}>{p.code}</option>
              ))}
            </select>
            {catalog.find((p) => p.code === policyCode) && (
              <p className="adm-muted" style={{ fontSize: 11, marginTop: 6 }}>
                {catalog.find((p) => p.code === policyCode)!.admin_description}
              </p>
            )}
          </div>

          <div className="modal-field" style={{ marginBottom: 20 }}>
            <label>Applies to</label>
            <select
              className="adm-role-select adm-role-select--modal"
              value={subjectType}
              onChange={(e) => handleSubjectTypeChange(e.target.value as 'org' | 'role' | 'user' | 'group')}
            >
              <option value="org">Whole organization</option>
              <option value="role">Role</option>
              <option value="user">User</option>
              <option value="group">Team</option>
            </select>
          </div>

          {needsSubject && (
            <div className="modal-field" style={{ marginBottom: 20 }}>
              <label>Subject</label>
              {subjectType === 'role' ? (
                <select className="adm-role-select adm-role-select--modal" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
                  <option value="" disabled>Select a role…</option>
                  {roles.map((r) => (
                    <option key={r.code} value={r.code}>{r.name}</option>
                  ))}
                </select>
              ) : subjectType === 'group' ? (
                <select className="adm-role-select adm-role-select--modal" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
                  <option value="" disabled>Select a team…</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              ) : (
                <select className="adm-role-select adm-role-select--modal" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
                  <option value="" disabled>Select a user…</option>
                  {memberships.map((m) => (
                    <option key={m.user_id} value={m.user_id}>{m.user_display_name || m.user_email || m.user_id}</option>
                  ))}
                </select>
              )}
            </div>
          )}

          <div className="modal-field">
            <label>Value</label>
            <select
              className="adm-role-select adm-role-select--modal"
              value={value ? 'allowed' : 'blocked'}
              onChange={(e) => setValue(e.target.value === 'allowed')}
            >
              <option value="allowed">Allowed</option>
              <option value="blocked">Blocked</option>
            </select>
            <p className="adm-muted" style={{ fontSize: 11, marginTop: 6 }}>
              Blocking here overrides a more permissive binding elsewhere - once anything applicable says blocked, it
              stays blocked.
            </p>
          </div>

          {error && <div className="modal-error">{error}</div>}
        </div>
        <footer className="modal-footer">
          <button className="modal-btn-cancel" onClick={onClose}>Cancel</button>
          <button className="modal-btn-submit" disabled={submitting || !canSubmit} onClick={handleSubmit}>
            {submitting ? 'Saving…' : 'Save'}
          </button>
        </footer>
      </div>
    </div>
  )
}
