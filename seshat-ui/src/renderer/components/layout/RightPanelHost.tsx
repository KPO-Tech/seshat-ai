import { useMemo, useRef } from 'react'
import { Book, Browser, CheckOne, Close, Code, DocDetail, FilePdf, FileTextOne, Robot, LoadingOne, Square } from '@icon-park/react'
import { MarkdownView } from '@/components/MarkdownView'
import { derivePlanSnapshot } from '@/lib/plan'
import { useUIStore } from '@/stores/ui'
import { useSessionStore } from '@/stores/session'
import { SubagentPanel } from '@/components/chat/subagent/SubagentPanel'
import { PlanEditorPanel } from '@/components/chat/plan/PlanEditorPanel'
import { PDFViewerPanel } from '@/components/chat/PDFViewerPanel'
import { ArtifactPreviewPanel } from '@/components/chat/ArtifactPreviewPanel'
import { flattenRightPanels } from '@/stores/ui'
import type { RightPanelInstance, RightPanelKind, RightPanelColumn } from '@/stores/ui'
import type { AgentState } from '@/stores/session'
import type { Message } from '@/api/types'

// Stable empty reference - must be module-level so the Zustand selector returns
// the same reference every render when no session is found. An inline []
// would return a new reference each call, triggering an infinite re-render loop.
const EMPTY_MESSAGES: Message[] = []

