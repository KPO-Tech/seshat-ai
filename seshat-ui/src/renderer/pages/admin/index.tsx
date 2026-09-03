import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import {
  Api,
  Book,
  Browser,
  Calendar,
  Computer,
  Earth,
  LinkCloud,
  LinkFour,
  Lock,
  Peoples,
  PlugOne,
  Robot,
  SendEmail,
  Shield,
  Tool,
  User,
  Info,
} from '@icon-park/react'
import { useAuthStore } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'
import { api } from '@/api/client'
import { WorkspacePage } from '@/pages/workspace'
import type { AdminOrganization, AdminAutomationJob, EmbedderConfig } from '@/api/types'
import { PROVIDERS_CSS } from '@/pages/settings/ProvidersView'
import { AdminProvidersView } from '@/pages/admin/AdminProvidersView'
import { AdminWebSearchView } from '@/pages/admin/AdminWebSearchView'
import { AdminTeamsView } from '@/pages/admin/AdminTeamsView'
import { AdminUsersView } from '@/pages/admin/AdminUsersView'
import { AdminDesktopPoliciesView } from '@/pages/admin/AdminDesktopPoliciesView'
import { AdminAgentPresetsView } from '@/pages/admin/AdminAgentPresetsView'
import { KnowledgeView } from '@/pages/settings/KnowledgeView'
import { MultimodalView, MULTIMODAL_CSS } from '@/pages/settings/CapabilitiesViews'
import { RuntimeView } from '@/pages/settings'
import {
  AdminAuditView,
  ADMIN_CSS,
  type AuditEntry,
} from '@/pages/settings/AdminViews'
import { SETTINGS_SHARED_CSS } from '@/pages/settings/SettingsNav'
import { AdminConnectorsView } from '@/pages/admin/AdminConnectorsView'
import { AdminMCPServersView } from '@/pages/admin/AdminMCPServersView'
import { AdminInvitationsView } from '@/pages/admin/AdminInvitationsView'

type AdminTab =
  | 'overview'
  | 'users'
  | 'teams'
  | 'invitations'
  | 'audit'
  | 'desktopPolicies'
  | 'agents'
  | 'documents'
  | 'tools'
  | 'providers'
  | 'knowledge'
  | 'multimodal'
  | 'connectors'
  | 'mcpServers'
  | 'websearch'
  | 'runtime'

type AdminItem = {
  id: AdminTab
  label: string
  icon: React.ReactNode
}

const ADMIN_GROUPS: Array<{ title: string; items: AdminItem[] }> = [
  {
    title: 'Organization',
    items: [
      { id: 'overview', label: 'Overview', icon: <Shield size={15} /> },
      { id: 'users', label: 'Users', icon: <User size={15} /> },
      { id: 'teams', label: 'Teams', icon: <Peoples size={15} /> },
      { id: 'invitations', label: 'Invitations', icon: <SendEmail size={15} /> },
      { id: 'audit', label: 'Audit Logs', icon: <Info size={15} /> },
      { id: 'desktopPolicies', label: 'Desktop Policies', icon: <Lock size={15} /> },
    ],
  },
  {
    title: 'Workspace',
    items: [
      { id: 'agents', label: 'Agents', icon: <Robot size={15} /> },
      { id: 'documents', label: 'Documents', icon: <Book size={15} /> },
      { id: 'tools', label: 'Tools & MCP', icon: <Tool size={15} /> },
    ],
  },
  {
    title: 'AI Core',
    items: [
      { id: 'providers', label: 'Providers', icon: <Browser size={15} /> },
      { id: 'knowledge', label: 'Knowledge', icon: <Book size={15} /> },
      { id: 'multimodal', label: 'Multimodal', icon: <Api size={15} /> },
      { id: 'connectors', label: 'Connectors', icon: <PlugOne size={15} /> },
      { id: 'mcpServers', label: 'MCP Servers', icon: <LinkFour size={15} /> },
    ],
  },
  {
    title: 'Runtime',
    items: [
      { id: 'websearch', label: 'Web Search', icon: <Earth size={15} /> },
      { id: 'runtime', label: 'Runtime', icon: <Computer size={15} /> },
    ],
  },
]

