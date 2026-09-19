import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AddOne, Book, Browser, CheckOne, Close, Code, DocDetail, FilePdf, FileTextOne, Robot, LoadingOne, FileWord, FileExcel, Left, Right, Refresh, Play, Tool, PreviewOpen } from '@icon-park/react'
import { MarkdownView } from '@renderer/components/MarkdownView'
import { derivePlanSnapshot } from '@renderer/lib/plan'
import { useUIStore } from '@renderer/stores/ui'
import { useSessionStore } from '@renderer/stores/session'
import { SubagentPanel } from '@renderer/components/chat/subagent/SubagentPanel'
import { PlanEditorPanel } from '@renderer/components/chat/plan/PlanEditorPanel'
import { PDFViewerPanel } from '@renderer/components/chat/PDFViewerPanel'
import { ArtifactPreviewPanel } from '@renderer/components/chat/ArtifactPreviewPanel'
import { DocxPreviewPanel } from '@renderer/components/chat/DocxPreviewPanel'
import { XlsxPreviewPanel } from '@renderer/components/chat/XlsxPreviewPanel'
import { PptxPreviewPanel } from '@renderer/components/chat/PptxPreviewPanel'
import { flattenRightPanels } from '@renderer/stores/ui'
import { WindowCloseIcon, WindowMaximizeIcon } from '@renderer/components/ui/WindowControlIcon'
import { renderToolBody, toolLabel, toolSnippet } from '@renderer/components/chat/tool-block/toolDisplay'
import { toolStatus } from '@renderer/components/chat/tool-block/quietGroupPhrase'
import type { RightPanelInstance, RightPanelKind, RightPanelColumn } from '@renderer/stores/ui'
import type { AgentState, StreamingBlock } from '@renderer/stores/session'
import type { Message, ToolUseBlock } from '@renderer/api/types'

// Stable empty reference - must be module-level so the Zustand selector returns
// the same reference every render when no session is found. An inline []
// would return a new reference each call, triggering an infinite re-render loop.
const EMPTY_MESSAGES: Message[] = []

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

function toolStatusDotClass(status: string | null) {
  if (status === 'completed') return 'bg-app-success'
  if (status === 'failed') return 'bg-app-error'
  if (status === 'running' || status === 'pending') return 'bg-[var(--color-accent)]'
  return 'bg-app-text-muted'
}

function statusIconClass(status: string) {
  if (status === 'completed') return 'text-app-success'
  if (status === 'failed') return 'text-app-error'
  if (status === 'running' || status === 'pending') return 'animate-spin text-[var(--color-accent)]'
  return 'text-app-text-muted'
}

function activePanelClass(active?: boolean) {
  return active ? 'border-[rgba(239,124,47,0.28)] bg-[rgba(239,124,47,0.055)]' : 'border-app-border-subtle bg-white/[0.02]'
}

const monitorSectionClass = 'flex flex-col gap-2 border-b border-app-border-subtle px-3 py-2.5'
const monitorSectionHeadClass = 'flex items-center justify-between gap-2'
const monitorLabelClass = 'text-[10px] font-bold uppercase tracking-[0.08em] text-app-text-muted'
const monitorMetaClass = 'text-[10px] text-app-text-muted'
const emptyHintClass = 'm-0 text-[10px] italic text-app-text-muted'

function tintedRowClass(status?: string) {
  if (status === 'running' || status === 'in_progress' || status === 'pending') return 'border-[rgba(239,124,47,0.28)] bg-[rgba(239,124,47,0.05)]'
  if (status === 'failed') return 'border-[rgba(var(--color-error-rgb),0.28)] bg-[rgba(var(--color-error-rgb),0.05)]'
  if (status === 'completed') return 'border-app-border-subtle bg-white/[0.02] opacity-75'
  return 'border-app-border-subtle bg-white/[0.02]'
}

function statusDotClass(status?: string) {
  if (status === 'completed') return 'bg-app-success'
  if (status === 'failed') return 'bg-app-error'
  if (status === 'running' || status === 'in_progress' || status === 'pending') return 'bg-[var(--color-accent)]'
  return 'bg-app-border'
}

export function RightPanelHost() {
  const rightColumns = useUIStore((s) => s.rightColumns)
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed)
  const maximizedPanelId = useUIStore((s) => s.maximizedPanelId)
  const closeRightPanel = useUIStore((s) => s.closeRightPanel)
  const toggleMaximizePanel = useUIStore((s) => s.toggleMaximizePanel)

  if (rightColumns.length === 0) return null

  const maximized = maximizedPanelId ? flattenRightPanels(rightColumns).find((p) => p.id === maximizedPanelId) : undefined

  if (maximized) {
    return (
      <div
        className="fixed bottom-0 right-0 top-[34px] z-[200] flex min-w-0 flex-col border-l border-app-border-subtle bg-app-bg shadow-[var(--shadow-large)]"
        style={{ left: sidebarCollapsed ? 'var(--sidebar-collapsed-width)' : 'var(--sidebar-width)' }}
      >
        <PanelFrame
          panel={maximized}
          isMaximized
          onClose={() => closeRightPanel(maximized.id)}
          onToggleMaximize={() => toggleMaximizePanel(maximized.id)}
        />
      </div>
    )
  }

  return (
    <div className="relative z-40 flex h-full shrink-0 items-stretch">
      {rightColumns.map((column) => (
        <RightPanelColumnView key={column.id} column={column} />
      ))}
    </div>
  )
}

