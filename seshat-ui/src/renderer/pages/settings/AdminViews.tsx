import { useState, useEffect, useCallback } from 'react'
import { User, Sync, Left, Right } from '@icon-park/react'
import { api } from '@/api/client'
import type { AdminGroup, AdminOrganization, AdminWorkspace } from '@/api/types'

type AdminUser = {
  id: string
  email: string
  display_name: string
  status: string
  roles: string[]
  created_at: number
}

type UsersPage = {
  users: AdminUser[]
  total: number
  page: number
  per_page: number
}

type AuditEntry = {
  id: string
  actor_user_id: string
  action: string
  resource_type?: string
  resource_id?: string
  ip_address?: string
  status: string
  created_at: number
}

type AuditPage = {
  logs: AuditEntry[]
  count: number
  limit: number
  offset: number
}

type UsageEntry = {
  metric: string
  period: string
  period_key: string
  count: number
  updated_at: number
}

type UsageSummary = {
  user_id: string
  entries: UsageEntry[]
}

const PER_PAGE = 30
const AUDIT_LIMIT = 50

export function AdminUsersView() {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<UsersPage | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (p: number, q: string) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(p), per_page: String(PER_PAGE) })
      if (q) params.set('search', q)
      const res = await api.get<UsersPage>(`/users?${params}`)
      setData(res)
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load(page, search) }, [load, page, search])

  function handleSearch(e: React.ChangeEvent<HTMLInputElement>) {
    setSearch(e.target.value)
    setPage(1)
  }

  const totalPages = data ? Math.ceil(data.total / PER_PAGE) : 1

  return (
    <div className="adm-root">
      <style>{ADMIN_CSS}</style>
      <header className="adm-header">
        <div>
          <h1>Users</h1>
        </div>
        <input
          className="adm-search"
          placeholder="Search by email or name…"
          value={search}
          onChange={handleSearch}
        />
      </header>

      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Email</th>
              <th>Status</th>
              <th>Roles</th>
              <th>Joined</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="adm-td-center"><Sync size={13} className="spin" /> Loading…</td></tr>
            ) : !data?.users.length ? (
              <tr><td colSpan={5} className="adm-td-center adm-muted">No users found</td></tr>
            ) : data.users.map((u) => (
              <tr key={u.id}>
                <td>
                  <div className="adm-user-cell">
                    <div className="adm-avatar"><User size={11} /></div>
                    <span className="adm-user-name">{u.display_name || '—'}</span>
                  </div>
                </td>
                <td className="adm-mono">{u.email}</td>
                <td>
                  <span className={`adm-status-badge ${u.status === 'active' ? 'adm-ok' : 'adm-inactive'}`}>
                    {u.status}
                  </span>
                </td>
                <td>
                  <div className="adm-roles">
                    {(u.roles ?? []).map((r) => (
                      <span key={r} className="adm-role-chip">{r}</span>
                    ))}
                  </div>
                </td>
                <td className="adm-muted">{new Date(u.created_at * 1000).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data && data.total > PER_PAGE && (
        <div className="adm-pagination">
          <button className="adm-page-btn" onClick={() => setPage((p) => p - 1)} disabled={page <= 1}>
            <Left size={11} />
          </button>
          <span className="adm-page-info">Page {page} of {totalPages} ({data.total} users)</span>
          <button className="adm-page-btn" onClick={() => setPage((p) => p + 1)} disabled={page >= totalPages}>
            <Right size={11} />
          </button>
        </div>
      )}
    </div>
  )
}

export function AdminGroupsView() {
  return (
    <AdminResourceTable<AdminGroup>
      title="Groups"
      path="/groups"
      rowsKey="groups"
      emptyLabel="No groups found"
      columns={[
        { key: 'name', label: 'Group', render: (group) => <span className="adm-strong">{group.name}</span> },
        { key: 'description', label: 'Description', render: (group) => group.description || '—' },
        { key: 'permissions', label: 'Permissions', render: (group) => Object.keys(group.permissions ?? {}).length ? `${Object.keys(group.permissions).length} rules` : '—' },
        { key: 'updated_at', label: 'Updated', render: (group) => new Date(group.updated_at).toLocaleDateString() },
      ]}
    />
  )
}

