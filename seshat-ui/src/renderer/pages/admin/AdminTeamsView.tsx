import { useEffect, useMemo, useState } from 'react'
import { Delete, Edit, Plus } from '@icon-park/react'
import { api } from '@/api/client'
import { WindowCloseIcon } from '@/components/ui/WindowControlIcon'
import { useAdminTeams, createAdminTeam, updateAdminTeam, deleteAdminTeam } from '@/hooks/useAdminTeams'
import type { OrgTeam, OrgMembership } from '@/api/types'

// AdminTeamsView — Admin Console's Teams tab. Replaced the old local
// "Groups" tab (a per-device feature-permission bundle with no organization
// concept - see docs/helps/... "Admin Console" architecture item). Every
// write here goes to /admin/teams, which seshat-backend forwards straight to
// seshat-server's real iam.Group store - the exact one seshat-console's
// TeamsPage.tsx edits. A change made here is immediately visible there, and
// vice versa.
export function AdminTeamsView() {
  const { teams, loading, error, refetch } = useAdminTeams()
  const [editing, setEditing] = useState<OrgTeam | 'new' | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  async function handleDelete(id: string) {
    if (deletingId) return
    setActionError(null)
    setDeletingId(id)
    try {
      await deleteAdminTeam(id)
      await refetch()
    } catch (e: unknown) {
      setActionError((e as { message?: string })?.message ?? 'Failed to delete this team.')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="adm-root">
      <header className="adm-header">
        <div>
          <h1>Teams</h1>
        </div>
        <button className="adm-primary-btn" onClick={() => setEditing('new')}>
          <Plus size={12} /> New team
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
              <th>Team</th>
              <th>Members</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={3} className="adm-td-center">Loading…</td></tr>
            ) : teams.length === 0 ? (
              <tr><td colSpan={3} className="adm-td-center adm-muted">No teams yet</td></tr>
            ) : teams.map((team) => (
              <tr key={team.id}>
                <td>
                  <div className="adm-strong">{team.name}</div>
                  <div className="adm-mono adm-muted">{team.slug}</div>
                </td>
                <td>{team.member_user_ids?.length ?? 0}</td>
                <td>
                  <div className="adm-roles" style={{ justifyContent: 'flex-end' }}>
                    <button className="pv-icon-btn" title="Edit" onClick={() => setEditing(team)}>
                      <Edit size={13} />
                    </button>
                    <button
                      className="pv-icon-btn"
                      title="Delete"
                      onClick={() => handleDelete(team.id)}
                      disabled={deletingId === team.id}
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

      {editing && (
        <TeamFormModal
          team={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSuccess={() => { setEditing(null); refetch() }}
        />
      )}
    </div>
  )
}

type OrgMember = { id: string; email: string; display_name: string }

function TeamFormModal({
  team,
  onClose,
  onSuccess,
}: {
  team: OrgTeam | null
  onClose: () => void
  onSuccess: () => void
}) {
  const [name, setName] = useState(team?.name ?? '')
  const [slug, setSlug] = useState(team?.slug ?? '')
  const [description, setDescription] = useState(team?.description ?? '')
  const [memberIds, setMemberIds] = useState<string[]>(team?.member_user_ids ?? [])
  const [memberSearch, setMemberSearch] = useState('')
  const [members, setMembers] = useState<OrgMember[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    // Deliberately /admin/memberships, NOT /users - the platform-wide Users
    // resource requires the rare platform super-admin flag, which a normal
    // org admin never has (see useAdminMemberships.ts's own doc comment for
    // why). This used to call /users and silently returned an empty picker
    // for every ordinary org admin.
    api.get<{ memberships: OrgMembership[] }>('/admin/memberships')
      .then((data) => setMembers((data?.memberships ?? []).map((m) => ({
        id: m.user_id,
        email: m.user_email ?? '',
        display_name: m.user_display_name ?? '',
      }))))
      .catch(() => setMembers([]))
  }, [])

  const filteredMembers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase()
    if (!q) return members
    return members.filter((m) => m.email.toLowerCase().includes(q) || m.display_name?.toLowerCase().includes(q))
  }, [members, memberSearch])

  function toggleMember(id: string) {
    setMemberIds((prev) => (prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]))
  }

  async function handleSubmit() {
    setSubmitting(true)
    setError('')
    try {
      if (team) {
        await updateAdminTeam(team.id, { name, slug, description, member_user_ids: memberIds })
      } else {
        await createAdminTeam({ name, slug, description, member_user_ids: memberIds })
      }
      onSuccess()
    } catch (e: unknown) {
      setError((e as { message?: string })?.message ?? 'Failed to save this team.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal-shell">
        <header className="modal-header">
          <h2>{team ? `Edit ${team.name}` : 'New team'}</h2>
          <button className="modal-close-btn" onClick={onClose}><WindowCloseIcon size={16} /></button>
        </header>
        <div className="modal-content">
          <div className="modal-field" style={{ marginBottom: 20 }}>
            <label>Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>

          <div className="modal-field" style={{ marginBottom: 20 }}>
            <label>Slug</label>
            <input
              type="text"
              placeholder="lowercase-with-hyphens"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
            />
          </div>

          <div className="modal-field" style={{ marginBottom: 20 }}>
            <label>Description <span className="modal-label-opt">(optional)</span></label>
            <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          <div className="modal-field">
            <label>Members</label>
            <input
              type="text"
              placeholder="Search members…"
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
              style={{ marginBottom: 8 }}
            />
            <div className="adm-team-member-list">
              {filteredMembers.map((m) => (
                <label key={m.id} className="adm-team-member-row">
                  <input type="checkbox" checked={memberIds.includes(m.id)} onChange={() => toggleMember(m.id)} />
                  <span>{m.display_name || m.email}</span>
                  <span className="adm-muted adm-mono">{m.email}</span>
                </label>
              ))}
              {filteredMembers.length === 0 && <div className="adm-muted" style={{ padding: 8 }}>No members found</div>}
            </div>
          </div>

          {error && <div className="modal-error">{error}</div>}
        </div>
        <footer className="modal-footer">
          <button className="modal-btn-cancel" onClick={onClose}>Cancel</button>
          <button
            className="modal-btn-submit"
            disabled={submitting || !name.trim() || !slug.trim()}
            onClick={handleSubmit}
          >
            {submitting ? 'Saving…' : 'Save'}
          </button>
        </footer>
      </div>
    </div>
  )
}
