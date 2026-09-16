import { useCallback, useEffect, useRef, useState } from 'react'
import type { ToolUseBlock } from '../../../lib/chatTypes'
import { browserActionLabel, browserContextId, browserTargetFromTool } from './browserTools'

type BrowserPanelTab = {
  id: string
  label: string
  url: string
  status: 'loading' | 'ready'
  canGoBack: boolean
  canGoForward: boolean
}

type BrowserPanelState = {
  activeTabId: string | null
  tabs: BrowserPanelTab[]
}

export function BrowserLiveView({ sessionId, tool }: { sessionId?: string; tool: ToolUseBlock }) {
  const browserApi = window.nexus?.browser
  const contextId = browserContextId(sessionId)
  const viewportRef = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<BrowserPanelState | null>(null)
  const [address, setAddress] = useState(browserTargetFromTool(tool) || 'https://www.google.com/')
  const [error, setError] = useState<string | null>(null)
  const target = browserTargetFromTool(tool)
  const activeTab = state?.tabs.find((tab) => tab.id === state.activeTabId) ?? state?.tabs[0] ?? null

  const syncBounds = useCallback(() => {
    const element = viewportRef.current
    if (!element || !browserApi) return
    const rect = element.getBoundingClientRect()
    if (rect.width < 4 || rect.height < 4) return
    void browserApi.setBounds(contextId, {
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height
    }).catch(() => undefined)
  }, [browserApi, contextId])

  useEffect(() => {
    if (!browserApi) {
      setError('Browser bridge is not available.')
      return
    }
    const element = viewportRef.current
    if (!element) return

    const rect = element.getBoundingClientRect()
    const bounds = { x: rect.left, y: rect.top, width: rect.width, height: rect.height }
    void browserApi.show(contextId, bounds).then((next) => {
      setState(next)
      const activeUrl = next.tabs.find((tab) => tab.id === next.activeTabId)?.url ?? next.tabs[0]?.url
      if (activeUrl && activeUrl !== 'about:blank') setAddress(activeUrl)
    }).catch((err) => setError(err instanceof Error ? err.message : 'Could not open browser.'))

    const observer = new ResizeObserver(syncBounds)
    observer.observe(element)
    const unsubscribe = browserApi.onStateChange(contextId, (next) => {
      setState(next)
      const activeUrl = next.tabs.find((tab) => tab.id === next.activeTabId)?.url ?? next.tabs[0]?.url
      if (activeUrl && activeUrl !== 'about:blank') setAddress(activeUrl)
    })
    const frame = requestAnimationFrame(syncBounds)
    window.addEventListener('resize', syncBounds)
    window.addEventListener('scroll', syncBounds, true)

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      unsubscribe()
      window.removeEventListener('resize', syncBounds)
      window.removeEventListener('scroll', syncBounds, true)
      void browserApi.hide(contextId).catch(() => undefined)
    }
  }, [browserApi, contextId, syncBounds])

  useEffect(() => {
    if (!browserApi || !target) return
    setAddress(target)
    void browserApi.openUrl(target, sessionId).then((result) => {
      setAddress(result.url)
    }).catch(() => undefined)
  }, [browserApi, sessionId, target])

  async function navigate() {
    const value = address.trim()
    if (!browserApi || !value) return
    const next = await browserApi.navigate(contextId, value).catch((err) => {
      setError(err instanceof Error ? err.message : 'Navigation failed.')
      return null
    })
    if (next) setState(next)
  }

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--border-soft)] bg-[var(--surface-panel)]">
      <div className="flex items-center gap-2 border-b border-[var(--border-soft)] px-2.5 py-2">
        <button type="button" className={buttonClass} disabled={!activeTab?.canGoBack} onClick={() => void browserApi?.back(contextId).then(setState)}>
          <ArrowLeftIcon />
        </button>
        <button type="button" className={buttonClass} disabled={!activeTab?.canGoForward} onClick={() => void browserApi?.forward(contextId).then(setState)}>
          <ArrowRightIcon />
        </button>
        <button type="button" className={buttonClass} onClick={() => void browserApi?.reload(contextId).then(setState)}>
          <RefreshIcon />
        </button>
        <form
          className="min-w-0 flex-1"
          onSubmit={(event) => {
            event.preventDefault()
            void navigate()
          }}
        >
          <input
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            className="h-8 w-full rounded-md border border-[var(--border-soft)] bg-[var(--surface-muted)] px-2.5 text-[12px] text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
          />
        </form>
        <span className="shrink-0 rounded-md bg-[var(--surface-muted)] px-2 py-1 text-[10px] font-semibold text-[var(--text-muted)]">
          {browserActionLabel(tool)}
        </span>
      </div>

      {state && state.tabs.length > 1 && (
        <div className="no-scrollbar flex gap-1 overflow-x-auto border-b border-[var(--border-soft)] px-2.5 py-1.5">
          {state.tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => void browserApi?.switchTab(contextId, tab.id).then(setState)}
              className={[
                'max-w-[180px] shrink-0 truncate rounded-md border px-2 py-1 text-left text-[10.5px] font-semibold',
                tab.id === state.activeTabId ? 'border-[var(--accent-primary)]/45 bg-[var(--accent-primary)]/10 text-[var(--text-primary)]' : 'border-transparent text-[var(--text-muted)] hover:bg-[var(--surface-muted)]'
              ].join(' ')}
            >
              {tab.status === 'loading' ? 'Loading' : tab.label || 'New tab'}
            </button>
          ))}
        </div>
      )}

      {error ? (
        <div className="m-3 rounded-md border border-[var(--accent-danger)]/40 bg-[var(--accent-danger)]/10 px-3 py-2 text-[12px] font-semibold text-[var(--accent-danger)]">
          {error}
        </div>
      ) : null}

      <div ref={viewportRef} className="h-[360px] min-h-[260px] bg-[#080a0d]" />
    </div>
  )
}

const buttonClass = 'flex size-8 shrink-0 items-center justify-center rounded-md border border-[var(--border-soft)] bg-[var(--surface-muted)] text-[var(--text-secondary)] transition hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-40'

function ArrowLeftIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8.5 3.5 5 7l3.5 3.5" />
    </svg>
  )
}

function ArrowRightIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5.5 3.5 9 7l-3.5 3.5" />
    </svg>
  )
}

function RefreshIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11 5.2A4 4 0 1 0 12 8" />
      <path d="M11.1 2.7v2.6H8.5" />
    </svg>
  )
}