export function AdminOrganizationsView() {
  return (
    <AdminResourceTable<AdminOrganization>
      title="Organizations"
      path="/organizations"
      rowsKey="organizations"
      emptyLabel="No organizations found"
      columns={[
        { key: 'name', label: 'Organization', render: (org) => <span className="adm-strong">{org.name}</span> },
        { key: 'slug', label: 'Slug', render: (org) => <span className="adm-mono">{org.slug}</span> },
        { key: 'status', label: 'Status', render: (org) => <span className={`adm-status-badge ${org.status === 'active' ? 'adm-ok' : 'adm-neutral'}`}>{org.status}</span> },
        { key: 'owner_user_id', label: 'Owner', render: (org) => <span className="adm-mono adm-truncate" title={org.owner_user_id}>{org.owner_user_id || '—'}</span> },
      ]}
    />
  )
}

export function AdminWorkspacesView() {
  return (
    <AdminResourceTable<AdminWorkspace>
      title="Workspaces"
      path="/workspaces"
      rowsKey="workspaces"
      emptyLabel="No workspaces found"
      columns={[
        { key: 'name', label: 'Workspace', render: (workspace) => <span className="adm-strong">{workspace.name}</span> },
        { key: 'slug', label: 'Slug', render: (workspace) => <span className="adm-mono">{workspace.slug}</span> },
        { key: 'organization_id', label: 'Organization', render: (workspace) => <span className="adm-mono adm-truncate" title={workspace.organization_id}>{workspace.organization_id}</span> },
        { key: 'status', label: 'Status', render: (workspace) => <span className={`adm-status-badge ${workspace.status === 'active' ? 'adm-ok' : 'adm-neutral'}`}>{workspace.status}</span> },
      ]}
    />
  )
}