const WORKSPACE_TABS = new Set<AdminTab>(['documents', 'tools'])

// Tabs whose data only exists at the organization level — meaningless
// without a connected seshat-server, unlike Workspace/Knowledge/Multimodal/
// Runtime which configure this local install. Audit Logs is deliberately
// NOT here despite looking like an organization concept: it always shows
// something (this device's own local activity log when standalone, the
// org's real audit trail once connected and admin - see
// internal/api/audit.go), so gating it behind "requires an organization
// server" would be actively misleading. Users/Providers/Web Search/Teams
// all genuinely have nothing to show or configure without a connected
// organization: Providers/Web Search write straight to seshat-server's
// organization-wide settings (personal keys stay in Settings, unaffected),
// and Teams replaced the old local "Groups" tab (a per-device feature-
// permission bundle with no organization concept at all) with a real proxy
// onto seshat-server's iam.Group - the same "Teams" store seshat-console's
// TeamsPage.tsx edits (see docs/helps/... "Admin Console" architecture
// item). Desktop Policies joined for the same reason: it manages
// seshat-server's real iam.DesktopPolicyBinding rows (the same ones
// seshat-console's DesktopPoliciesPage.tsx edits) - there is no local
// equivalent, only the read-only resolved bundle every device already syncs
// via /automation/status (see hooks/useDesktopPolicies.ts). Agents joined
// too: it used to be a WORKSPACE_TABS pass-through showing this device's own
// personal agents (not an admin concern at all, and already available from
// the regular Workspace nav, unaffected by this change) - it's now
// AdminAgentPresetsView, real CRUD on the organization's shared agent
// preset catalog (seshat-server's agentregistry.AgentPreset, the same store
// seshat-console's AgentPresetsPage.tsx edits and this device's own Agents
// view already reads read-only as an enrichment). Invitations joined for the
// same reason as Teams: it proxies onto seshat-server's real iam.Invitation
// store (the same one seshat-console's InvitationsPage.tsx edits) - a
// pending/accepted/revoked/expired invite by email has no meaning without an
// organization to invite someone into. Quotas ("My Usage") is NOT in this
// console at all anymore, for the same reason Audit Logs almost wasn't:
// `GET /quotas` (handleQuotas, no admin check at all) always returns the
// caller's own personal usage counters — seshat-server's own quotas.Service
// doc comment calls this domain "strictly personal, no organization, no
// shared setting". Living inside "Admin Console" (gated behind `isAdmin`
// below) meant a non-admin member had no way to see their own usage at all;
// it moved to the regular Settings page instead (PERSONAL group, "Usage"
// tab - see settings/index.tsx), reachable by everyone. Connectors and MCP
// Servers joined for the same reason as
// Providers: both proxy straight onto seshat-server's own stores
// (connectors.Service's ConnectorOAuthApp rows, mcpregistry's
// MCPServerConfig rows) - the exact same ones seshat-console's
// ConnectorsPage.tsx and MCPServersPage.tsx edit - with nothing local to
// fall back to.
const ORGANIZATION_TABS = new Set<AdminTab>([
  'users',
  'providers',
  'websearch',
  'teams',
  'invitations',
  'desktopPolicies',
  'agents',
  'connectors',
  'mcpServers',
])

type SystemStatus = { mode: 'standalone' | 'connected'; server_url?: string }

