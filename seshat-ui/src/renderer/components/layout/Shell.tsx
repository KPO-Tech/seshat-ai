import { Outlet, useLocation } from 'react-router'
import { useEffect, useRef } from 'react'
import { Sidebar } from './Sidebar'
import { RightPanelHost } from './RightPanelHost'
import { ImageLightbox } from './ImageLightbox'
import { ErrorBoundary } from './ErrorBoundary'
import { Titlebar, ThemeToggleButton } from './Titlebar'
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
  const conversationId = pathname.match(/^\/conversation\/([^/]+)/)?.[1] ?? null
  const previousConversationIdRef = useRef<string | null>(conversationId)
  const isAutomation = pathname === '/automation' || pathname.startsWith('/automation/')
  const sidebarRoutes = ['/', '/apps', '/projects', '/history', '/scheduling']
  const showSidebar = isConversation || (!isAutomation && sidebarRoutes.includes(pathname))

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
    const previousConversationId = previousConversationIdRef.current
    if (conversationId) {
      if (previousConversationId && previousConversationId !== conversationId) {
        void window.nexus?.browser?.hide(`session:${previousConversationId}`).catch(() => undefined)
        useUIStore.getState().closeRightPanelsForSession(previousConversationId)
      }
      previousConversationIdRef.current = conversationId
      return
    }

    const browserContexts = new Set<string>(['chat'])
    for (const column of useUIStore.getState().rightColumns) {
      for (const panel of column.panels) {
        if (panel.kind === 'browser') {
          browserContexts.add(panel.sessionId ? `session:${panel.sessionId}` : 'chat')
        }
      }
    }
    if (previousConversationId) browserContexts.add(`session:${previousConversationId}`)

    useUIStore.getState().closeAllRightPanels()
    for (const contextId of browserContexts) {
      void window.nexus?.browser?.hide(contextId).catch(() => undefined)
    }
    previousConversationIdRef.current = null
  }, [conversationId])

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
        source?: string
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
            source: session.source,
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
    <div className="flex h-screen flex-col overflow-hidden bg-app-bg font-app-sans text-app-text">
      <Titlebar
        center="SeshatOS"
        right={<ThemeToggleButton />}
        left={
          <button
            className="flex size-8 cursor-pointer items-center justify-center rounded-[5px] border-0 bg-transparent text-app-text-secondary transition-colors duration-150 hover:bg-[var(--color-hover)] hover:text-app-text disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-app-text-secondary"
            onClick={toggleSidebar}
            aria-label={showSidebar ? 'Toggle Sidebar' : 'No sidebar on this page'}
            disabled={!showSidebar}
            aria-disabled={!showSidebar}
            type="button"
          >
            <InternalExpansion size={15} />
          </button>
        }
      />

      <div className="relative flex flex-1 overflow-hidden">
        {showSidebar && <Sidebar />}
        <main
          className={[
            'relative flex flex-1 overflow-hidden transition-[padding-left] duration-200 ease-[cubic-bezier(0.4,0,0.2,1)]',
            !showSidebar ? 'pl-0' : collapsed ? 'pl-[var(--sidebar-collapsed-width)]' : 'pl-[var(--sidebar-width)]',
          ].join(' ')}
        >
          <div className="flex h-full min-w-0 flex-1 overflow-hidden">
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