function RightPanelColumnView({ column }: { column: RightPanelColumn }) {
  const closeRightPanel = useUIStore((s) => s.closeRightPanel)
  const setRightPanelWidth = useUIStore((s) => s.setRightPanelWidth)
  const setRightPanelSplit = useUIStore((s) => s.setRightPanelSplit)
  const toggleMaximizePanel = useUIStore((s) => s.toggleMaximizePanel)
  const widthDrag = useRef<{ startX: number; startWidth: number } | null>(null)
  const splitDrag = useRef<{ startY: number; startSplit: number; containerHeight: number } | null>(null)

  function onWidthDragStart(e: React.MouseEvent) {
    e.preventDefault()
    widthDrag.current = { startX: e.clientX, startWidth: column.width }
    const onMove = (ev: MouseEvent) => {
      if (!widthDrag.current) return
      const delta = widthDrag.current.startX - ev.clientX
      setRightPanelWidth(column.id, widthDrag.current.startWidth + delta)
    }
    const onUp = () => {
      widthDrag.current = null
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  function onSplitDragStart(e: React.MouseEvent, containerHeight: number) {
    e.preventDefault()
    splitDrag.current = { startY: e.clientY, startSplit: column.split, containerHeight }
    const onMove = (ev: MouseEvent) => {
      if (!splitDrag.current) return
      const delta = ev.clientY - splitDrag.current.startY
      setRightPanelSplit(column.id, splitDrag.current.startSplit + delta / splitDrag.current.containerHeight)
    }
    const onUp = () => {
      splitDrag.current = null
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  return (
    <div className="relative flex h-full min-w-0 flex-col border-l border-app-border-subtle bg-app-bg shadow-[var(--shadow-medium)]" style={{ width: `${column.width}px` }}>
      <div className="absolute bottom-0 left-[-4px] top-0 z-10 w-2 cursor-col-resize transition-colors duration-150 hover:bg-app-primary-subtle active:bg-app-primary-subtle" onMouseDown={onWidthDragStart} aria-label="Drag to resize" />
      {column.panels.map((panel, index) => (
        <div
          key={panel.id}
          className="relative flex min-h-0 flex-col"
          style={column.panels.length === 2 ? { flex: index === 0 ? column.split : 1 - column.split } : { flex: 1 }}
        >
          <PanelFrame
            panel={panel}
            isMaximized={false}
            onClose={() => closeRightPanel(panel.id)}
            onToggleMaximize={() => toggleMaximizePanel(panel.id)}
          />
          {column.panels.length === 2 && index === 0 && (
            <div
              className="absolute bottom-[-4px] left-0 right-0 z-20 h-2 cursor-row-resize transition-colors duration-150 hover:bg-app-primary-subtle active:bg-app-primary-subtle"
              onMouseDown={(e) => onSplitDragStart(e, e.currentTarget.parentElement?.parentElement?.clientHeight ?? 600)}
              aria-label="Drag to resize"
            />
          )}
        </div>
      ))}
    </div>
  )
}

function PanelFrame({
  panel,
  isMaximized,
  onClose,
  onToggleMaximize,
}: {
  panel: RightPanelInstance
  isMaximized: boolean
  onClose: () => void
  onToggleMaximize: () => void
}) {
  // The plan panel renders its own full header (title, Edit toggle, status
  // badge, maximize, close) in one row - it owns state (edit mode, plan
  // status) that this generic frame has no access to, and a second
  // independent header here would just repeat the title underneath it.
  if (panel.kind === 'plan') {
    return (
      <aside className="flex min-h-0 flex-1 flex-col overflow-hidden bg-app-surface">
        <PlanEditorPanelHost panel={panel} isMaximized={isMaximized} onClose={onClose} onToggleMaximize={onToggleMaximize} />
      </aside>
    )
  }

  return (
    <aside className="flex min-h-0 flex-1 flex-col overflow-hidden bg-app-surface">
      <div className="flex min-h-[46px] shrink-0 items-center justify-between gap-2 border-b border-app-border-subtle px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex size-[22px] shrink-0 items-center justify-center rounded-[7px] border border-app-border-subtle bg-app-primary-subtle text-app-primary">{renderPanelIcon(panel.kind)}</span>
          <div className="min-w-0">
            <h2 className="overflow-hidden text-ellipsis whitespace-nowrap text-[var(--font-size-base)] font-bold text-app-text">{panel.title}</h2>
            {panel.sourceLabel && <p className="mt-0.5 overflow-hidden text-ellipsis whitespace-nowrap text-[var(--font-size-2xs)] font-semibold uppercase tracking-[0.06em] text-app-text-muted">{panel.sourceLabel}</p>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button className="flex size-7 cursor-pointer items-center justify-center rounded-[7px] border-0 bg-transparent text-app-text-secondary transition-colors duration-150 hover:bg-[var(--color-hover)] hover:text-app-text" type="button" onClick={onToggleMaximize} aria-label={isMaximized ? 'Restore' : 'Maximize'}>
            <WindowMaximizeIcon />
          </button>
          <button className="flex size-7 cursor-pointer items-center justify-center rounded-[7px] border-0 bg-transparent text-app-text-secondary transition-colors duration-150 hover:bg-[var(--color-hover)] hover:text-app-text" type="button" onClick={onClose}>
            <WindowCloseIcon />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto bg-app-surface p-3">{renderPanelBody(panel)}</div>
    </aside>
  )
}

function renderPanelIcon(kind: RightPanelKind) {
  switch (kind) {
    case 'browser':
      return <Browser size={11} />
    case 'subagent':
      return <Robot size={11} />
    case 'agent':
      return <Robot size={11} />
    case 'knowledge':
      return <Book size={11} />
    case 'plan':
      return <DocDetail size={11} />
    case 'pdf':
      return <FilePdf size={11} />
    case 'docx':
      return <FileWord size={11} />
    case 'xlsx':
      return <FileExcel size={11} />
    case 'pptx':
      return <DocDetail size={11} />
    case 'artifact':
      return <Code size={11} />
    default:
      return <FileTextOne size={11} />
  }
}

function renderPanelBody(panel: RightPanelInstance) {
  switch (panel.kind) {
    case 'agent':
      return <AgentWorkspacePanel sessionId={panel.sessionId ?? ''} />
    case 'markdown':
      if (!panel.markdown) {
        return (
          <EmptyState
            title="Markdown preview"
            description="Generated markdown content will render here when a note or document is opened."
          />
        )
      }
      return panel.plainText ? (
        <pre className="m-0 whitespace-pre-wrap rounded-app-md border border-app-border-subtle bg-[var(--color-code-bg)] p-3 font-mono text-[var(--font-size-sm)] leading-relaxed text-[var(--color-code-fg)]">{panel.markdown}</pre>
      ) : (
        <MarkdownView sessionId={panel.sessionId}>{panel.markdown}</MarkdownView>
      )
    case 'browser':
      return <BrowserPanel url={panel.browserUrl} contextId={panel.sessionId ? `session:${panel.sessionId}` : 'chat'} />
    case 'knowledge':
      return <KnowledgePanel results={panel.knowledgeResults ?? []} />
    case 'subagent':
      return <SubagentPanel sessionId={panel.sessionId ?? ''} toolUseId={panel.subagentToolUseId ?? ''} />
    case 'pdf':
      return panel.documentFileId ? (
        <PDFViewerPanel fileId={panel.documentFileId} filename={panel.title} />
      ) : (
        <EmptyState title="PDF preview" description="This PDF couldn't be opened." />
      )
    case 'docx':
      return panel.documentFileId ? (
        <DocxPreviewPanel fileId={panel.documentFileId} filename={panel.title} />
      ) : (
        <EmptyState title="Document preview" description="This document couldn't be opened." />
      )
    case 'xlsx':
      return panel.documentFileId ? (
        <XlsxPreviewPanel fileId={panel.documentFileId} filename={panel.title} />
      ) : (
        <EmptyState title="Spreadsheet preview" description="This spreadsheet couldn't be opened." />
      )
    case 'pptx':
      return panel.documentFileId ? (
        <PptxPreviewPanel fileId={panel.documentFileId} filename={panel.title} />
      ) : (
        <EmptyState title="Presentation preview" description="This presentation couldn't be opened." />
      )
    case 'artifact':
      return panel.artifactPreviewId ? (
        <ArtifactPreviewPanel artifactId={panel.artifactPreviewId} filename={panel.title} />
      ) : (
        <EmptyState title="Artifact preview" description="This artifact couldn't be opened." />
      )
    default:
      return (
        <EmptyState
          title={panel.title || 'Right panel'}
          description={panel.note || 'Supplementary content will appear here.'}
        />
      )
  }
}

// Subscribes reactively to the plan session's pendingPermission, unlike a
// plain getState() snapshot (the previous implementation) which reads the
// store once and never updates again - since renderPanelBody is an ordinary
// function, not a component, that snapshot would only ever refresh if some
// unrelated state change happened to re-render RightPanelHost. A permission
// resolved elsewhere (e.g. via handlePermissionDecision in Conversation.tsx)
// could then leave this panel showing a stale "Proceed" button after the
// user had already approved or denied it.
function PlanEditorPanelHost({
  panel,
  isMaximized,
  onClose,
  onToggleMaximize,
}: {
  panel: RightPanelInstance
  isMaximized: boolean
  onClose: () => void
  onToggleMaximize: () => void
}) {
  const planSessionId = panel.sessionId ?? ''
  const pendingPermission = useSessionStore((s) =>
    planSessionId ? s.getAgentState(planSessionId).pendingPermission : null
  )
  const isExitPlanMode = pendingPermission?.toolName === 'exit_plan_mode'
  const pendingPerm = isExitPlanMode
    ? { toolUseId: pendingPermission.toolUseId }
    : null
  // No structured PlanDocument (agent called exit_plan_mode without
  // submit_plan): fall back to the raw plan text so PlanEditorPanel can
  // still render the same annotate/comment review experience.
  const rawContent = !panel.planId && isExitPlanMode
    ? (pendingPermission.toolInput.plan as string | undefined) ?? ''
    : undefined

  return (
    <PlanEditorPanel
      planId={panel.planId}
      sessionId={planSessionId}
      pendingPermission={pendingPerm}
      rawContent={rawContent}
      isMaximized={isMaximized}
      onClose={onClose}
      onToggleMaximize={onToggleMaximize}
    />
  )
}

function KnowledgePanel({ results }: { results: NonNullable<RightPanelInstance['knowledgeResults']> }) {
  if (results.length === 0) {
    return (
      <EmptyState
        title="Knowledge context"
        description="Retrieved knowledge excerpts will appear here when a conversation is attached to a corpus."
      />
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {results.map((result, index) => {
        const filename = result.metadata?.filename
        const score = Number.isFinite(result.score) ? result.score.toFixed(3) : null
        return (
          <div key={result.key || String(index)} className="rounded-app-md border border-app-border-subtle bg-app-bg p-2.5">
            <span className="block text-[var(--font-size-sm)] font-bold text-app-text">{filename || `Excerpt ${index + 1}`}</span>
            {score && <span className="mt-1 block text-[var(--font-size-2xs)] font-semibold uppercase tracking-[0.06em] text-app-text-muted">Relevance {score}</span>}
            <p className="mt-1.5 text-[var(--font-size-sm)] leading-relaxed text-app-text-secondary">{result.text}</p>
          </div>
        )
      })}
    </div>
  )
}

// contextId scopes tabs/history to a single browsing session - the shared
// chat right panel ('chat', the default) vs. each project's own Browser tab
// (Projects passes 'project:<rootPath>'). Without this every caller shared
// one global browser instance, so opening the panel from a different
// project would show whatever the last project (or chat) was browsing.
export function BrowserPanel({ url, contextId = 'chat' }: { url?: string; contextId?: string }) {
  const browserApi = window.nexus?.browser
  const initialUrl = url || 'https://www.google.com/'
  const viewportRef = useRef<HTMLDivElement>(null)
  const [address, setAddress] = useState(initialUrl)
  const [state, setState] = useState<BrowserPanelState | null>(null)
  const activeTab = state?.tabs.find((tab) => tab.id === state.activeTabId) ?? state?.tabs[0] ?? null

  const syncBounds = useCallback(() => {
    const element = viewportRef.current
    if (!element || !browserApi) return
    const rect = element.getBoundingClientRect()
    if (rect.width < 2 || rect.height < 2) return
    const bounds = {
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height,
    }
    void browserApi.setBounds(contextId, bounds).catch(() => undefined)
  }, [browserApi, contextId])

  useEffect(() => {
    if (!browserApi) return
    const element = viewportRef.current
    if (!element) return

    const rect = element.getBoundingClientRect()
    const bounds = { x: rect.left, y: rect.top, width: rect.width, height: rect.height }
    void browserApi.show(contextId, bounds).then((next) => {
      setState(next)
      // Re-mounting (e.g. switching away from and back to a Browser tab)
      // must not force-navigate over an already-open tab - only do that
      // when the caller passed an explicit url (opening a link from chat)
      // or when this is a genuinely fresh session with no tabs yet.
      // Otherwise this wipes out whatever the user was browsing every time.
      if (url || next.tabs.length === 0) {
        void browserApi.navigate(contextId, initialUrl).then(setState).catch(() => undefined)
        return
      }
      const activeUrl = next.tabs.find((tab) => tab.id === next.activeTabId)?.url ?? next.tabs[0]?.url
      if (activeUrl && activeUrl !== 'about:blank') setAddress(activeUrl)
    }).catch(() => undefined)

    const observer = new ResizeObserver(syncBounds)
    observer.observe(element)
    window.addEventListener('resize', syncBounds)
    window.addEventListener('scroll', syncBounds, true)
    const unsubscribeState = browserApi.onStateChange?.(contextId, (next) => {
      setState(next)
      const nextUrl = next.tabs.find((tab) => tab.id === next.activeTabId)?.url ?? next.tabs[0]?.url
      if (nextUrl && nextUrl !== 'about:blank') setAddress(nextUrl)
    })
    const frame = window.requestAnimationFrame(syncBounds)

    return () => {
      window.cancelAnimationFrame(frame)
      observer.disconnect()
      window.removeEventListener('resize', syncBounds)
      window.removeEventListener('scroll', syncBounds, true)
      unsubscribeState?.()
      void browserApi.hide(contextId).catch(() => undefined)
    }
  }, [browserApi, contextId, initialUrl, syncBounds])

  async function navigate() {
    const target = address.trim()
    if (!target || !browserApi) return
    const next = await browserApi.navigate(contextId, target).catch(() => null)
    if (next) setState(next)
  }

  function openNewTab() {
    void browserApi?.newTab(contextId).then(setState)
  }

  function switchToTab(tabId: string) {
    void browserApi?.switchTab(contextId, tabId).then(setState)
  }

  function closeTab(event: React.MouseEvent, tabId: string) {
    event.stopPropagation()
    void browserApi?.closeTab(contextId, tabId).then(setState)
  }

  const tabs = state?.tabs ?? []

  return (
    <div className="flex h-full min-h-[420px] flex-col overflow-hidden rounded-app-md border border-app-border-subtle bg-app-bg">
      {tabs.length > 0 && (
        <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-app-border-subtle bg-app-surface px-2 pb-1.5 pt-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={[
                'flex max-w-[180px] shrink-0 cursor-pointer items-center gap-1.5 rounded-[7px] border border-transparent px-2 py-1.5 text-left text-[var(--font-size-2xs)] font-semibold text-app-text-muted transition-colors duration-150 hover:bg-[var(--color-hover)] hover:text-app-text',
                tab.id === state?.activeTabId ? 'border-app-border-subtle bg-app-bg text-app-text' : '',
              ].join(' ')}
              onClick={() => switchToTab(tab.id)}
            >
              {tab.status === 'loading' ? <LoadingOne className="animate-spin" size={11} /> : <Browser size={11} />}
              <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{tab.label}</span>
              {tabs.length > 1 && (
                <span
                  className="ml-1 flex size-[18px] shrink-0 items-center justify-center rounded-[5px] text-app-text-muted hover:bg-[var(--color-hover)] hover:text-app-text"
                  role="button"
                  aria-label="Close tab"
                  onClick={(event) => closeTab(event, tab.id)}
                >
                  <Close size={10} />
                </span>
              )}
            </button>
          ))}
          <button type="button" className="flex size-[26px] shrink-0 cursor-pointer items-center justify-center rounded-[7px] border border-app-border-subtle bg-app-bg text-app-text-secondary transition-colors duration-150 hover:bg-[var(--color-hover)] hover:text-app-text" onClick={openNewTab} aria-label="New tab">
            <AddOne size={12} />
          </button>
        </div>
      )}
      <div className="flex shrink-0 items-center gap-1 border-b border-app-border-subtle bg-app-surface px-2 py-1.5">
        <button className="flex size-7 cursor-pointer items-center justify-center rounded-[7px] border-0 bg-transparent text-app-text-secondary transition-colors duration-150 hover:bg-[var(--color-hover)] hover:text-app-text disabled:cursor-default disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-app-text-secondary" type="button" onClick={() => void browserApi?.back(contextId).then(setState)} disabled={!activeTab?.canGoBack} aria-label="Back">
          <Left size={12} />
        </button>
        <button className="flex size-7 cursor-pointer items-center justify-center rounded-[7px] border-0 bg-transparent text-app-text-secondary transition-colors duration-150 hover:bg-[var(--color-hover)] hover:text-app-text disabled:cursor-default disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-app-text-secondary" type="button" onClick={() => void browserApi?.forward(contextId).then(setState)} disabled={!activeTab?.canGoForward} aria-label="Forward">
          <Right size={12} />
        </button>
        <button className="flex size-7 cursor-pointer items-center justify-center rounded-[7px] border-0 bg-transparent text-app-text-secondary transition-colors duration-150 hover:bg-[var(--color-hover)] hover:text-app-text disabled:cursor-default disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-app-text-secondary" type="button" onClick={() => void browserApi?.reload(contextId).then(setState)} aria-label="Reload">
          <Refresh size={12} />
        </button>
        <form
          className="min-w-0 flex-1"
          onSubmit={(event) => {
            event.preventDefault()
            void navigate()
          }}
        >
          <input
            className="h-7 w-full rounded-[8px] border border-app-border-subtle bg-app-bg px-2.5 text-[var(--font-size-sm)] text-app-text outline-none transition-colors duration-150 placeholder:text-app-text-muted focus:border-app-primary"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            placeholder="Search or enter website"
            spellCheck={false}
          />
        </form>
      </div>
      <div className="relative min-h-[260px] flex-1 overflow-hidden bg-white" ref={viewportRef}>
        {!browserApi && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-[var(--font-size-sm)] text-app-text-muted">
            <Browser size={18} />
            <span>Embedded browser is only available in the desktop app.</span>
          </div>
        )}
      </div>
    </div>
  )
}

// Agent Workspace

const WORKSPACE_HIDDEN_TOOLS = new Set([
  'enter_plan_mode',
  'exit_plan_mode',
  'enter_pair_programming_mode',
  'exit_pair_programming_mode',
])

type WorkspaceTool = ToolUseBlock & {
  source: 'history' | 'live'
  order: number
}

function AgentWorkspacePanel({ sessionId }: { sessionId: string }) {
  const agentState = useSessionStore((s) => s.getAgentState(sessionId))
  const planArtifact = useSessionStore(
    (s) => s.sessions.find((session) => session.id === sessionId)?.planArtifact,
  )
  const sessionMessages = useSessionStore(
    (s) => s.sessions.find((session) => session.id === sessionId)?.messages ?? EMPTY_MESSAGES,
  )
  const streaming = useSessionStore((s) => s.getStreaming(sessionId))
  const [selectedToolId, setSelectedToolId] = useState<string | null>(null)
  const openRightPanel = useUIStore((s) => s.openRightPanel)
  const plan = useMemo(
    () => derivePlanSnapshot(sessionMessages, streaming),
    [sessionMessages, streaming],
  )
  const tools = useMemo(
    () => collectWorkspaceTools(sessionMessages, streaming),
    [sessionMessages, streaming],
  )
  const latestTool = tools.at(-1) ?? null
  const selectedTool = selectedToolId
    ? tools.find((tool) => tool.id === selectedToolId) ?? latestTool
    : latestTool
  const selectedStatus = selectedTool ? toolStatus(selectedTool) : null
  const selectedUrl = selectedTool ? browserUrlFromTool(selectedTool) : null
  const isBrowserTool = selectedTool?.name.startsWith('browser_') ?? false

  useEffect(() => {
    if (!latestTool) return
    const latestStatus = toolStatus(latestTool)
    const selectedStillExists = selectedToolId && tools.some((tool) => tool.id === selectedToolId)
    if (!selectedStillExists || latestStatus === 'running' || latestStatus === 'pending') {
      setSelectedToolId(latestTool.id)
    }
  }, [latestTool?.id, selectedToolId, tools])

  function openBrowser() {
    openRightPanel({
      kind: 'browser',
      title: 'Browser',
      sessionId,
      browserUrl: selectedUrl ?? undefined,
    })
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-app-bg">
      <div className="flex shrink-0 items-center justify-between gap-2.5 border-b border-app-border-subtle bg-app-surface px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={cx(
              'size-2 shrink-0 rounded-full shadow-[0_0_0_5px_rgba(255,255,255,0.025)]',
              agentState.activeTool ? 'bg-[var(--color-accent)] shadow-[0_0_0_5px_rgba(239,124,47,0.14)]' : 'bg-app-text-muted',
            )}
          />
          <div className="min-w-0">
            <h3 className="m-0 text-[var(--font-size-sm)] font-bold text-app-text">Seshat's workspace</h3>
            <p className="mt-0.5 overflow-hidden text-ellipsis whitespace-nowrap text-[10.5px] text-app-text-muted">
              {agentState.activeTool
                ? `${toolDisplayName(agentState.activeTool.toolName)}${agentState.activeTool.message ? ` - ${agentState.activeTool.message}` : ''}`
                : agentState.isThinking
                  ? 'Reasoning'
                  : 'Waiting for the next action'}
            </p>
          </div>
        </div>
        {isBrowserTool && (
          <button type="button" className="inline-flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded-[7px] border border-[rgba(239,124,47,0.26)] bg-[rgba(239,124,47,0.09)] px-2 text-[10.5px] font-semibold text-[var(--color-accent)] hover:bg-[rgba(239,124,47,0.14)]" onClick={openBrowser}>
            <PreviewOpen size={13} />
            <span>Open browser</span>
          </button>
        )}
      </div>

      <div className="h-[min(46vh,520px)] min-h-[280px] shrink-0 border-b border-app-border-subtle bg-[color-mix(in_srgb,var(--color-bg)_97%,black)]">
        {!selectedTool ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-5 text-center text-app-text-muted">
            <Tool size={20} />
            <h3 className="m-0 text-[var(--font-size-base)] text-app-text">No tool activity yet</h3>
            <p className="m-0 max-w-[260px] text-[var(--font-size-2xs)] leading-normal">Tool runs, files, browser actions, plans and sub-agents will appear here.</p>
          </div>
        ) : isBrowserTool && window.nexus?.browser ? (
          <div className="h-full min-h-0">
            <BrowserPanel url={selectedUrl ?? undefined} contextId={`session:${sessionId}`} />
          </div>
        ) : (
          <div className="flex h-full min-h-0 flex-col">
            <div className="flex items-center justify-between gap-2 border-b border-app-border-subtle bg-app-surface px-2.5 py-2">
              <div className="flex min-w-0 items-center gap-2 text-[var(--font-size-sm)] font-bold text-app-text">
                <span className={cx('size-2 shrink-0 rounded-full', toolStatusDotClass(selectedStatus))} />
                <span>{toolLabel(selectedTool.name)}</span>
              </div>
              <span className="text-[10px] text-app-text-muted">{selectedTool.source === 'live' ? 'Live' : 'History'}</span>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-2.5 [&>*]:max-w-full">
              {renderToolBody({
                tool: selectedTool,
                result: selectedTool._result,
                status: selectedStatus ?? 'pending',
                sessionId,
              })}
            </div>
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-app-border-subtle px-2.5 py-2">
        <button
          type="button"
          className="inline-flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded-[7px] border border-[rgba(239,124,47,0.26)] bg-[rgba(239,124,47,0.09)] px-2 text-[10.5px] font-semibold text-[var(--color-accent)] hover:bg-[rgba(239,124,47,0.14)] disabled:cursor-default disabled:opacity-45 disabled:hover:bg-[rgba(239,124,47,0.09)]"
          disabled={!latestTool}
          onClick={() => latestTool && setSelectedToolId(latestTool.id)}
        >
          <Play size={11} />
          <span>Jump to live</span>
        </button>
        <span className="text-[10px] text-app-text-muted">{tools.length} tool{tools.length === 1 ? '' : 's'}</span>
      </div>

      <div className="flex max-h-[230px] shrink-0 flex-col gap-1.5 overflow-auto border-b border-app-border-subtle p-2.5">
        {tools.length === 0 ? (
          <p className="m-0 text-[10px] italic text-app-text-muted">No tool activity has been recorded yet.</p>
        ) : (
          tools.slice(-18).reverse().map((tool) => {
            const status = toolStatus(tool)
            const snippet = workspaceToolSnippet(tool)
            return (
              <button
                key={`${tool.source}-${tool.id}-${tool.order}`}
                type="button"
                className={cx(
                  'grid w-full cursor-pointer grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-2 rounded-app-md border p-2 text-left text-inherit',
                  activePanelClass(selectedTool?.id === tool.id),
                  'hover:border-[rgba(239,124,47,0.28)] hover:bg-[rgba(239,124,47,0.055)]',
                )}
                onClick={() => setSelectedToolId(tool.id)}
              >
                <span className={cx('inline-flex items-center justify-center', statusIconClass(status))}>
                  {status === 'running' || status === 'pending'
                    ? <LoadingOne size={11} />
                    : status === 'failed'
                      ? <Close size={11} />
                      : <CheckOne size={11} />}
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-[var(--font-size-2xs)] font-bold text-app-text">{toolLabel(tool.name)}</span>
                  {snippet && <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[10.5px] text-app-text-muted">{snippet}</span>}
                </span>
                <span className="text-[10px] text-app-text-muted">{tool.source === 'live' ? 'live' : 'past'}</span>
              </button>
            )
          })
        )}
      </div>

      <TurnTokenStats state={agentState} />
      <SubagentsSection sessionId={sessionId} />
      {planArtifact && <PlanArtifactSection sessionId={sessionId} planArtifact={planArtifact} />}
      <PlanSection plan={plan} />
      <ActivityTimelineSection state={agentState} />
    </div>
  )
}

function collectWorkspaceTools(messages: Message[], streaming: StreamingBlock[]): WorkspaceTool[] {
  const byId = new Map<string, WorkspaceTool>()
  let order = 0
  for (const message of messages) {
    for (const block of message.content) {
      if (block.type !== 'tool_use' || WORKSPACE_HIDDEN_TOOLS.has(block.name)) continue
      byId.set(block.id, { ...block, source: 'history', order: order++ })
    }
  }
  for (const block of streaming ?? []) {
    if (block.type !== 'tool_use' || WORKSPACE_HIDDEN_TOOLS.has(block.name)) continue
    byId.set(block.id, { ...block, source: 'live', order: order++ })
  }
  return [...byId.values()].sort((a, b) => a.order - b.order)
}

function workspaceToolSnippet(tool: ToolUseBlock): string {
  const registrySnippet = toolSnippet(tool)
  if (registrySnippet) return registrySnippet
  const values = ['description', 'query', 'url', 'file_path', 'path', 'command']
  for (const key of values) {
    const value = tool.input[key]
    if (typeof value === 'string' && value.trim()) {
      return value.length > 72 ? `${value.slice(0, 72)}...` : value
    }
  }
  return tool._message ?? ''
}

function browserUrlFromTool(tool: ToolUseBlock): string | null {
  const url = tool.input.url
  if (typeof url === 'string' && url.trim()) return url
  const target = tool.input.target
  if (typeof target === 'string' && target.trim()) return target
  const resultUrl = tool._result?.metadata?.url
  if (typeof resultUrl === 'string' && resultUrl.trim()) return resultUrl
  return null
}

// Aggregated view of every sub-agent spawned from this session (via the `agent`
// or `spawn_agent` tools) - previously the Agent Monitor only ever showed the
// main agent's own state, with no way to see how many sub-agents were active,
// completed, or failed without scrolling back through the transcript to find
// their individual cards. Renders nothing once no sub-agent has been spawned.
function SubagentsSection({ sessionId }: { sessionId: string }) {
  const subagents = useSessionStore((s) => s.subagentsBySession[sessionId])
  const openRightPanel = useUIStore((s) => s.openRightPanel)

  const entries = useMemo(
    () => Object.entries(subagents ?? {}).sort(([, a], [, b]) => b.startedAt - a.startedAt),
    [subagents],
  )

  if (entries.length === 0) return null

  const runningCount = entries.filter(([, sub]) => sub.status === 'running').length
  const failedCount = entries.filter(([, sub]) => sub.status === 'failed').length

  return (
    <div className={monitorSectionClass}>
      <div className={monitorSectionHeadClass}>
        <span className={monitorLabelClass}>Sub-agents</span>
        <span className={monitorMetaClass}>
          {runningCount > 0 ? `${runningCount} running / ` : ''}
          {entries.length} total
          {failedCount > 0 ? ` / ${failedCount} failed` : ''}
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        {entries.map(([toolUseId, sub]) => (
          <button
            key={toolUseId}
            type="button"
            className={cx(
              'flex w-full cursor-pointer items-start gap-2 rounded-[9px] border px-2 py-[7px] text-left text-inherit transition-colors duration-150 hover:border-app-border hover:bg-white/[0.045]',
              tintedRowClass(sub.status),
            )}
            onClick={() => openRightPanel({
              kind: 'subagent',
              title: sub.agentType,
              sessionId,
              subagentToolUseId: toolUseId,
            } as Parameters<typeof openRightPanel>[0])}
          >
            <span className={cx('mt-px flex size-4 shrink-0 items-center justify-center', statusIconClass(sub.status))}>
              {sub.status === 'running'
                ? <LoadingOne size={10} />
                : sub.status === 'completed'
                  ? <CheckOne size={10} />
                  : <Close size={10} />}
            </span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[var(--font-size-2xs)] font-semibold capitalize text-app-text">{sub.agentType.replace(/_/g, ' ').replace(/-/g, ' ')}</span>
              {sub.task && <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[10px] text-app-text-muted">{sub.task}</span>}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

function TurnTokenStats({ state }: { state: AgentState }) {
  return (
    <div className={monitorSectionClass}>
      <span className={monitorLabelClass}>Stats</span>
      <div className="grid grid-cols-2 gap-1.5">
        <Stat label="Turn" value={state.turnNumber > 0 ? `#${state.turnNumber}` : '-'} />
        <Stat label="Input tokens"  value={state.inputTokens  > 0 ? fmt(state.inputTokens)  : '-'} />
        <Stat label="Output tokens" value={state.outputTokens > 0 ? fmt(state.outputTokens) : '-'} />
        <Stat label="Total" value={
          state.inputTokens + state.outputTokens > 0
            ? fmt(state.inputTokens + state.outputTokens)
            : '-'
        } />
      </div>
    </div>
  )
}

function PlanSection({ plan }: { plan: ReturnType<typeof derivePlanSnapshot> }) {
  return (
    <div className={monitorSectionClass}>
      <div className={monitorSectionHeadClass}>
        <span className={monitorLabelClass}>Plan</span>
        {plan.items.length > 0 && (
          <span className={monitorMetaClass}>
            {plan.completedCount}/{plan.items.length} done / Tasks
          </span>
        )}
      </div>

      {plan.items.length === 0 ? (
        <p className={emptyHintClass}>No live plan is being tracked yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {plan.items.map((item) => (
            <div key={item.id} className={cx('flex items-start gap-2 rounded-[9px] border px-2 py-[7px]', tintedRowClass(item.status))}>
              <div className="mt-0.5 flex size-4 shrink-0 items-center justify-center text-app-success">
                {item.status === 'completed'
                  ? <CheckOne size={10} />
                  : <span className={cx('size-[7px] rounded-full', statusDotClass(item.status), item.status === 'in_progress' && 'shadow-[0_0_0_5px_rgba(239,124,47,0.12)]')} />}
              </div>
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-[var(--font-size-2xs)] leading-normal text-app-text">{item.title}</span>
                {item.detail && item.status === 'in_progress' && (
                  <span className="text-[10px] leading-normal text-app-text-secondary">{item.detail}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-app-md border border-app-border-subtle bg-white/[0.03] px-2 py-[7px]">
      <span className="font-mono text-[var(--font-size-md)] font-bold tabular-nums text-app-text">{value}</span>
      <span className="text-[10px] uppercase tracking-[0.06em] text-app-text-muted">{label}</span>
    </div>
  )
}

function PlanArtifactSection({ sessionId, planArtifact }: { sessionId: string; planArtifact: string }) {
  const openRightPanel = useUIStore((s) => s.openRightPanel)
  return (
    <div className="flex flex-col gap-2 border-b border-app-border-subtle px-3 py-2">
      <span className={monitorLabelClass}>Artifact</span>
      <button
        className="flex w-full cursor-pointer items-center gap-1.5 rounded-app-md border border-app-border-subtle bg-white/[0.03] px-2 py-1.5 text-left text-[var(--font-size-2xs)] font-medium text-app-text transition-colors duration-150 hover:border-[rgba(239,124,47,0.28)] hover:bg-[var(--color-hover)] hover:text-[var(--color-accent)]"
        type="button"
        onClick={() => openRightPanel({
          kind: 'markdown',
          title: 'Implementation Plan',
          sessionId,
          markdown: planArtifact,
        })}
      >
        <FileTextOne size={10} />
        <span>Implementation Plan</span>
      </button>
    </div>
  )
}

function ActivityTimelineSection({ state }: { state: AgentState }) {
  const entries = useMemo(() => [...state.activityLog].slice(-12).reverse(), [state.activityLog])

  return (
    <div className={monitorSectionClass}>
      <div className={monitorSectionHeadClass}>
        <span className={monitorLabelClass}>Timeline</span>
        {entries.length > 0 && <span className={monitorMetaClass}>{entries.length} recent</span>}
      </div>
      {entries.length === 0 ? (
        <p className={emptyHintClass}>Tool activity will appear here as the agent runs.</p>
      ) : (
        <div className="flex flex-col gap-[7px]">
          {entries.map((entry, index) => (
            <div key={`${entry.toolName}-${entry.startedAt}-${index}`} className="grid grid-cols-[12px_minmax(0,1fr)_auto] items-start gap-[7px] py-1.5">
              <span className={cx('mt-[5px] size-[7px] rounded-full', statusDotClass(entry.stage))} />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="flex min-w-0 items-center gap-1.5 text-[var(--font-size-2xs)] font-semibold text-app-text">
                  {toolDisplayName(entry.toolName)}
                  <span className="shrink-0 text-[9px] font-bold uppercase text-app-text-muted">{entry.stage.replace('_', ' ')}</span>
                </span>
                {entry.message && <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[10.5px] leading-normal text-app-text-muted">{entry.message}</span>}
              </span>
              <span className="pt-px text-[10px] text-app-text-muted">{formatActivityDuration(entry)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function toolDisplayName(name: string): string {
  const map: Record<string, string> = {
    bash: 'Bash', read: 'Read', write: 'Write', edit: 'Edit',
    glob: 'Glob', grep: 'Grep', web_search: 'Web Search', web_fetch: 'Web Fetch',
    agent: 'Agent',
    task_create: 'Task Create', task_update: 'Task Update',
    file_read: 'Read File', file_write: 'Write File', file_edit: 'Edit File',
  }
  return map[name] ?? name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function fmt(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
}

function formatActivityDuration(entry: AgentState['activityLog'][number]) {
  if (!entry.endedAt) return 'now'
  const ms = Math.max(0, entry.endedAt - entry.startedAt)
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <h3 className="m-0 text-[var(--font-size-md)] font-bold text-app-text">{title}</h3>
      <p className="m-0 mt-2 max-w-[280px] text-[var(--font-size-sm)] leading-relaxed text-app-text-muted">{description}</p>
    </div>
  )
}