export function AdminConsolePage() {
  const location = useLocation()
  const navigate = useNavigate()
  const roles = useAuthStore((s) => s.roles)
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed)
  const requestedTab = new URLSearchParams(location.search).get('tab')
  const initialTab = isAdminTab(requestedTab) ? requestedTab : 'overview'
  const [activeTab, setActiveTab] = useState<AdminTab>(initialTab)
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null)
  const isAdmin = roles.includes('admin')
  const isConnected = systemStatus?.mode === 'connected'

  useEffect(() => {
    useUIStore.getState().closeAllRightPanels()
  }, [])

  useEffect(() => {
    api.get<SystemStatus>('/system/status')
      .then(setSystemStatus)
      .catch(() => setSystemStatus(null))
  }, [])

  useEffect(() => {
    if (isAdminTab(requestedTab)) setActiveTab(requestedTab)
  }, [requestedTab])

  return (
    <div className="admin-console">
      <style>{SETTINGS_SHARED_CSS}</style>
      <style>{PROVIDERS_CSS}</style>
      <style>{MULTIMODAL_CSS}</style>
      <style>{ADMIN_CSS}</style>
      <style>{ADMIN_CONSOLE_CSS}</style>

      <aside className={`admin-rail ${sidebarCollapsed ? 'shell-collapsed' : ''}`}>
        <div className="admin-rail-head">
          <Shield size={16} />
          <span>Admin Console</span>
        </div>
        <nav className="admin-nav">
          {ADMIN_GROUPS.map((group) => (
            <div key={group.title} className="admin-nav-group">
              <div className="admin-nav-title">{group.title}</div>
              {group.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`admin-nav-item ${activeTab === item.id ? 'active' : ''}`}
                  onClick={() => setActiveTab(item.id)}
                >
                  {item.icon}
                  <span>{item.label}</span>
                  {ORGANIZATION_TABS.has(item.id) && !isConnected && <LinkCloud size={11} className="admin-nav-cloud-badge" />}
                </button>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      <main className="admin-content">
        {!isAdmin ? (
          <div className="admin-locked">
            <Shield size={28} />
            <h1>Admin access required</h1>
            <p>This console is reserved for organization administrators.</p>
          </div>
        ) : ORGANIZATION_TABS.has(activeTab) && !isConnected ? (
          <OrganizationTabLocked onGoToSettings={() => navigate('/settings?tab=runtime')} />
        ) : (
          <AdminPanel activeTab={activeTab} />
        )}
      </main>
    </div>
  )
}

function isAdminTab(value: string | null): value is AdminTab {
  if (!value) return false
  return ADMIN_GROUPS.some((group) => group.items.some((item) => item.id === value))
}

function OrganizationTabLocked({ onGoToSettings }: { onGoToSettings: () => void }) {
  return (
    <div className="admin-org-locked">
      <LinkCloud size={23} />
      <h2>This requires an organization server</h2>
      <p>
        Users, teams, invitations, desktop policies, agent presets, organization-wide providers, connectors, MCP
        servers, and the web search policy are managed by your organization's Seshat Server. Connect this machine to
        one in Settings → Cloud Automation to see and manage them.
      </p>
      <button className="admin-org-locked-cta" onClick={onGoToSettings}>
        <LinkCloud size={11} /> Go to Cloud Automation settings
      </button>
    </div>
  )
}

function AdminPanel({ activeTab }: { activeTab: AdminTab }) {
  if (activeTab === 'overview') return <AdminOverview />
  if (activeTab === 'users') return <AdminUsersView />
  if (activeTab === 'teams') return <AdminTeamsView />
  if (activeTab === 'invitations') return <AdminInvitationsView />
  if (activeTab === 'audit') return <AdminAuditView />
  if (activeTab === 'desktopPolicies') return <AdminDesktopPoliciesView />
  if (activeTab === 'agents') return <AdminAgentPresetsView />
  if (activeTab === 'providers') return <AdminProvidersView />
  if (activeTab === 'knowledge') return <KnowledgeView />
  if (activeTab === 'multimodal') return <MultimodalView />
  if (activeTab === 'connectors') return <AdminConnectorsView />
  if (activeTab === 'mcpServers') return <AdminMCPServersView />
  if (activeTab === 'websearch') return <AdminWebSearchView />
  if (activeTab === 'runtime') return <RuntimeView />
  if (WORKSPACE_TABS.has(activeTab)) {
    return <WorkspacePage key={activeTab} initialTab={activeTab as 'documents' | 'tools'} embedded />
  }
  return null
}

// useAdminList — shared fetch shape behind every count/list this overview
// shows: every proxy handler in this app returns `{ <key>: T[], count }`
// (see admin_memberships.go, automation_jobs.go, knowledge.go, ...), so one
// hook covers members/invitations/teams/jobs/devices/providers/connectors/
// audit logs alike. count stays null on failure (e.g. standalone mode,
// where the connected-only endpoints 400) rather than 0, so a real empty
// state is never confused with "couldn't check" — see the "—" rendering in
// StatTile/SetupRow below.
function useAdminList<T>(path: string, key: string): { items: T[]; count: number | null; loading: boolean } {
  const [items, setItems] = useState<T[]>([])
  const [count, setCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api.get<Record<string, unknown>>(path)
      .then((data) => {
        if (cancelled) return
        const list = ((data?.[key] as T[] | undefined) ?? [])
        setItems(list)
        setCount(typeof data?.count === 'number' ? (data.count as number) : list.length)
      })
      .catch(() => {
        if (cancelled) return
        setItems([])
        setCount(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [path, key])

  return { items, count, loading }
}

function useEmbedderConfig(): { config: EmbedderConfig | null; loading: boolean } {
  const [config, setConfig] = useState<EmbedderConfig | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    api.get<EmbedderConfig>('/settings/embedder')
      .then((data) => {
        if (!cancelled) setConfig(data ?? null)
      })
      .catch(() => {
        if (!cancelled) setConfig(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return { config, loading }
}

function timeAgo(ms: number): string {
  const minutes = Math.round((Date.now() - ms) / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

function jobStatusClass(status?: string): string {
  if (status === 'completed') return 'adm-ok'
  if (status === 'running' || status === 'claimed') return 'adm-warn'
  if (status === 'failed') return 'adm-fail'
  return 'adm-neutral'
}

type OverviewAlert = {
  title: string
  description: string
  actionLabel: string
  action: () => void
  tone: 'warning' | 'info'
}

function AdminOverview() {
  const navigate = useNavigate()
  const [organization, setOrganization] = useState<AdminOrganization | null>(null)
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null)

  useEffect(() => {
    let cancelled = false
    void api.get<{ organizations: AdminOrganization[] }>('/organizations')
      .then((response) => {
        if (!cancelled) setOrganization(response.organizations?.[0] ?? null)
      })
      .catch(() => {
        if (!cancelled) setOrganization(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    api.get<SystemStatus>('/system/status')
      .then((data) => {
        if (!cancelled) setSystemStatus(data)
      })
      .catch(() => {
        if (!cancelled) setSystemStatus(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const members = useAdminList<unknown>('/admin/memberships', 'memberships')
  const invites = useAdminList<unknown>('/admin/invitations?status=pending', 'invitations')
  const teams = useAdminList<unknown>('/admin/teams', 'teams')
  const jobs = useAdminList<AdminAutomationJob>('/automation/jobs', 'jobs')
  const devices = useAdminList<unknown>('/automation/devices', 'devices')
  const providerSettings = useAdminList<unknown>('/admin/provider-settings', 'provider_settings')
  const connectors = useAdminList<unknown>('/admin/connector-oauth-apps', 'oauth_apps')
  const auditEvents = useAdminList<AuditEntry>('/audit/logs?limit=6&offset=0', 'logs')
  const { config: embedderConfig } = useEmbedderConfig()

  const isConnected = systemStatus?.mode === 'connected'

  const alerts: OverviewAlert[] = []

  if (systemStatus && !isConnected) {
    alerts.push({
      title: 'Not connected to an organization server',
      description: 'Users, teams, invitations, providers, connectors, and every other organization feature need a connected Seshat Server before they show real data.',
      actionLabel: 'Go to Cloud Automation',
      action: () => navigate('/admin?tab=runtime'),
      tone: 'warning',
    })
  }

  if (isConnected && providerSettings.count === 0) {
    alerts.push({
      title: 'No provider credentials configured',
      description: "Cloud jobs and chat will rely on this platform's default organization's credentials until this organization has its own.",
      actionLabel: 'Open Providers',
      action: () => navigate('/admin?tab=providers'),
      tone: 'warning',
    })
  }

  if (embedderConfig && !embedderConfig.is_configured) {
    alerts.push({
      title: 'No embedder configured on this device',
      description: 'Knowledge ingestion and search will fall back to plain-text matching until this device has an embedder set up.',
      actionLabel: 'Open Knowledge',
      action: () => navigate('/admin?tab=knowledge'),
      tone: 'info',
    })
  }

  if (isConnected && jobs.count !== null && devices.count !== null && jobs.count > 0 && devices.count === 0) {
    alerts.push({
      title: 'Automation has jobs but no devices',
      description: 'Device-targeted runs need at least one registered desktop to execute locally.',
      actionLabel: 'Open Runtime',
      action: () => navigate('/admin?tab=runtime'),
      tone: 'warning',
    })
  }

  return (
    <div className="admin-overview">
      <header className="admin-page-head">
        <div>
          <h1>{organization?.name || 'Admin Console'}</h1>
        </div>
        <div className="admin-org-chip">
          <span>Organization</span>
          <strong>{organization?.name || 'Current organization'}</strong>
        </div>
      </header>

      <div className="admin-stat-grid">
        <StatTile label="Team Members" value={members.count} loading={members.loading} icon={<User size={17} />} sublabel="Active members" />
        <StatTile label="Pending Invites" value={invites.count} loading={invites.loading} icon={<SendEmail size={17} />} sublabel="Awaiting accept" />
        <StatTile label="Automation Jobs" value={jobs.count} loading={jobs.loading} icon={<Calendar size={17} />} sublabel="Configured tasks" />
        <StatTile label="Worker Devices" value={devices.count} loading={devices.loading} icon={<Computer size={17} />} sublabel="Registered runners" />
        <StatTile label="Teams" value={teams.count} loading={teams.loading} icon={<Peoples size={17} />} sublabel="Member groups" />
      </div>

      <section className="admin-section-card">
        <h2>Needs Attention</h2>
        {alerts.length > 0 ? (
          <div className="admin-alert-grid">
            {alerts.map((alert) => (
              <div key={alert.title} className={`admin-alert admin-alert--${alert.tone}`}>
                <div className="admin-alert-title">{alert.title}</div>
                <div className="admin-alert-desc">{alert.description}</div>
                <button type="button" className="admin-alert-btn" onClick={alert.action}>{alert.actionLabel}</button>
              </div>
            ))}
          </div>
        ) : (
          <div className="admin-empty">This organization is fully configured and operational.</div>
        )}
      </section>

      <div className="admin-detail-grid">
        <section className="admin-section-card">
          <h2>Setup Status</h2>
          <div className="admin-setup-list">
            <SetupRow
              label="Organization Connection"
              ok={isConnected}
              okText="Connected"
              badText="Standalone"
              detail={isConnected ? (systemStatus?.server_url || 'Connected to an organization server.') : 'This device is not connected to an organization server.'}
            />
            <SetupRow
              label="AI Credentials"
              ok={(providerSettings.count ?? 0) > 0}
              okText={`${providerSettings.count ?? 0} Configured`}
              badText="Missing"
              detail={
                providerSettings.loading
                  ? 'Checking provider settings…'
                  : (providerSettings.count ?? 0) > 0
                    ? `${providerSettings.count} provider setting(s) active.`
                    : 'No provider setting configured yet.'
              }
            />
            <SetupRow
              label="Embedder & Search"
              ok={Boolean(embedderConfig?.is_configured)}
              okText="Configured"
              badText="Not configured"
              detail={
                !embedderConfig
                  ? 'Checking embedder…'
                  : embedderConfig.is_configured
                    ? `Model: ${embedderConfig.model || 'configured'} (this device)`
                    : 'No embedder configured on this device yet.'
              }
            />
            <SetupRow
              label="Connectors"
              ok={(connectors.count ?? 0) > 0}
              okText={`${connectors.count ?? 0} Connected`}
              badText="None"
              detail={
                connectors.loading
                  ? 'Checking connectors…'
                  : (connectors.count ?? 0) > 0
                    ? `${connectors.count} connector app(s) configured.`
                    : 'No connector apps configured yet.'
              }
            />
          </div>
        </section>

        <section className="admin-section-card admin-section-card--flush">
          <h2>Recent Activity</h2>
          {auditEvents.loading ? (
            <div className="admin-empty">Loading…</div>
          ) : auditEvents.items.length ? (
            auditEvents.items.map((event, index) => (
              <div key={event.id} className="admin-list-row" style={index === 0 ? { borderTop: 'none' } : undefined}>
                <div style={{ minWidth: 0 }}>
                  <span className="admin-mono-tag">{event.action}</span>
                  <div className="adm-muted" style={{ fontSize: 12, marginTop: 4 }}>
                    {event.resource_type}
                    {event.resource_id ? ` · ${event.resource_id}` : ''}
                  </div>
                </div>
                <span className="adm-muted" style={{ fontSize: 11, flexShrink: 0 }}>{timeAgo(event.created_at * 1000)}</span>
              </div>
            ))
          ) : (
            <div className="admin-empty">No activity yet</div>
          )}
        </section>

        <section className="admin-section-card admin-section-card--flush">
          <h2>Recent Jobs</h2>
          {jobs.loading ? (
            <div className="admin-empty">Loading…</div>
          ) : jobs.items.length ? (
            jobs.items.slice(0, 6).map((job, index) => (
              <div key={job.id} className="admin-list-row" style={index === 0 ? { borderTop: 'none' } : undefined}>
                <div style={{ minWidth: 0 }}>
                  <div className="adm-strong" style={{ fontSize: 12.5 }}>{job.name}</div>
                  <div className="adm-muted" style={{ fontSize: 11, marginTop: 2 }}>{job.execution_target}</div>
                </div>
                <span className={`adm-status-badge ${jobStatusClass(job.last_run_status || job.status)}`}>
                  {job.last_run_status || job.status}
                </span>
              </div>
            ))
          ) : (
            <div className="admin-empty">No jobs yet</div>
          )}
        </section>
      </div>
    </div>
  )
}

function StatTile({
  label,
  value,
  icon,
  loading,
  sublabel,
}: {
  label: string
  value: number | null
  icon: React.ReactNode
  loading: boolean
  sublabel?: string
}) {
  return (
    <div className="admin-stat-card">
      <div className="admin-stat-main">
        <div className="admin-stat-label">{label}</div>
        <div className="admin-stat-value">{loading ? '···' : value ?? '—'}</div>
        {sublabel && <div className="admin-stat-sublabel">{sublabel}</div>}
      </div>
      <div className="admin-stat-icon">{icon}</div>
    </div>
  )
}

function SetupRow({
  label,
  ok,
  okText,
  badText,
  detail,
}: {
  label: string
  ok: boolean
  okText: string
  badText: string
  detail: string
}) {
  return (
    <div className="admin-setup-row">
      <div className="admin-setup-row-head">
        <span className="admin-setup-row-label">{label}</span>
        <span className={`adm-status-badge ${ok ? 'adm-ok' : 'adm-warn'}`}>{ok ? okText : badText}</span>
      </div>
      <div className="admin-setup-row-detail">{detail}</div>
    </div>
  )
}

const ADMIN_CONSOLE_CSS = `
.admin-console {
  display: grid;
  grid-template-columns: 244px minmax(0, 1fr);
  width: 100%;
  height: 100%;
  min-width: 0;
  overflow: hidden;
  background: var(--color-surface);
  color: var(--color-text);
}

.admin-rail {
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  border-right: 1px solid var(--color-border-subtle);
  background: var(--color-bg);
  padding: var(--space-7) var(--space-5);
}

.admin-rail-head {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  height: 30px;
  padding: 0 var(--space-4);
  color: var(--color-text);
  font-size: var(--font-size-base);
  font-weight: 700;
}

.admin-nav {
  display: flex;
  flex-direction: column;
  gap: var(--space-7);
  margin-top: var(--space-7);
}

.admin-nav-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.admin-nav-title {
  padding: 0 var(--space-4) var(--space-2);
  color: var(--color-text-muted);
  font-size: var(--font-size-2xs);
  font-weight: 800;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.admin-nav-item {
  width: 100%;
  height: 30px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-secondary);
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding: 0 var(--space-4);
  font-size: var(--font-size-sm);
  font-weight: 650;
  text-align: left;
  cursor: pointer;
}

.admin-nav-item:hover {
  background: var(--color-hover);
  color: var(--color-text);
}

.admin-nav-item.active {
  background: var(--color-primary-subtle);
  color: var(--color-cta);
}

.admin-content {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  display: flex;
}

.admin-content > .wk-root {
  flex: 1;
  min-width: 0;
}

.admin-content > .sv-view,
.admin-content > .ws-root,
.admin-content > .pv-root,
.admin-content > .adm-root,
.admin-overview,
.admin-locked {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  padding: var(--space-8);
}

.admin-content > .sv-view,
.admin-content > .ws-root,
.admin-content > .pv-root,
.admin-content > .adm-root {
  max-width: none;
}

.admin-content .sv-view-header,
.admin-content .pv-header,
.admin-content .adm-header {
  min-height: 52px;
  align-items: center;
  border-bottom: 1px solid var(--color-border-subtle);
  margin: calc(var(--space-8) * -1) calc(var(--space-8) * -1) var(--space-7);
  padding: 0 var(--space-8);
}

.admin-content .sv-header-info h1,
.admin-content .pv-header-info h1,
.admin-content .adm-header h1 {
  margin: 0;
}

.admin-content .adm-table-wrap {
  flex: 1;
}

.admin-content .wk-root.embedded .wk-topbar {
  grid-template-columns: minmax(0, 1fr) auto;
}

.admin-content .wk-root.embedded .wk-logo-wrap {
  display: none;
}

.admin-content .wk-root.embedded .wk-body,
.admin-content .wk-root.embedded .wk-workspace,
.admin-content .wk-root.embedded .wk-grid-root,
.admin-content .wk-root.embedded .wk-documents,
.admin-content .wk-root.embedded .wk-tools-root {
  position: relative;
}

.admin-content .sv-grid {
  grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
  align-items: start;
}

.admin-content .pv-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(420px, 1fr));
  gap: var(--space-5);
}

.admin-content .pv-card {
  margin-bottom: 0;
}

.admin-content .pv-card.expanded {
  grid-column: 1 / -1;
}

.admin-content .pv-body-layout {
  grid-template-columns: minmax(0, 1fr) minmax(280px, 360px);
  gap: var(--space-8);
}

.admin-content .ws-layout {
  grid-template-columns: repeat(2, minmax(320px, 1fr));
  align-items: start;
}

.admin-content .ws-layout > .sv-card:not(.ws-full-card) {
  min-height: 216px;
}

.admin-content .wsp-grid {
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
}

.admin-page-head {
  min-height: 56px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--color-border-subtle);
  margin: calc(var(--space-8) * -1) calc(var(--space-8) * -1) var(--space-8);
  padding: 0 var(--space-8);
}

.admin-org-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
  height: 30px;
  padding: 0 var(--space-5);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-bg);
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

.admin-org-chip strong {
  color: var(--color-text);
  font-size: var(--font-size-sm);
  font-weight: 700;
}

.admin-page-head h1,
.admin-locked h1 {
  margin: 0;
  font-size: var(--font-size-base);
  font-weight: 700;
}

.admin-page-head p,
.admin-locked p {
  margin: 4px 0 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}

.admin-stat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--space-6);
  margin-bottom: var(--space-8);
}

.admin-stat-card {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-5);
  padding: var(--space-6);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg);
}

.admin-stat-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--color-text-muted);
  margin-bottom: 6px;
}

.admin-stat-value {
  font-size: 26px;
  font-weight: 800;
  letter-spacing: -0.01em;
  font-variant-numeric: tabular-nums;
  color: var(--color-text);
  line-height: 1.1;
}

.admin-stat-sublabel {
  font-size: 12px;
  color: var(--color-text-muted);
  margin-top: 6px;
}

.admin-stat-icon {
  width: 38px;
  height: 38px;
  border-radius: var(--radius-sm);
  background: var(--color-primary-subtle);
  color: var(--color-cta);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.admin-section-card {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg);
  padding: var(--space-7);
  margin-bottom: var(--space-7);
}

.admin-section-card h2 {
  margin: 0 0 var(--space-6);
  font-size: var(--font-size-sm);
  font-weight: 700;
  color: var(--color-text);
}

.admin-section-card--flush {
  padding: var(--space-7) 0 0;
}

.admin-section-card--flush h2 {
  padding: 0 var(--space-7);
}

.admin-detail-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-7);
  align-items: start;
  margin-bottom: var(--space-8);
}

.admin-alert-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: var(--space-5);
}

.admin-alert {
  border-radius: var(--radius-sm);
  padding: var(--space-5);
  border: 1px solid;
}

.admin-alert--warning {
  background: rgba(214, 161, 95, 0.08);
  border-color: rgba(214, 161, 95, 0.3);
}

.admin-alert--info {
  background: rgba(var(--color-info-rgb), 0.08);
  border-color: rgba(var(--color-info-rgb), 0.3);
}

.admin-alert-title {
  font-size: 12.5px;
  font-weight: 700;
  color: var(--color-text);
  margin-bottom: 4px;
}

.admin-alert-desc {
  font-size: 12px;
  color: var(--color-text-muted);
  line-height: 1.5;
  margin-bottom: 10px;
}

.admin-alert-btn {
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  color: var(--color-text);
  font-size: 11px;
  font-weight: 650;
  padding: 5px 10px;
  border-radius: 6px;
  cursor: pointer;
}

.admin-alert-btn:hover {
  background: var(--color-hover);
}

.admin-empty {
  padding: var(--space-8) 0;
  text-align: center;
  color: var(--color-text-muted);
  font-size: 12px;
}

.admin-setup-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

.admin-setup-row {
  padding: var(--space-5);
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border-subtle);
  background: var(--color-surface);
}

.admin-setup-row-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  margin-bottom: 4px;
}

.admin-setup-row-label {
  font-size: 12.5px;
  font-weight: 650;
  color: var(--color-text);
}

.admin-setup-row-detail {
  font-size: 11.5px;
  color: var(--color-text-muted);
  line-height: 1.5;
}

.admin-list-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-5);
  padding: var(--space-5) var(--space-7);
  border-top: 1px solid var(--color-border-subtle);
}

.admin-mono-tag {
  display: inline-block;
  font-family: var(--font-mono, monospace);
  font-size: 10px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  color: var(--color-text-secondary);
}

@media (max-width: 1100px) {
  .admin-detail-grid {
    grid-template-columns: 1fr;
  }
}

.admin-locked {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  color: var(--color-text-muted);
}

.admin-nav-cloud-badge {
  margin-left: auto;
  color: var(--color-text-muted);
  flex-shrink: 0;
}

.admin-org-locked {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: var(--space-4);
  color: var(--color-text-muted);
  padding: var(--space-8);
}

.admin-org-locked h2 {
  margin: 0;
  font-size: var(--font-size-base);
  font-weight: 700;
  color: var(--color-text);
}

.admin-org-locked p {
  margin: 0;
  max-width: 420px;
  font-size: var(--font-size-sm);
  line-height: 1.5;
}

.admin-org-locked-cta {
  display: inline-flex;
  align-items: center;
  gap: var(--space-3);
  height: 30px;
  padding: 0 var(--space-6);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-bg);
  color: var(--color-text);
  font-size: var(--font-size-xs);
  font-weight: 650;
  cursor: pointer;
}

.admin-org-locked-cta:hover {
  background: var(--color-hover);
}
`
