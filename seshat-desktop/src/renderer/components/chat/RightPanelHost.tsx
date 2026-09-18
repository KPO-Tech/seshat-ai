import { useCallback, useEffect, useRef } from 'react'
import { CHAT_MIN_WIDTH, DEFAULT_WIDTH, MIN_WIDTH, useRightPanelStore } from '@renderer/stores/rightPanel'
import { SIDEBAR_WIDTH, useSidebarStore } from '@renderer/stores/sidebar'
import { BrowserLiveView } from './tools/live/browser/BrowserLiveView'
import { browserContextId } from './tools/live/browser/browserTools'
import { useBrowserPanelState } from './tools/live/browser/useBrowserPanelState'

// Below this window width, the sidebar's ~236px is worth reclaiming for the
// panel + chat's own minimums - above it there's room for all three, so the
// sidebar is left alone.
const SIDEBAR_RECLAIM_THRESHOLD = SIDEBAR_WIDTH + CHAT_MIN_WIDTH + DEFAULT_WIDTH

// Single-panel port of seshat-ui's right-panel system (stores/ui.ts +
// RightPanelHost.tsx) at the granularity it's actually reachable at there
// (one column, one panel, replace-on-open) - resize is the same plain
// mousedown/mousemove/mouseup drag they use, no library, no persistence.
export function RightPanelHost({ sessionId }: { sessionId: string }) {
  const panel = useRightPanelStore((state) => state.panel)
  const closePanel = useRightPanelStore((state) => state.closePanel)
  const setWidth = useRightPanelStore((state) => state.setWidth)
  const draggingRef = useRef(false)
  const hostRef = useRef<HTMLDivElement>(null)
  const browserApi = window.nexus?.browser
  const contextId = browserContextId(sessionId)
  const [browserState, setBrowserState] = useBrowserPanelState(contextId)

  // The row (chat column + this panel) is the direct parent - its width is
  // the total budget to split between the two, so the panel can never grow
  // past what would leave the chat column (and its ChatInput) unusably
  // narrow, on any window size.
  const maxPanelWidth = useCallback(() => {
    const containerWidth = hostRef.current?.parentElement?.clientWidth
    if (!containerWidth) return undefined
    return Math.max(MIN_WIDTH, containerWidth - CHAT_MIN_WIDTH)
  }, [])

  const onResizeStart = useCallback((event: React.MouseEvent) => {
    event.preventDefault()
    draggingRef.current = true
    const startX = event.clientX
    const startWidth = useRightPanelStore.getState().panel?.width ?? 0

    function onMove(moveEvent: MouseEvent) {
      if (!draggingRef.current) return
      // Panel sits on the right edge - dragging left (negative delta) grows it.
      setWidth(startWidth + (startX - moveEvent.clientX), maxPanelWidth())
    }
    function onUp() {
      draggingRef.current = false
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [setWidth, maxPanelWidth])

  // Closing on session switch mirrors seshat-ui's closeRightPanelsForSession
  // - a panel scoped to one conversation shouldn't stay open on another.
  useEffect(() => {
    const current = useRightPanelStore.getState().panel
    if (current && current.sessionId !== sessionId) closePanel()
  }, [sessionId, closePanel])

  // Re-clamp the panel width AND re-evaluate the sidebar on every resize,
  // not just at panel open/close - so growing the window back out gives the
  // sidebar back immediately instead of waiting for the panel to close, and
  // shrinking it collapses the sidebar the moment it's actually needed.
  // autoCollapse()/autoRestore() no-op whenever that would fight a manual
  // sidebar toggle, so this never overrides the user's own choice.
  useEffect(() => {
    if (!panel) return
    function reclamp() {
      const current = useRightPanelStore.getState().panel
      if (current) setWidth(current.width, maxPanelWidth())
      if (window.innerWidth < SIDEBAR_RECLAIM_THRESHOLD) {
        useSidebarStore.getState().autoCollapse()
      } else {
        useSidebarStore.getState().autoRestore()
      }
    }
    reclamp()
    window.addEventListener('resize', reclamp)
    return () => {
      window.removeEventListener('resize', reclamp)
      useSidebarStore.getState().autoRestore()
    }
  }, [panel?.sessionId, panel?.kind, setWidth, maxPanelWidth])

  if (!panel || panel.sessionId !== sessionId) return null

  return (
    <div ref={hostRef} className="relative flex h-full shrink-0" style={{ width: panel.width }}>
      <div
        onMouseDown={onResizeStart}
        className="absolute -left-1 top-0 z-10 h-full w-2 cursor-col-resize"
        title="Resize"
      />
      <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden border-l border-[var(--border-soft)]">
        <div className="flex h-9 shrink-0 items-center gap-1 border-b border-[var(--border-soft)] pl-2 pr-1">
          <div className="no-scrollbar flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
            {browserState?.tabs.map((tab) => (
              <div
                key={tab.id}
                className={[
                  'flex h-7 max-w-[170px] shrink-0 items-center rounded-md border border-transparent pl-2',
                  tab.id === browserState.activeTabId ? 'bg-[var(--surface-muted)] text-[var(--text-primary)]' : 'text-[var(--text-muted)] hover:bg-[var(--surface-muted)]/60'
                ].join(' ')}
              >
                <button
                  type="button"
                  onClick={() => void browserApi?.switchTab(contextId, tab.id).then(setBrowserState)}
                  className="min-w-0 flex-1 truncate text-left text-[11px] font-semibold"
                >
                  {tab.status === 'loading' ? 'Loading' : tab.label || 'New tab'}
                </button>
                {browserState.tabs.length > 1 && (
                  <button
                    type="button"
                    className="grid size-6 shrink-0 place-items-center rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                    title="Close tab"
                    onClick={() => void browserApi?.closeTab(contextId, tab.id).then(setBrowserState)}
                  >
                    <TabIcon kind="close" />
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              className="grid size-7 shrink-0 place-items-center rounded-md text-[var(--text-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]"
              title="New tab"
              onClick={() => void browserApi?.newTab(contextId).then(setBrowserState)}
            >
              <TabIcon kind="add" />
            </button>
          </div>
          <button
            type="button"
            onClick={closePanel}
            aria-label="Close panel"
            className="flex size-6 shrink-0 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]"
          >
            <CloseIcon />
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col">
          <BrowserLiveView sessionId={sessionId} hideTabStrip />
        </div>
      </div>
    </div>
  )
}

function CloseIcon() {
  return <svg width="13" height="13" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><path d="m5 5 8 8M13 5l-8 8" /></svg>
}

function TabIcon({ kind }: { kind: 'add' | 'close' }) {
  const d = kind === 'add' ? 'M6 2.5v7M2.5 6h7' : 'm3 3 6 6M9 3 3 9'
  return <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><path d={d} /></svg>
}
