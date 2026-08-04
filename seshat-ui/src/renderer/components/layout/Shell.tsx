import { Outlet, useLocation } from 'react-router'
import { useEffect } from 'react'
import { Sidebar } from './Sidebar'
import { RightPanelHost } from './RightPanelHost'
import { ImageLightbox } from './ImageLightbox'
import { ErrorBoundary } from './ErrorBoundary'
import { Titlebar } from './Titlebar'
import { useUIStore } from '@/stores/ui'
import { useSessionStore } from '@/stores/session'
import { api } from '@/api/client'
import { UNTITLED_SESSION_TITLE } from '@/lib/sessionTitle'
import { InternalExpansion } from '@icon-park/react'

export function Shell() {
  const collapsed = useUIStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useUIStore((s) => s.toggleSidebar)
  const { pathname } = useLocation()
  
  const isConversation = pathname.startsWith('/conversation/')
  const sidebarRoutes = ['/', '/workspace', '/apps', '/projects', '/scheduling', '/history']
  const showSidebar = isConversation || sidebarRoutes.includes(pathname)

  // Keeps the right-panel column cap responsive to the actual window width
  // (see useUIStore's setWindowWidth) — rAF-throttled since 'resize' can
  // fire many times per drag.
  useEffect(() => {
    let frame: number | null = null
    function onResize() {
      if (frame !== null) return
      frame = requestAnimationFrame(() => {
        frame = null
        useUIStore.getState().setWindowWidth(window.innerWidth)
      })
    }
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      if (frame !== null) cancelAnimationFrame(frame)
    }
  }, [])

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
      
      <Titlebar
        center="SeshatOS"
        left={
          showSidebar && (
            <button className="tb-toggle-btn" onClick={toggleSidebar} title="Toggle Sidebar">
              <InternalExpansion size={15} />
            </button>
          )
        }
      />

      <div className="shell-body">
        {showSidebar && <Sidebar />}
        <main className={`shell-main ${!showSidebar ? 'no-sidebar' : (collapsed ? 'collapsed' : '')}`}>
          <div className="shell-main-content">
            <ErrorBoundary>
              <Outlet />
            </ErrorBoundary>
          </div>
          {isConversation && <RightPanelHost />}
          <ImageLightbox />
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

/* ── Title Bar (system buttons + drag region live in Titlebar.tsx's own
   TITLEBAR_CSS) — only the sidebar-toggle button is Shell-specific ── */
.tb-toggle-btn {
  background: transparent;
  border: none;
  color: var(--color-text-secondary);
  width: 32px;
  height: 32px;
  border-radius: 5px;
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
  position: relative;
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
