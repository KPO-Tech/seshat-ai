import { useEffect, useState } from 'react'
import { Navigate, useLocation } from 'react-router'
import {
  Brain, Computer, Info, SunOne, Moon, Setting, User, LinkOne,
} from '@icon-park/react'
import { useUIStore } from '@/stores/ui'
import { useAuthStore } from '@/stores/auth'
import { api } from '@/api/client'
import { SettingsSidebar, SETTINGS_NAV_CSS, SETTINGS_SHARED_CSS } from './SettingsNav'
import { MemoriesView } from './MemoriesView'
import { AboutView } from './AboutView'
import { GeneralView } from './GeneralView'
import { CloudAutomationView } from './CloudAutomationView'
import { AccountView, ConnectionsView } from './AccountView'
import type { TabId } from './SettingsNav'

export function Settings() {
  const location = useLocation()
  const initialTab = (() => {
    const requested = new URLSearchParams(location.search).get('tab')
    if (requested === 'general' || requested === 'account' || requested === 'connections' || requested === 'memories' || requested === 'about') {
      return requested as TabId
    }
    return 'general' as TabId
  })()
  const [activeTab, setActiveTab] = useState<TabId>(initialTab)
  const { theme, setTheme, sidebarCollapsed } = useUIStore()
  const roles = useAuthStore((s) => s.roles)

  const isAdmin = roles.includes('admin')
  const requestedTab = new URLSearchParams(location.search).get('tab')
  const adminRedirects: Record<string, string> = {
    providers: '/admin?tab=providers',
    knowledge: '/admin?tab=knowledge',
    multimodal: '/admin?tab=multimodal',
    remote: '/admin?tab=websearch',
    runtime: '/admin?tab=runtime',
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
          {activeTab === 'general' && <GeneralView />}
          {activeTab === 'account' && <AccountView />}
          {activeTab === 'connections' && <ConnectionsView />}
          {activeTab === 'memories' && <MemoriesView />}
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
}

export function RuntimeView() {
  const [status, setStatus] = useState<SystemStatus | null>(null)

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
`
