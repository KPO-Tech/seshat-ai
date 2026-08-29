import { useEffect, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router'
import {
  Api, Brain, CloudStorage, ColorFilter, Computer, Earth, Info, SunOne, Moon, Setting, User, LinkOne,
  Book, Terminal, Voice,
} from '@icon-park/react'
import { useUIStore } from '@/stores/ui'
import { useAuthStore } from '@/stores/auth'
import { api } from '@/api/client'
import { SettingsSidebar, SETTINGS_NAV_CSS, SETTINGS_SHARED_CSS } from './SettingsNav'
import { SettingsLockedBanner, SETTINGS_LOCKED_BANNER_CSS } from './SettingsLockedBanner'
import { AppVersionWarningBanner, APP_VERSION_WARNING_BANNER_CSS } from './AppVersionWarningBanner'
import { NetworkDiagnosticsCard, NETWORK_DIAGNOSTICS_CARD_CSS } from './NetworkDiagnosticsCard'
import { MemoriesView } from './MemoriesView'
import { AboutView } from './AboutView'
import { GeneralView } from './GeneralView'
import { CloudAutomationView } from './CloudAutomationView'
import { AccountView, ConnectionsView } from './AccountView'
import { ProvidersView } from './ProvidersView'
import { WebSearchView } from './WebSearchView'
import { KnowledgeView } from './KnowledgeView'
import { MultimodalView } from './CapabilitiesViews'
import { AppearanceView } from './AppearanceView'
import { EnvironmentView } from './EnvironmentView'
import { StorageView } from './StorageView'
import { McpView } from './McpView'
import { ConnectorsView } from './ConnectorsView'
import type { TabId } from './SettingsNav'

const ALLOWED_TABS: TabId[] = [
  'general', 'account', 'connections', 'memories', 'appearance',
  'providers', 'remote', 'knowledge', 'multimodal',
  'mcp', 'connectors', 'environment', 'storage', 'about',
]

export function Settings() {
  const location = useLocation()
  const initialTab = (() => {
    const requested = new URLSearchParams(location.search).get('tab')
    if (requested && ALLOWED_TABS.includes(requested as TabId)) {
      return requested as TabId
    }
    return 'general' as TabId
  })()
  const [activeTab, setActiveTab] = useState<TabId>(initialTab)
  const { theme, setTheme, sidebarCollapsed } = useUIStore()
  const roles = useAuthStore((s) => s.roles)

  const isAdmin = roles.includes('admin')
  const requestedTab = new URLSearchParams(location.search).get('tab')

  // initialTab only runs once (React ignores the useState initializer on
  // re-render), so navigate('/settings?tab=x') calls from other views - e.g.
  // AccountView's "View providers", or a "Configure" link pointing at
  // Environment - land here but never actually switch the visible tab
  // without this: sync activeTab whenever the URL's ?tab= changes while
  // already mounted on /settings.
  useEffect(() => {
    if (requestedTab && ALLOWED_TABS.includes(requestedTab as TabId) && requestedTab !== activeTab) {
      setActiveTab(requestedTab as TabId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedTab])
  const adminRedirects: Record<string, string> = {
    system: '/admin?tab=runtime',
    'cloud-automation': '/admin?tab=runtime',
    'admin-users': '/admin?tab=users',
    'admin-groups': '/admin?tab=groups',
    'admin-organizations': '/admin?tab=organizations',
    'admin-workspaces': '/admin?tab=workspaces',
    'admin-audit': '/admin?tab=audit',
    'admin-quotas': '/admin?tab=quotas',
  }

  // Admin tabs are hidden from the sidebar for non-admins, but that alone is
  // cosmetic — activeTab can also come straight from the URL (?tab=admin-users),
  // which would otherwise render the admin view (and fire its API calls) for
  // anyone. Bounce back to General if a non-admin ever lands on one.
  useEffect(() => {
    if (!isAdmin && activeTab.startsWith('admin-')) {
      setActiveTab('general')
    }
  }, [isAdmin, activeTab])

  const navGroups = [
    {
      title: 'PERSONAL',
      items: [
        { id: 'general' as TabId, label: 'General', icon: <Setting size={16} /> },
        { id: 'account' as TabId, label: 'Account', icon: <User size={16} /> },
        { id: 'connections' as TabId, label: 'Connections', icon: <LinkOne size={16} /> },
        { id: 'memories' as TabId, label: 'Memories', icon: <Brain size={16} /> },
        { id: 'appearance' as TabId, label: 'Appearance', icon: <ColorFilter size={16} /> },
      ],
    },
    {
      title: 'AI',
      items: [
        { id: 'providers' as TabId, label: 'AI Providers', icon: <CloudStorage size={16} /> },
        { id: 'remote' as TabId, label: 'Web Search', icon: <Earth size={16} /> },
        { id: 'knowledge' as TabId, label: 'Knowledge', icon: <Book size={16} /> },
        { id: 'multimodal' as TabId, label: 'Multimodal', icon: <Voice size={16} /> },
      ],
    },
    {
      title: 'WORKSPACE',
      items: [
        { id: 'mcp' as TabId, label: 'MCP', icon: <Api size={16} /> },
        { id: 'connectors' as TabId, label: 'Connectors', icon: <LinkOne size={16} /> },
        { id: 'environment' as TabId, label: 'Environment', icon: <Terminal size={16} /> },
        { id: 'storage' as TabId, label: 'Storage', icon: <CloudStorage size={16} /> },
      ],
    },
    {
      title: 'OTHER',
      items: [
        { id: 'about' as TabId, label: 'About', icon: <Info size={16} /> },
      ],
    },
  ]

  const footer = (
    <div className={`snav-footer-items ${sidebarCollapsed ? 'collapsed' : ''}`}>
      <button
        className="snav-theme-toggle"
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      >
        {theme === 'dark' ? <SunOne size={15} /> : <Moon size={15} />}
      </button>
    </div>
  )

  return (
    <div className="settings-root">
      <style>{SETTINGS_CSS}</style>
      {requestedTab && adminRedirects[requestedTab] && isAdmin && <Navigate to={adminRedirects[requestedTab]} replace />}

      <SettingsSidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        collapsed={sidebarCollapsed}
        footer={footer}
        navGroups={navGroups}
      />

      <main className={`settings-content ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <div className="settings-content-inner">
          <SettingsLockedBanner />
          <AppVersionWarningBanner />
          {activeTab === 'general' && <GeneralView />}
          {activeTab === 'account' && <AccountView />}
          {activeTab === 'connections' && <ConnectionsView />}
          {activeTab === 'memories' && <MemoriesView />}
          {activeTab === 'appearance' && <AppearanceView />}
          {activeTab === 'providers' && <ProvidersView />}
          {activeTab === 'remote' && <WebSearchView />}
          {activeTab === 'knowledge' && <KnowledgeView />}
          {activeTab === 'multimodal' && <MultimodalView />}
          {activeTab === 'mcp' && <McpView />}
          {activeTab === 'connectors' && <ConnectorsView />}
          {activeTab === 'environment' && <EnvironmentView />}
          {activeTab === 'storage' && <StorageView />}
          {activeTab === 'about' && <AboutView />}
        </div>
      </main>
    </div>
  )
}

type SystemStatus = {
  mode: 'standalone' | 'connected'
  server_url?: string
  sandbox_confined?: boolean
  sandbox_kind?: 'docker' | 'landlock' | ''
  docling_configured?: boolean
  local_stt_configured?: boolean
}

export function RuntimeView() {
  const [status, setStatus] = useState<SystemStatus | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    api.get<SystemStatus>('/system/status').then(setStatus).catch(() => setStatus(null))
  }, [])

  return (
    <div className="sv-view">
      <header className="sv-view-header">
        <div className="sv-header-info">
          <h1>Runtime</h1>
          <p>System health, local infrastructure, and device automation.</p>
        </div>
      </header>
      <div className="sv-grid">
        <div className="sv-card">
          <div className="sv-card-head">
            <div className="sv-card-brand">
              <div className="sv-brand-icon"><Computer size={16} /></div>
              <div>
                <div className="sv-brand-name">Backend</div>
                <div className="sv-brand-sub">SeshatOS API</div>
              </div>
            </div>
          </div>
          <div className="sv-card-body">
            <div className="sv-toggle-row">
              <div className="sv-toggle-info">
                <div>
                  <div className="sv-setting-label">API Endpoint</div>
                  <div className="sv-setting-desc">http://localhost:8090</div>
                </div>
              </div>
            </div>
            <div className="sv-toggle-row">
              <div className="sv-toggle-info">
                <div>
                  <div className="sv-setting-label">Identity mode</div>
                  <div className="sv-setting-desc">
                    {status?.mode === 'connected'
                      ? `Connected to ${status.server_url}`
                      : status?.mode === 'standalone'
                        ? 'Standalone (local identity, no Seshat Server)'
                        : 'Loading…'}
                  </div>
                </div>
              </div>
            </div>
            <div className="sv-toggle-row">
              <div className="sv-toggle-info">
                <div>
                  <div className="sv-setting-label">Sandbox</div>
                  <div
                    className="sv-setting-desc"
                    style={status?.sandbox_confined === false ? { color: 'var(--color-warning)' } : undefined}
                  >
                    {status?.sandbox_kind === 'docker'
                      ? 'Shell commands run inside a Docker sandbox container'
                      : status?.sandbox_kind === 'landlock'
                        ? 'Shell commands run inside an OS-level sandbox (Landlock)'
                        : status?.sandbox_confined === false
                          ? 'No OS-level sandbox on this host — shell commands run unconfined (install and start Docker Desktop for isolation, or Landlock on Linux)'
                          : 'Loading…'}
                  </div>
                </div>
              </div>
            </div>
            <div className="sv-toggle-row">
              <div className="sv-toggle-info">
                <div>
                  <div className="sv-setting-label">Document conversion (Docling)</div>
                  <div
                    className="sv-setting-desc"
                    style={status?.docling_configured === false ? { color: 'var(--color-warning)' } : undefined}
                  >
                    {status?.docling_configured === true
                      ? 'Configured — scans, images, and audio convert through Docling'
                      : status?.docling_configured === false
                        ? 'Not configured — scans, images, and audio fall back to plain text instead of failing'
                        : 'Loading…'}
                  </div>
                </div>
              </div>
              {status?.docling_configured === false && (
                <button type="button" className="sv-inline-action" onClick={() => navigate('/admin?tab=knowledge')}>
                  Configure
                </button>
              )}
            </div>
            <div className="sv-toggle-row">
              <div className="sv-toggle-info">
                <div>
                  <div className="sv-setting-label">Local voice input</div>
                  <div
                    className="sv-setting-desc"
                    style={status?.local_stt_configured === false ? { color: 'var(--color-warning)' } : undefined}
                  >
                    {status?.local_stt_configured === true
                      ? 'Configured — voice input is transcribed on this device'
                      : status?.local_stt_configured === false
                        ? 'Not set up yet — download a model to enable voice input'
                        : 'Loading…'}
                  </div>
                </div>
              </div>
              {status?.local_stt_configured === false && (
                <button type="button" className="sv-inline-action" onClick={() => navigate('/admin?tab=multimodal')}>
                  Set up
                </button>
              )}
            </div>
            <div className="sv-toggle-row">
              <div className="sv-toggle-info">
                <div>
                  <div className="sv-setting-label">Database</div>
                  <div className="sv-setting-desc">Configure via NEXUS_DB_DRIVER + NEXUS_DB_DSN in .env</div>
                </div>
              </div>
            </div>
            <div className="sv-toggle-row">
              <div className="sv-toggle-info">
                <div>
                  <div className="sv-setting-label">Storage</div>
                  <div className="sv-setting-desc">Configure via NEXUS_STORAGE_PROVIDER in .env</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="sv-section">
        <div className="sv-section-header">
          <h2>Network diagnostics</h2>
          <p>Self-service connectivity check for enterprise IT - useful when this device can't reach Seshat Server.</p>
        </div>
        <div className="sv-grid">
          <NetworkDiagnosticsCard />
        </div>
      </div>
      <div className="sv-section">
        <div className="sv-section-header">
          <h2>Cloud Automation</h2>
          <p>
            Scheduled jobs run through Seshat Server. This machine only executes jobs assigned to it.
          </p>
        </div>
        <CloudAutomationView embedded />
      </div>
    </div>
  )
}

const SETTINGS_CSS = `
${SETTINGS_NAV_CSS}
${SETTINGS_SHARED_CSS}
${SETTINGS_LOCKED_BANNER_CSS}
${APP_VERSION_WARNING_BANNER_CSS}
${NETWORK_DIAGNOSTICS_CARD_CSS}
`