export function AdminAuditView() {
  const [offset, setOffset] = useState(0)
  const [data, setData] = useState<AuditPage | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (off: number) => {
    setLoading(true)
    try {
      const res = await api.get<AuditPage>(`/audit/logs?limit=${AUDIT_LIMIT}&offset=${off}`)
      setData(res)
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load(offset) }, [load, offset])

  const hasNext = data ? data.count > offset + AUDIT_LIMIT : false
  const hasPrev = offset > 0

  function auditStatusClass(s: string) {
    if (s === 'success') return 'adm-ok'
    if (s === 'failed') return 'adm-fail'
    return 'adm-neutral'
  }

  return (
    <div className="adm-root">
      <header className="adm-header">
        <div>
          <h1>Audit Logs</h1>
        </div>
        <button className="adm-ghost-btn" onClick={() => load(offset)} disabled={loading}>
          <Sync size={11} className={loading ? 'spin' : ''} /> Refresh
        </button>
      </header>

      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Actor</th>
              <th>Action</th>
              <th>Resource</th>
              <th>IP</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="adm-td-center"><Sync size={13} className="spin" /> Loading…</td></tr>
            ) : !data?.logs.length ? (
              <tr><td colSpan={6} className="adm-td-center adm-muted">No logs found</td></tr>
            ) : data.logs.map((e) => (
              <tr key={e.id}>
                <td className="adm-muted adm-nowrap">{new Date(e.created_at * 1000).toLocaleString()}</td>
                <td className="adm-mono adm-truncate" title={e.actor_user_id}>{e.actor_user_id}</td>
                <td className="adm-mono">{e.action}</td>
                <td className="adm-muted">
                  {e.resource_type
                    ? `${e.resource_type}${e.resource_id ? ':' + e.resource_id.slice(0, 8) : ''}`
                    : '—'}
                </td>
                <td className="adm-muted adm-mono">{e.ip_address ?? '—'}</td>
                <td>
                  <span className={`adm-status-badge ${auditStatusClass(e.status)}`}>{e.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(hasPrev || hasNext) && (
        <div className="adm-pagination">
          <button className="adm-page-btn" onClick={() => setOffset((o) => Math.max(0, o - AUDIT_LIMIT))} disabled={!hasPrev}>
            <Left size={11} />
          </button>
          <span className="adm-page-info">
            {offset + 1}–{Math.min(offset + AUDIT_LIMIT, data?.count ?? 0)} of {data?.count ?? 0}
          </span>
          <button className="adm-page-btn" onClick={() => setOffset((o) => o + AUDIT_LIMIT)} disabled={!hasNext}>
            <Right size={11} />
          </button>
        </div>
      )}
    </div>
  )
}

export function AdminQuotasView() {
  const [data, setData] = useState<UsageSummary | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get<UsageSummary>('/quotas')
      setData(res)
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const grouped: Record<string, UsageEntry[]> = {}
  for (const e of data?.entries ?? []) {
    ;(grouped[e.metric] ??= []).push(e)
  }

  return (
    <div className="adm-root">
      <header className="adm-header">
        <div>
          <h1>Usage &amp; Quotas</h1>
        </div>
        <button className="adm-ghost-btn" onClick={load} disabled={loading}>
          <Sync size={11} className={loading ? 'spin' : ''} /> Refresh
        </button>
      </header>

      {loading ? (
        <div className="adm-empty"><Sync size={16} className="spin" /> Loading…</div>
      ) : !data || !data.entries.length ? (
        <div className="adm-empty adm-muted">No usage data available.</div>
      ) : (
        <div className="adm-quota-grid">
          {Object.entries(grouped).map(([metric, entries]) => {
            const total = entries.reduce((s, e) => s + e.count, 0)
            return (
              <div key={metric} className="adm-quota-card">
                <div className="adm-quota-metric">{metric.replace(/_/g, ' ')}</div>
                <div className="adm-quota-total">{total.toLocaleString()}</div>
                <div className="adm-quota-periods">
                  {entries.slice(0, 5).map((e) => (
                    <div key={e.period_key} className="adm-quota-period-row">
                      <span className="adm-muted">{e.period} {e.period_key}</span>
                      <span>{e.count.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

type Column<T> = {
  key: string
  label: string
  render: (row: T) => React.ReactNode
}

function AdminResourceTable<T extends { id: string }>({
  title,
  path,
  rowsKey,
  emptyLabel,
  columns,
}: {
  title: string
  path: string
  rowsKey: string
  emptyLabel: string
  columns: Column<T>[]
}) {
  const [rows, setRows] = useState<T[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get<Record<string, unknown>>(path)
      setRows((res[rowsKey] as T[] | undefined) ?? [])
    } catch {
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [path, rowsKey])

  useEffect(() => { load() }, [load])

  return (
    <div className="adm-root">
      <header className="adm-header">
        <div>
          <h1>{title}</h1>
        </div>
        <button className="adm-ghost-btn" onClick={load} disabled={loading}>
          <Sync size={11} className={loading ? 'spin' : ''} /> Refresh
        </button>
      </header>

      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead>
            <tr>
              {columns.map((column) => <th key={column.key}>{column.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={columns.length} className="adm-td-center"><Sync size={13} className="spin" /> Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={columns.length} className="adm-td-center adm-muted">{emptyLabel}</td></tr>
            ) : rows.map((row) => (
              <tr key={row.id}>
                {columns.map((column) => <td key={column.key}>{column.render(row)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export const ADMIN_CSS = `
.adm-root { display: flex; flex-direction: column; gap: var(--space-7); width: 100%; min-width: 0; }
.adm-header { min-height: 52px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: var(--space-5); margin-bottom: 0; }
.adm-header h1 { font-size: var(--font-size-base); font-weight: 700; margin: 0; color: var(--color-text); }
.adm-header p { display: none; }
.adm-ghost-btn { background: none; border: 1px solid var(--color-border); color: var(--color-text-secondary); font-size: 11px; font-weight: 600; display: flex; align-items: center; gap: 5px; cursor: pointer; padding: 5px 10px; border-radius: 6px; }
.adm-ghost-btn:hover { background: var(--color-hover); }
.adm-ghost-btn:disabled { opacity: 0.5; cursor: default; }
.adm-search { background: var(--color-surface); border: 1px solid var(--color-border); padding: 7px 10px; border-radius: 7px; color: var(--color-text); font-size: 11px; outline: none; width: min(360px, 100%); font-family: inherit; }
.adm-search:focus { border-color: var(--color-primary); }

.adm-table-wrap { width: 100%; background: var(--color-bg); border: 1px solid var(--color-border); border-radius: 9px; overflow: auto; }
.adm-table { width: 100%; min-width: 720px; border-collapse: collapse; font-size: 11px; }
.adm-table thead { background: var(--color-surface); }
.adm-table th { padding: 8px 11px; text-align: left; font-size: 10px; font-weight: 800; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.06em; border-bottom: 1px solid var(--color-border); }
.adm-table td { padding: 8px 11px; border-bottom: 1px solid var(--color-border-subtle); color: var(--color-text); vertical-align: middle; }
.adm-table tbody tr:last-child td { border-bottom: none; }
.adm-table tbody tr:hover { background: var(--color-surface); }
.adm-td-center { text-align: center; padding: 32px !important; }
.adm-muted { color: var(--color-text-muted); }
.adm-mono { font-family: var(--font-mono, monospace); font-size: 10px; }
.adm-nowrap { white-space: nowrap; }
.adm-truncate { max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.adm-strong { font-weight: 600; }

.adm-user-cell { display: flex; align-items: center; gap: 8px; }
.adm-avatar { width: 28px; height: 28px; border-radius: 50%; background: var(--color-surface); border: 1px solid var(--color-border); display: flex; align-items: center; justify-content: center; color: var(--color-text-muted); flex-shrink: 0; }
.adm-user-name { font-weight: 600; }
.adm-roles { display: flex; flex-wrap: wrap; gap: 3px; }
.adm-role-chip { font-size: 10px; font-weight: 700; padding: 2px 5px; border-radius: 3px; background: rgba(239,124,47,0.1); color: var(--color-primary); }

.adm-status-badge { font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; }
.adm-ok { background: rgba(111,183,123,0.12); color: var(--color-success); }
.adm-fail { background: rgba(201,107,92,0.1); color: var(--color-error); }
.adm-inactive { background: var(--color-surface); color: var(--color-text-muted); }
.adm-neutral { background: var(--color-surface); color: var(--color-text-muted); }

.adm-pagination { display: flex; align-items: center; justify-content: center; gap: 11px; padding: 8px 0; }
.adm-page-btn { background: var(--color-surface); border: 1px solid var(--color-border); color: var(--color-text); padding: 4px 8px; border-radius: 5px; cursor: pointer; display: flex; align-items: center; }
.adm-page-btn:hover:not(:disabled) { border-color: var(--color-primary); }
.adm-page-btn:disabled { opacity: 0.4; cursor: default; }
.adm-page-info { font-size: 11px; color: var(--color-text-muted); }

.adm-empty { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 42px 0; color: var(--color-text-muted); font-size: 12px; }
.adm-quota-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }
.adm-quota-card { background: var(--color-bg); border: 1px solid var(--color-border); border-radius: 9px; padding: 13px; }
.adm-quota-metric { font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; color: var(--color-text-muted); margin-bottom: 8px; }
.adm-quota-total { font-size: 24px; font-weight: 800; color: var(--color-text); margin-bottom: 12px; }
.adm-quota-periods { display: flex; flex-direction: column; gap: 3px; }
.adm-quota-period-row { display: flex; justify-content: space-between; font-size: 10px; padding: 2px 0; border-top: 1px solid var(--color-border-subtle); }

.spin { animation: spin 1s linear infinite; }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
`