export function RightPanelHost() {
  const rightColumns = useUIStore((s) => s.rightColumns)
  const maximizedPanelId = useUIStore((s) => s.maximizedPanelId)
  const closeRightPanel = useUIStore((s) => s.closeRightPanel)
  const toggleMaximizePanel = useUIStore((s) => s.toggleMaximizePanel)

  if (rightColumns.length === 0) return null

  const maximized = maximizedPanelId ? flattenRightPanels(rightColumns).find((p) => p.id === maximizedPanelId) : undefined

  if (maximized) {
    return (
      <div className="right-panel-stack right-panel-stack--maximized">
        <style>{RIGHT_PANEL_CSS}</style>
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
    <div className="right-panel-columns">
      <style>{RIGHT_PANEL_CSS}</style>
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
    <div className="right-panel-stack" style={{ width: `${column.width}px` }}>
      <div className="right-panel-resize-handle" onMouseDown={onWidthDragStart} title="Drag to resize" />
      {column.panels.map((panel, index) => (
        <div
          key={panel.id}
          className="right-panel-slot"
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
              className="right-panel-split-handle"
              onMouseDown={(e) => onSplitDragStart(e, e.currentTarget.parentElement?.parentElement?.clientHeight ?? 600)}
              title="Drag to resize"
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
      <aside className="right-panel">
        <PlanEditorPanelHost panel={panel} isMaximized={isMaximized} onClose={onClose} onToggleMaximize={onToggleMaximize} />
      </aside>
    )
  }

  return (
    <aside className="right-panel">
      <div className="right-panel-header">
        <div className="right-panel-heading">
          <span className="right-panel-icon">{renderPanelIcon(panel.kind)}</span>
          <div className="right-panel-header-copy">
            <h2 className="right-panel-title">{panel.title}</h2>
            {panel.sourceLabel && <p className="right-panel-meta">{panel.sourceLabel}</p>}
          </div>
        </div>
        <div className="right-panel-actions">
          <button className="right-panel-maximize-btn" type="button" onClick={onToggleMaximize} title={isMaximized ? 'Restore' : 'Maximize'}>
            <Square size={10} theme={isMaximized ? 'filled' : 'outline'} />
          </button>
          <button className="right-panel-close" type="button" onClick={onClose}>
            <Close size={11} />
          </button>
        </div>
      </div>

      <div className="right-panel-body">{renderPanelBody(panel)}</div>
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
    case 'artifact':
      return <Code size={11} />
    default:
      return <FileTextOne size={11} />
  }
}

function renderPanelBody(panel: RightPanelInstance) {
  switch (panel.kind) {
    case 'agent':
      return <AgentMonitorPanel sessionId={panel.sessionId ?? ''} />
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
        <pre className="right-panel-plaintext">{panel.markdown}</pre>
      ) : (
        <MarkdownView>{panel.markdown}</MarkdownView>
      )
    case 'browser':
      return <BrowserPanel url={panel.browserUrl} />
    case 'knowledge':
      return <KnowledgePanel results={panel.knowledgeResults ?? []} />
    case 'subagent':
      return <SubagentPanel sessionId={panel.sessionId ?? ''} toolUseId={panel.subagentToolUseId ?? ''} />
    case 'pdf':
      return panel.documentFileId ? (
        <PDFViewerPanel fileId={panel.documentFileId} filename={panel.title} fallbackMarkdown={panel.markdown} />
      ) : (
        <EmptyState title="PDF preview" description="This PDF couldn't be opened." />
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
    <div className="right-panel-list">
      {results.map((result, index) => {
        const filename = result.metadata?.filename
        const score = Number.isFinite(result.score) ? result.score.toFixed(3) : null
        return (
          <div key={result.key || String(index)} className="right-panel-list-item">
            <span className="right-panel-list-title">{filename || `Excerpt ${index + 1}`}</span>
            {score && <span className="right-panel-list-status">Relevance {score}</span>}
            <p className="right-panel-list-copy">{result.text}</p>
          </div>
        )
      })}
    </div>
  )
}

function BrowserPanel({ url }: { url?: string }) {
  return (
    <div className="right-panel-browser">
      <div className="right-panel-browser-icon">
        <Browser size={18} />
      </div>
      <h3>Browser trace</h3>
      {url ? (
        <>
          <a className="right-panel-browser-url" href={url} target="_blank" rel="noreferrer" title={url}>
            {url}
          </a>
          <p>Open the browser tool result in the chat to inspect snapshots, screenshots, network output, and extracted content.</p>
        </>
      ) : (
        <p>Browser tool output appears inline in the conversation as snapshots, screenshots, network output, and extracted content.</p>
      )}
    </div>
  )
}

// Agent Monitor

function AgentMonitorPanel({ sessionId }: { sessionId: string }) {
  const agentState = useSessionStore((s) => s.getAgentState(sessionId))
  const planArtifact = useSessionStore(
    (s) => s.sessions.find((session) => session.id === sessionId)?.planArtifact,
  )
  const sessionMessages = useSessionStore(
    (s) => s.sessions.find((session) => session.id === sessionId)?.messages ?? EMPTY_MESSAGES,
  )
  const streaming = useSessionStore((s) => s.getStreaming(sessionId))
  const plan = useMemo(
    () => derivePlanSnapshot(sessionMessages, streaming),
    [sessionMessages, streaming],
  )

  return (
    <div className="am-root">
      <TurnTokenStats state={agentState} />
      {agentState.activeTool && <ActiveToolSection state={agentState} />}
      <SubagentsSection sessionId={sessionId} />
      {planArtifact && <PlanArtifactSection sessionId={sessionId} planArtifact={planArtifact} />}
      <PlanSection plan={plan} />
      <ActivityTimelineSection state={agentState} />
    </div>
  )
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
    <div className="am-section">
      <div className="am-section-head">
        <span className="am-section-label">Sub-agents</span>
        <span className="am-plan-meta">
          {runningCount > 0 ? `${runningCount} running / ` : ''}
          {entries.length} total
          {failedCount > 0 ? ` / ${failedCount} failed` : ''}
        </span>
      </div>
      <div className="am-subagent-list">
        {entries.map(([toolUseId, sub]) => (
          <button
            key={toolUseId}
            type="button"
            className={`am-subagent-row am-subagent-row--${sub.status}`}
            onClick={() => openRightPanel({
              kind: 'subagent',
              title: sub.agentType,
              sessionId,
              subagentToolUseId: toolUseId,
            } as Parameters<typeof openRightPanel>[0])}
          >
            <span className="am-subagent-status-icon">
              {sub.status === 'running'
                ? <LoadingOne size={10} />
                : sub.status === 'completed'
                  ? <CheckOne size={10} />
                  : <Close size={10} />}
            </span>
            <span className="am-subagent-copy">
              <span className="am-subagent-type">{sub.agentType.replace(/_/g, ' ').replace(/-/g, ' ')}</span>
              {sub.task && <span className="am-subagent-task">{sub.task}</span>}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

function TurnTokenStats({ state }: { state: AgentState }) {
  return (
    <div className="am-section">
      <span className="am-section-label">Stats</span>
      <div className="am-stat-grid">
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
    <div className="am-section">
      <div className="am-section-head">
        <span className="am-section-label">Plan</span>
        {plan.items.length > 0 && (
          <span className="am-plan-meta">
            {plan.completedCount}/{plan.items.length} done / Tasks
          </span>
        )}
      </div>

      {plan.items.length === 0 ? (
        <p className="am-empty-hint">No live plan is being tracked yet.</p>
      ) : (
        <div className="am-plan-list">
          {plan.items.map((item) => (
            <div key={item.id} className={`am-plan-item am-plan-item--${item.status}`}>
              <div className="am-plan-marker">
                {item.status === 'completed' ? <CheckOne size={10} /> : <span className="am-plan-dot" />}
              </div>
              <div className="am-plan-copy">
                <span className="am-plan-title">{item.title}</span>
                {item.detail && item.status === 'in_progress' && (
                  <span className="am-plan-detail">{item.detail}</span>
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
    <div className="am-stat">
      <span className="am-stat-value">{value}</span>
      <span className="am-stat-label">{label}</span>
    </div>
  )
}

function ActiveToolSection({ state }: { state: AgentState }) {
  const tool = state.activeTool!
  return (
    <div className="am-section am-section--compact">
      <span className="am-section-label">Running</span>
      <div className="am-active-tool">
        <span className="am-active-spinner">
          <LoadingOne size={10} />
        </span>
        <div className="am-active-copy">
          <span className="am-active-name">{toolDisplayName(tool.toolName)}</span>
          {tool.message && <span className="am-active-msg">{tool.message}</span>}
        </div>
      </div>
    </div>
  )
}

function PlanArtifactSection({ sessionId, planArtifact }: { sessionId: string; planArtifact: string }) {
  const openRightPanel = useUIStore((s) => s.openRightPanel)
  return (
    <div className="am-section am-section--compact">
      <span className="am-section-label">Artifact</span>
      <button
        className="am-artifact-btn"
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
    <div className="am-section">
      <div className="am-section-head">
        <span className="am-section-label">Timeline</span>
        {entries.length > 0 && <span className="am-plan-meta">{entries.length} recent</span>}
      </div>
      {entries.length === 0 ? (
        <p className="am-empty-hint">Tool activity will appear here as the agent runs.</p>
      ) : (
        <div className="am-timeline">
          {entries.map((entry, index) => (
            <div key={`${entry.toolName}-${entry.startedAt}-${index}`} className={`am-timeline-row am-timeline-row--${entry.stage}`}>
              <span className="am-timeline-dot" />
              <span className="am-timeline-copy">
                <span className="am-timeline-title">
                  {toolDisplayName(entry.toolName)}
                  <span className="am-timeline-stage">{entry.stage.replace('_', ' ')}</span>
                </span>
                {entry.message && <span className="am-timeline-message">{entry.message}</span>}
              </span>
              <span className="am-timeline-time">{formatActivityDuration(entry)}</span>
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
    <div className="right-panel-empty">
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  )
}

const RIGHT_PANEL_CSS = `
.right-panel-columns {
  display: flex;
  flex-direction: row;
  flex-shrink: 0;
  height: 100%;
  min-width: 0;
}

.right-panel-stack {
  flex-shrink: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  min-width: 0;
  position: relative;
}

/* position:absolute's containing block is the nearest positioned
   ancestor's *padding* box, which includes the padding area itself - so
   inset:0 alone would render behind .shell-main's padding-left (i.e.
   behind the sidebar, which only visually reserves that space via
   padding, not real layout width). Pin "left" to the same width .shell-main
   already uses for its own padding so the maximized panel starts exactly
   where the sidebar ends, on both open and collapsed states. */
.right-panel-stack--maximized {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: var(--sidebar-width);
  z-index: 50;
}

.shell-main.collapsed .right-panel-stack--maximized {
  left: var(--sidebar-collapsed-width);
}

.shell-main.no-sidebar .right-panel-stack--maximized {
  left: 0;
}

.right-panel-resize-handle {
  position: absolute;
  left: -3px;
  top: 0;
  bottom: 0;
  width: 6px;
  cursor: ew-resize;
  z-index: 10;
}

.right-panel-resize-handle:hover,
.right-panel-resize-handle:active {
  background: color-mix(in srgb, var(--color-accent, #f97316) 40%, transparent);
}

.right-panel-slot {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.right-panel-split-handle {
  height: 6px;
  margin: -3px 0;
  cursor: ns-resize;
  z-index: 10;
  flex-shrink: 0;
}

.right-panel-split-handle:hover,
.right-panel-split-handle:active {
  background: color-mix(in srgb, var(--color-accent, #f97316) 40%, transparent);
}

.right-panel {
  flex: 1;
  min-height: 0;
  border-left: 1px solid var(--color-border-subtle);
  background: rgba(43, 41, 48, 0.96);
  backdrop-filter: blur(14px);
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.right-panel-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.right-panel-maximize-btn {
  width: 22px;
  height: 22px;
  border-radius: 5px;
  border: none;
  background: transparent;
  color: var(--color-text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.right-panel-maximize-btn:hover {
  background: var(--color-hover);
  color: var(--color-text);
}

.right-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 7px 8px 6px;
  border-bottom: 1px solid var(--color-border-subtle);
}

.right-panel-heading {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.right-panel-icon {
  width: 20px;
  height: 20px;
  border-radius: 5px;
  background: rgba(239, 124, 47, 0.12);
  color: var(--color-accent);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.right-panel-header-copy {
  min-width: 0;
}

.right-panel-title {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text);
}

.right-panel-meta {
  margin: 1px 0 0;
  font-size: 10px;
  color: var(--color-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.right-panel-close {
  width: 22px;
  height: 22px;
  border-radius: 5px;
  border: none;
  background: transparent;
  color: var(--color-text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.right-panel-close:hover {
  background: var(--color-hover);
  color: var(--color-text);
}

.right-panel-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0;
  scrollbar-width: thin;
}

/* Narrower and lower-contrast than the app-wide default (5px,
   rgba(128,128,128,0.3) on hover) - this panel's scrollbar sits right
   against the window edge, where the wider/greyer default reads as an
   overly prominent stripe rather than a scroll affordance. */
.right-panel-body::-webkit-scrollbar {
  width: 3px;
}

.right-panel-body::-webkit-scrollbar-track {
  background: transparent;
}

.right-panel-body::-webkit-scrollbar-thumb {
  background: transparent;
  border-radius: 3px;
}

.right-panel-body:hover::-webkit-scrollbar-thumb {
  background: rgba(128, 128, 128, 0.18);
}

.right-panel-empty {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px 13px;
}

.right-panel-empty h3 {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text);
}

.right-panel-empty p {
  margin: 0;
  font-size: 11px;
  line-height: 1.6;
  color: var(--color-text-secondary);
}

.right-panel-plaintext {
  margin: 0;
  padding: 14px 13px;
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--color-text);
  white-space: pre-wrap;
  word-break: break-word;
}

.right-panel-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px 13px;
}

.right-panel-list-item {
  border: 1px solid var(--color-border-subtle);
  border-radius: 11px;
  padding: 8px 10px;
  background: rgba(255, 255, 255, 0.02);
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.right-panel-list-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text);
}

.right-panel-list-status {
  font-size: 10px;
  color: var(--color-text-muted);
}

.right-panel-list-copy {
  margin: 0;
  font-size: 11px;
  line-height: 1.6;
  color: var(--color-text-secondary);
  white-space: pre-wrap;
}

.right-panel-browser {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
  padding: 18px;
  color: var(--color-text);
}

.right-panel-browser-icon {
  width: 38px;
  height: 38px;
  border: 1px solid var(--color-border-subtle);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-accent);
  background: rgba(255, 255, 255, 0.04);
}

.right-panel-browser h3 {
  margin: 0;
  font-size: 14px;
}

.right-panel-browser p {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-text-muted);
}

.right-panel-browser-url {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: monospace;
  font-size: 11px;
  color: var(--color-accent);
}

/* Agent Monitor */

.am-root {
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 0;
  height: 100%;
}

.am-section {
  padding: 11px 13px;
  border-bottom: 1px solid var(--color-border-subtle);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.am-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 9px;
}

.am-section-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}

.am-plan-meta {
  font-size: 10px;
  color: var(--color-text-muted);
}

/* Stats grid */
.am-stat-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}

.am-stat {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--color-border-subtle);
  border-radius: 8px;
  padding: 7px 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.am-stat-value {
  font-size: 14px;
  font-weight: 700;
  color: var(--color-text);
  font-variant-numeric: tabular-nums;
}

.am-stat-label {
  font-size: 10px;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.am-empty-hint {
  margin: 0;
  font-size: 10px;
  color: var(--color-text-muted);
  font-style: italic;
}

.am-plan-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.am-plan-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 7px 8px;
  border: 1px solid var(--color-border-subtle);
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.02);
}

.am-plan-item--completed {
  opacity: 0.72;
}

.am-plan-item--in_progress {
  border-color: rgba(239, 124, 47, 0.28);
  background: rgba(239, 124, 47, 0.05);
}

.am-plan-item--failed {
  border-color: rgba(var(--color-error-rgb), 0.28);
  background: rgba(var(--color-error-rgb), 0.05);
}

.am-plan-marker {
  width: 16px;
  height: 16px;
  margin-top: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-success);
  flex-shrink: 0;
}

.am-plan-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--color-text-muted);
}

.am-plan-item--in_progress .am-plan-dot {
  background: var(--color-accent);
  box-shadow: 0 0 0 5px rgba(239, 124, 47, 0.12);
}

.am-plan-item--failed .am-plan-dot {
  background: var(--color-error);
}

.am-plan-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.am-plan-title {
  font-size: 11px;
  line-height: 1.45;
  color: var(--color-text);
}

.am-plan-detail {
  font-size: 10px;
  color: var(--color-text-secondary);
  line-height: 1.45;
}

/* Sub-agents list */
.am-subagent-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.am-subagent-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 7px 8px;
  border: 1px solid var(--color-border-subtle);
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.02);
  cursor: pointer;
  text-align: left;
  font: inherit;
  color: inherit;
  width: 100%;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.am-subagent-row:hover {
  border-color: var(--color-border);
  background: rgba(255, 255, 255, 0.045);
}

.am-subagent-row--running {
  border-color: rgba(239, 124, 47, 0.28);
  background: rgba(239, 124, 47, 0.05);
}

.am-subagent-row--failed {
  border-color: rgba(var(--color-error-rgb), 0.28);
  background: rgba(var(--color-error-rgb), 0.05);
}

.am-subagent-row--completed {
  opacity: 0.72;
}

.am-subagent-status-icon {
  width: 16px;
  height: 16px;
  margin-top: 1px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.am-subagent-row--running .am-subagent-status-icon {
  color: var(--color-accent);
  animation: am-spin 1s linear infinite;
}

.am-subagent-row--completed .am-subagent-status-icon { color: var(--color-success); }
.am-subagent-row--failed .am-subagent-status-icon { color: var(--color-error); }

.am-subagent-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.am-subagent-type {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text);
  text-transform: capitalize;
}

.am-subagent-task {
  font-size: 10px;
  color: var(--color-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Active tool indicator */
.am-section--compact {
  padding: 8px 13px;
}

.am-active-tool {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  padding: 6px 8px;
  border-radius: 8px;
  border: 1px solid rgba(239, 124, 47, 0.25);
  background: rgba(239, 124, 47, 0.06);
}

.am-active-spinner {
  color: var(--color-accent);
  display: flex;
  align-items: center;
  flex-shrink: 0;
  margin-top: 1px;
  animation: am-spin 1s linear infinite;
}

@keyframes am-spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}

.am-active-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.am-active-name {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-accent);
}

.am-active-msg {
  font-size: 10px;
  color: var(--color-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.am-timeline {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.am-timeline-row {
  display: grid;
  grid-template-columns: 12px minmax(0, 1fr) auto;
  gap: 7px;
  align-items: start;
  padding: 6px 0;
}

.am-timeline-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  margin-top: 5px;
  background: var(--color-border);
}

.am-timeline-row--completed .am-timeline-dot { background: var(--color-success); }
.am-timeline-row--failed .am-timeline-dot { background: var(--color-error); }
.am-timeline-row--running .am-timeline-dot,
.am-timeline-row--pending .am-timeline-dot { background: var(--color-accent); }

.am-timeline-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.am-timeline-title {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text);
}

.am-timeline-stage {
  flex-shrink: 0;
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--color-text-muted);
}

.am-timeline-message {
  font-size: 10.5px;
  line-height: 1.4;
  color: var(--color-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.am-timeline-time {
  font-size: 10px;
  color: var(--color-text-muted);
  padding-top: 1px;
}

/* Plan artifact button */
.am-artifact-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 8px;
  border: 1px solid var(--color-border-subtle);
  background: rgba(255, 255, 255, 0.03);
  color: var(--color-text);
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  width: 100%;
  text-align: left;
  transition: background 0.15s, border-color 0.15s;
}

.am-artifact-btn:hover {
  background: var(--color-hover);
  border-color: rgba(239, 124, 47, 0.28);
  color: var(--color-accent);
}
`
