import { useCallback, useEffect, useRef, useState } from 'react'
import { useBrowserStore, type BrowserActionRun } from '@renderer/stores/browser'
import type { ToolUseBlock } from '../../../lib/chatTypes'
import { CodePanel, prettyJsonOrRaw } from '../../ToolDetails'
import { browserAgentPage, browserResultSummary, parseBrowserScreenshot } from './browserResults'
import { browserActionLabel, browserContextId, browserTargetFromTool } from './browserTools'
import { useBrowserPanelState } from './useBrowserPanelState'

const EMPTY_ACTIONS: BrowserActionRun[] = []

// `hideTabStrip` lets the standalone panel host (RightPanelHost) render the
// tab row itself, in its header next to the close button, instead of here
// below the address bar - see useBrowserPanelState for the shared state
// that keeps both in sync.
export function BrowserLiveView({ sessionId, tool, hideTabStrip }: { sessionId?: string; tool?: ToolUseBlock; hideTabStrip?: boolean }) {
  const browserApi = window.nexus?.browser
  const contextId = browserContextId(sessionId)
  const viewportRef = useRef<HTMLDivElement>(null)
  const [state, setState] = useBrowserPanelState(contextId)
  const [address, setAddress] = useState((tool && browserTargetFromTool(tool)) || 'https://www.google.com/')
  const [error, setError] = useState<string | null>(null)
  const [showScreenshot, setShowScreenshot] = useState(false)
  // `?? []` would allocate a new array every render when there's no entry
  // yet for this session (always true for a manually-opened panel with no
  // tool call), which useSyncExternalStore sees as a changed snapshot on
  // every render - an infinite update loop that crashes the whole app.
  const actions = useBrowserStore((store) => sessionId ? store.sessions[sessionId]?.actions ?? EMPTY_ACTIONS : EMPTY_ACTIONS)
  // Standalone (manually opened, no active tool call) has nothing to fall
  // back to - the live session's own action history above is enough.
  const visibleActions = actions.length > 0 ? actions : tool ? [fallbackAction(tool)] : []
  const screenshot = tool ? parseBrowserScreenshot(tool) : null
  const resultSummary = tool ? browserResultSummary(tool) : null
  const agentPage = tool ? browserAgentPage(tool) : null
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
    if (!browserApi || !agentPage) return
    void browserApi.adoptPage(contextId, agentPage).then((next) => {
      setState(next)
      const activeUrl = next.tabs.find((tab) => tab.id === next.activeTabId)?.url
      if (activeUrl && activeUrl !== 'about:blank') setAddress(activeUrl)
    }).catch((err) => setError(err instanceof Error ? err.message : 'Could not display the agent page.'))
  }, [agentPage?.pageId, agentPage?.targetId, agentPage?.url, browserApi, contextId])

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
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-[var(--border-soft)] bg-[var(--surface-panel)]">
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--border-soft)] px-2.5 py-2">
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
        {tool && (
          <span className="shrink-0 rounded-md bg-[var(--surface-muted)] px-2 py-1 text-[10px] font-semibold text-[var(--text-muted)]">
            {browserActionLabel(tool)}
          </span>
        )}
      </div>

      {!hideTabStrip && state && state.tabs.length > 1 && (
        <div className="no-scrollbar flex shrink-0 items-center gap-1 overflow-x-auto border-b border-[var(--border-soft)] px-2.5 py-1.5">
          {state.tabs.map((tab) => (
            <div key={tab.id} className="flex max-w-[190px] shrink-0 items-center rounded-md border border-transparent hover:bg-[var(--surface-muted)]">
              <button
                type="button"
                onClick={() => void browserApi?.switchTab(contextId, tab.id).then(setState)}
                className={[
                  'min-w-0 flex-1 truncate rounded-l-md px-2 py-1 text-left text-[10.5px] font-semibold',
                  tab.id === state.activeTabId ? 'bg-[var(--accent-primary)]/10 text-[var(--text-primary)]' : 'text-[var(--text-muted)]'
                ].join(' ')}
              >
                {tab.status === 'loading' ? 'Loading' : tab.label || 'New tab'}
              </button>
              <button
                type="button"
                className="grid size-6 shrink-0 place-items-center rounded-r-md text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                title="Close tab"
                onClick={() => void browserApi?.closeTab(contextId, tab.id).then(setState)}
              >
                <CloseIcon />
              </button>
            </div>
          ))}
        </div>
      )}

      {visibleActions.length > 0 && (
        <div className="no-scrollbar flex shrink-0 gap-1.5 overflow-x-auto border-b border-[var(--border-soft)] px-2.5 py-2">
          {visibleActions.slice(-10).map((action) => (
            <div
              key={action.id}
              className="flex max-w-[230px] shrink-0 items-center gap-2 rounded-md border border-[var(--border-soft)] bg-[var(--surface-muted)] px-2 py-1.5"
            >
              <span className={actionDotClass(action.status)} />
              <span className="min-w-0">
                <span className="block truncate text-[11px] font-semibold text-[var(--text-primary)]">{action.label}</span>
                {(action.target || action.message) && (
                  <span className="block truncate text-[10px] text-[var(--text-muted)]">{action.target || action.message}</span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      {error ? (
        <div className="m-3 shrink-0 rounded-md border border-[var(--accent-danger)]/40 bg-[var(--accent-danger)]/10 px-3 py-2 text-[12px] font-semibold text-[var(--accent-danger)]">
          {error}
        </div>
      ) : null}

      <div ref={viewportRef} className="min-h-[260px] flex-1 bg-[#080a0d]" />

      {(screenshot || resultSummary || tool?._result?.content) && (
        <div className="max-h-[280px] shrink-0 overflow-y-auto border-t border-[var(--border-soft)] p-3">
          {screenshot ? (
            <div className="overflow-hidden rounded-md border border-[var(--border-soft)] bg-[var(--surface-muted)]">
              <div className="flex items-center justify-between gap-3 border-b border-[var(--border-soft)] px-3 py-2">
                <div className="min-w-0">
                  <div className="truncate text-[12px] font-semibold text-[var(--text-primary)]">{screenshot.label}</div>
                  {screenshot.url && <div className="truncate text-[10.5px] text-[var(--text-muted)]">{screenshot.url}</div>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {screenshot.bytes ? <span className="text-[10px] text-[var(--text-muted)]">{formatBytes(screenshot.bytes)}</span> : null}
                  <button
                    type="button"
                    onClick={() => setShowScreenshot((value) => !value)}
                    className="rounded-md border border-[var(--border-soft)] bg-[var(--surface-panel)] px-2 py-1 text-[10.5px] font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  >
                    {showScreenshot ? 'Hide' : 'View'}
                  </button>
                </div>
              </div>
              {showScreenshot && (
                <div className="max-h-[340px] overflow-auto bg-[#080a0d] p-2">
                  <img className="mx-auto block max-h-[320px] max-w-full rounded object-contain" src={screenshot.src} alt={screenshot.url || 'Browser screenshot'} loading="lazy" />
                </div>
              )}
            </div>
          ) : resultSummary ? (
            <div className="rounded-md border border-[var(--border-soft)] bg-[var(--surface-muted)] px-3 py-2 text-[12px] text-[var(--text-secondary)]">
              {resultSummary}
            </div>
          ) : null}
          {!screenshot && tool?._result?.content && (
            <div className="mt-3">
              <CodePanel title={tool._result.is_error || tool._result.isError ? 'Error' : 'Result'} value={prettyJsonOrRaw(tool._result.content)} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const buttonClass = 'flex size-8 shrink-0 items-center justify-center rounded-md border border-[var(--border-soft)] bg-[var(--surface-muted)] text-[var(--text-secondary)] transition hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-40'

function fallbackAction(tool: ToolUseBlock): BrowserActionRun {
  return {
    id: tool.id,
    name: tool.name,
    label: browserActionLabel(tool),
    status: tool._status === 'completed' || tool._result ? 'completed' : tool._status === 'failed' ? 'failed' : 'running',
    target: browserTargetFromTool(tool),
    message: tool._progress?.summary || tool._progress?.message || tool._message || '',
    startedAt: Date.now()
  }
}

function CloseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
      <path d="m3 3 6 6M9 3 3 9" />
    </svg>
  )
}

function actionDotClass(status: BrowserActionRun['status']) {
  if (status === 'running') return 'size-1.5 shrink-0 rounded-full bg-[var(--accent-primary)] shadow-[0_0_10px_var(--accent-primary)]'
  if (status === 'completed') return 'size-1.5 shrink-0 rounded-full bg-[var(--accent-success)]'
  if (status === 'failed') return 'size-1.5 shrink-0 rounded-full bg-[var(--accent-danger)]'
  return 'size-1.5 shrink-0 rounded-full bg-[var(--text-muted)]'
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

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
