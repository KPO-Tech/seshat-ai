import { Outlet, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import { Sidebar } from './Sidebar'
import { RightPanelHost } from './RightPanelHost'
import { ErrorBoundary } from './ErrorBoundary'
import { useUIStore } from '@/stores/ui'
import { useSessionStore } from '@/stores/session'
import { api } from '@/api/client'
import { UNTITLED_SESSION_TITLE } from '@/lib/sessionTitle'
import {
  InternalExpansion,
  Close,
  Minus,
  Square
} from '@icon-park/react'

export function Shell() {
  const collapsed = useUIStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useUIStore((s) => s.toggleSidebar)
  const { pathname } = useLocation()
  
  const isConversation = pathname.startsWith('/conversation/')
  // Sidebar is visible on Home and all conversation pages, but not on
  // full-screen pages like Settings, Login, Register, or workspace views.
  const showSidebar = pathname === '/' || isConversation

  const handleMinimize = () => window.nexus.window.minimize()
  const handleMaximize = () => window.nexus.window.maximize()
  const handleClose = () => window.nexus.window.close()

  useEffect(() => {
    let cancelled = false
    void api.get<{
      sessions: Array<{
        session_id: string
        title?: string
        created_at: number
        updated_at?: number
        provider_setting_id?: string
        model_id?: string
      }>
    }>('/sessions')
      .then((response) => {
        if (cancelled) return
        const { upsertSession } = useSessionStore.getState()
        for (const session of response.sessions ?? []) {
          upsertSession({
            id: session.session_id,
            title: session.title || UNTITLED_SESSION_TITLE,
            messages: [],
            createdAt: new Date((session.created_at ?? 0) * 1000).toISOString(),
            updatedAt: new Date((session.updated_at ?? session.created_at ?? 0) * 1000).toISOString(),
            providerSettingId: session.provider_setting_id,
            modelId: session.model_id,
          })
        }
      })
      .catch(() => {
        // Sidebar can stay empty if the backend is still starting.
      })

    return () => {
      cancelled = true
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="shell-root">
      <style>{SHELL_CSS}</style>
      
      {/* ── Custom Title Bar ── */}
      <div className="shell-titlebar">
        <div className="titlebar-left">
          {showSidebar && (
            <button className="tb-toggle-btn" onClick={toggleSidebar} title="Toggle Sidebar">
              <InternalExpansion size={18} />
            </button>
          )}
        </div>
        
        <div className="titlebar-center">SeshatOS</div>

        <div className="titlebar-right">
          <button className="tb-sys-btn" onClick={handleMinimize} title="Minimize">
            <Minus size={14} />
          </button>
          <button className="tb-sys-btn" onClick={handleMaximize} title="Maximize/Restore">
            <Square size={12} />
          </button>
          <button className="tb-sys-btn close" onClick={handleClose} title="Close">
            <Close size={14} />
          </button>
        </div>
      </div>

      <div className="shell-body">
        {showSidebar && <Sidebar />}
        <main className={`shell-main ${!showSidebar ? 'no-sidebar' : (collapsed ? 'collapsed' : '')}`}>
          <div className="shell-main-content">
            <ErrorBoundary>
              <Outlet />
            </ErrorBoundary>
          </div>
          {isConversation && <RightPanelHost />}
        </main>
      </div>
    </div>
  )
}

const SHELL_CSS = `
.shell-root {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  background: var(--color-bg);
  color: var(--color-text);
  font-family: var(--font-sans);
}

/* ── Title Bar ── */
.shell-titlebar {
  height: 42px;
  background: var(--color-bg);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  border-bottom: 1px solid var(--color-border-subtle);
  -webkit-app-region: drag;
  z-index: 1000;
  flex-shrink: 0;
}

.titlebar-left {
  display: flex;
  align-items: center;
  -webkit-app-region: no-drag;
}

.tb-toggle-btn {
  background: transparent;
  border: none;
  color: var(--color-text-secondary);
  width: 32px;
  height: 32px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.tb-toggle-btn:hover {
  background: var(--color-hover);
  color: var(--color-text);
}

.titlebar-center {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-muted);
  letter-spacing: 0.02em;
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  pointer-events: none;
}

.titlebar-right {
  display: flex;
  align-items: center;
  -webkit-app-region: no-drag;
}

.tb-sys-btn {
  background: transparent;
  border: none;
  color: var(--color-text-secondary);
  width: 42px;
  height: 42px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.15s;
}

.tb-sys-btn:hover {
  background: var(--color-hover);
}

.tb-sys-btn.close:hover {
  background: var(--color-error);
  color: white;
}

/* ── Body ── */
.shell-body {
  flex: 1;
  display: flex;
  overflow: hidden;
  position: relative;
}

.shell-main {
  flex: 1;
  display: flex;
  overflow: hidden;
  /* Removal of forced margin, Sidebar is position:fixed or absolute */
  padding-left: var(--sidebar-width);
  transition: padding-left 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.shell-main-content {
  flex: 1;
  min-width: 0;
  display: flex;
  overflow: hidden;
  height: 100%;
}

.shell-main.no-sidebar {
  padding-left: 0;
}

.shell-main.collapsed {
  padding-left: var(--sidebar-collapsed-width);
}
`
