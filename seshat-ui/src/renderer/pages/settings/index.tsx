import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  Browser, Book, Brain, Flashlamp, Earth, Computer, Info,
  Left, SunOne, Moon, Setting, User, Peoples, BuildingTwo, Workbench, CloudStorage,
} from '@icon-park/react'
import { useUIStore } from '@/stores/ui'
import { useAuthStore } from '@/stores/auth'
import { api } from '@/api/client'
import { SettingsSidebar, SETTINGS_NAV_CSS, SETTINGS_SHARED_CSS } from './SettingsNav'
import { ProvidersView, PROVIDERS_CSS } from './ProvidersView'
import { KnowledgeView } from './KnowledgeView'
import { MemoriesView } from './MemoriesView'
import { AboutView } from './AboutView'
import { CapabilitiesView, CAPABILITIES_CSS } from './CapabilitiesViews'
import { WebSearchView } from './WebSearchView'
import { GeneralView } from './GeneralView'
import { CloudAutomationView } from './CloudAutomationView'
import {
  AdminUsersView,
  AdminGroupsView,
  AdminOrganizationsView,
  AdminWorkspacesView,
  AdminAuditView,
  AdminQuotasView,
  ADMIN_CSS,
} from './AdminViews'
import type { TabId } from './SettingsNav'

export function Settings() {
  const location = useLocation()
  const initialTab = (() => {
    const requested = new URLSearchParams(location.search).get('tab')
    if (requested === 'general' || requested === 'memories' || requested === 'providers' || requested === 'knowledge' || requested === 'capabilities' || requested === 'remote' || requested === 'cloud-automation' || requested === 'system' || requested === 'about' || requested === 'admin-users' || requested === 'admin-groups' || requested === 'admin-organizations' || requested === 'admin-workspaces' || requested === 'admin-audit' || requested === 'admin-quotas') {
      return requested as TabId
    }
    return 'general' as TabId
  })()
  const [activeTab, setActiveTab] = useState<TabId>(initialTab)
  const navigate = useNavigate()
  const { theme, setTheme, sidebarCollapsed } = useUIStore()
  const roles = useAuthStore((s) => s.roles)

  const isAdmin = roles.includes('admin')

  const navGroups = [
    {
      title: 'PERSONAL',
      items: [
        { id: 'general' as TabId, label: 'General', icon: <Setting size={16} /> },
        { id: 'memories' as TabId, label: 'Memories', icon: <Brain size={16} /> },
      ],
    },
    {
      title: 'AI CORE',
      items: [
        { id: 'providers' as TabId, label: 'Providers', icon: <Browser size={16} /> },
        { id: 'knowledge' as TabId, label: 'Knowledge', icon: <Book size={16} /> },
        { id: 'capabilities' as TabId, label: 'Capabilities', icon: <Flashlamp size={16} /> },
      ],
    },
    {
      title: 'APPLICATION',
      items: [
        { id: 'remote' as TabId, label: 'Web Search', icon: <Earth size={16} /> },
        { id: 'cloud-automation' as TabId, label: 'Cloud Automation', icon: <CloudStorage size={16} /> },
        { id: 'system' as TabId, label: 'System', icon: <Computer size={16} /> },
      ],
    },
    ...(isAdmin ? [{
      title: 'ADMIN',
      items: [
        { id: 'admin-users' as TabId, label: 'Users', icon: <User size={16} /> },
        { id: 'admin-groups' as TabId, label: 'Groups', icon: <Peoples size={16} /> },
        { id: 'admin-organizations' as TabId, label: 'Organizations', icon: <BuildingTwo size={16} /> },
        { id: 'admin-workspaces' as TabId, label: 'Workspaces', icon: <Workbench size={16} /> },
        { id: 'admin-audit' as TabId, label: 'Audit Logs', icon: <Info size={16} /> },
        { id: 'admin-quotas' as TabId, label: 'Quotas', icon: <Flashlamp size={16} /> },
      ],
    }] : []),
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
        className="snav-footer-btn"
        onClick={() => navigate(-1)}
        title={sidebarCollapsed ? 'Back to Chat' : undefined}
      >
        <Left size={13} />
        {!sidebarCollapsed && <span>Back to Chat</span>}
      </button>
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

      <SettingsSidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        collapsed={sidebarCollapsed}
        footer={footer}
        navGroups={navGroups}
      />

      <main className={`settings-content ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <div className="settings-content-inner">
          {activeTab === 'general' && <GeneralView />}
          {activeTab === 'providers' && <ProvidersView />}
          {activeTab === 'knowledge' && <KnowledgeView />}
          {activeTab === 'memories' && <MemoriesView />}
          {activeTab === 'capabilities' && <CapabilitiesView />}
          {activeTab === 'remote' && <WebSearchView />}
          {activeTab === 'cloud-automation' && <CloudAutomationView />}
          {activeTab === 'system' && <SystemView />}
          {activeTab === 'about' && <AboutView />}
          {activeTab === 'admin-users' && <AdminUsersView />}
          {activeTab === 'admin-groups' && <AdminGroupsView />}
          {activeTab === 'admin-organizations' && <AdminOrganizationsView />}
          {activeTab === 'admin-workspaces' && <AdminWorkspacesView />}
          {activeTab === 'admin-audit' && <AdminAuditView />}
          {activeTab === 'admin-quotas' && <AdminQuotasView />}
        </div>
      </main>
    </div>
  )
}

type SystemStatus = { mode: 'standalone' | 'connected'; server_url?: string; sandbox_confined?: boolean }

function SystemView() {
  const [status, setStatus] = useState<SystemStatus | null>(null)

  useEffect(() => {
    api.get<SystemStatus>('/system/status').then(setStatus).catch(() => setStatus(null))
  }, [])

  return (
    <div className="sv-view">
      <header className="sv-view-header">
        <div className="sv-header-info">
          <h1>System</h1>
          <p>Runtime and infrastructure settings.</p>
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
                    {status?.sandbox_confined === true
                      ? 'Shell commands run inside an OS-level sandbox (Landlock)'
                      : status?.sandbox_confined === false
                        ? 'No OS-level sandbox on this host — shell commands run unconfined (Landlock is Linux-only)'
                        : 'Loading…'}
                  </div>
                </div>
              </div>
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
    </div>
  )
}

const SETTINGS_CSS = `
${SETTINGS_NAV_CSS}
${PROVIDERS_CSS}
${CAPABILITIES_CSS}
${ADMIN_CSS}
${SETTINGS_SHARED_CSS}
`
