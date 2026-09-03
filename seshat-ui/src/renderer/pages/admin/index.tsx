import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import {
  Api,
  Book,
  Browser,
  Computer,
  Earth,
  Flashlamp,
  LinkCloud,
  LinkFour,
  Lock,
  Peoples,
  PlugOne,
  Robot,
  Shield,
  Tool,
  User,
  Info,
} from '@icon-park/react'
import { useAuthStore } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'
import { api } from '@/api/client'
import { WorkspacePage } from '@/pages/workspace'
import type { AdminOrganization } from '@/api/types'
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
  AdminQuotasView,
  ADMIN_CSS,
} from '@/pages/settings/AdminViews'
import { SETTINGS_SHARED_CSS } from '@/pages/settings/SettingsNav'
import { AdminConnectorsView } from '@/pages/admin/AdminConnectorsView'
import { AdminMCPServersView } from '@/pages/admin/AdminMCPServersView'

type AdminTab =
  | 'overview'
  | 'users'
  | 'teams'
  | 'audit'
  | 'desktopPolicies'
  | 'quotas'
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
      { id: 'audit', label: 'Audit Logs', icon: <Info size={15} /> },
      { id: 'desktopPolicies', label: 'Desktop Policies', icon: <Lock size={15} /> },
    ],
  },
  {
    title: 'Your Account',
    items: [
      { id: 'quotas', label: 'My Usage', icon: <Flashlamp size={15} /> },
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
// view already reads read-only as an enrichment). Quotas is ALSO
// deliberately not here, for a different reason than Audit Logs: `GET
// /quotas` (handleQuotas, no admin check at all) always returns the
// caller's own personal usage counters — seshat-server's own
// quotas.Service doc comment calls this domain "strictly personal, no
// organization, no shared setting" (there is no org-aggregate quota concept
// anywhere in the platform). It used to be miscategorized under
// "Organization" and gated as if it needed a connected server, which was
// simply wrong on both counts - it lives under its own "Your Account" group
// instead now. Connectors and MCP Servers joined for the same reason as
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
        Users, teams, desktop policies, agent presets, organization-wide providers, connectors, MCP servers, and the
        web search policy are managed by your organization's Seshat Server. Connect this machine to one in Settings →
        Cloud Automation to see and manage them.
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
  if (activeTab === 'audit') return <AdminAuditView />
  if (activeTab === 'desktopPolicies') return <AdminDesktopPoliciesView />
  if (activeTab === 'agents') return <AdminAgentPresetsView />
  if (activeTab === 'quotas') return <AdminQuotasView />
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

function AdminOverview() {
  const [organization, setOrganization] = useState<AdminOrganization | null>(null)

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

  return (
    <div className="admin-overview">
      <header className="admin-page-head">
        <div>
          <h1>Admin Console</h1>
        </div>
        <div className="admin-org-chip">
          <span>Organization</span>
          <strong>{organization?.name || 'Current organization'}</strong>
        </div>
      </header>
      <div className="admin-overview-grid">
        <OverviewCard title="Organization" text="Current organization, members, teams, audit logs, and desktop policies." />
        <OverviewCard title="Your Account" text="Your own usage counters for this device - never a shared or organization-wide setting." />
        <OverviewCard title="Workspace" text="Agents, document collections, and MCP tools managed for the organization." />
        <OverviewCard title="AI Core" text="Provider credentials, knowledge infrastructure, and multimodal capabilities." />
        <OverviewCard title="Runtime" text="Web search policy, cloud automation, and local backend status." />
      </div>
    </div>
  )
}

function OverviewCard({ title, text }: { title: string; text: string }) {
  return (
    <section className="admin-overview-card">
      <h2>{title}</h2>
      <p>{text}</p>
    </section>
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

.admin-overview-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: var(--space-7);
}

.admin-overview-card {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg);
  padding: var(--space-7);
}

.admin-overview-card h2 {
  margin: 0;
  font-size: var(--font-size-base);
  font-weight: 700;
}

.admin-overview-card p {
  margin: var(--space-3) 0 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
  line-height: 1.5;
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
