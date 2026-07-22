import { useMemo } from 'react'
import { Book, Browser, CheckOne, Close, DocDetail, FileTextOne, Peoples, Robot, LoadingOne } from '@icon-park/react'
import { MarkdownView } from '@/components/MarkdownView'
import { derivePlanSnapshot } from '@/lib/plan'
import { useUIStore } from '@/stores/ui'
import { useSessionStore } from '@/stores/session'
import { SubagentPanel } from '@/components/chat/subagent/SubagentPanel'
import { PlanEditorPanel } from '@/components/chat/plan/PlanEditorPanel'
import type { AgentState } from '@/stores/session'
import type { Message } from '@/api/types'

// Stable empty reference — must be module-level so the Zustand selector returns
// the same reference every render when no session is found. An inline []
// would return a new reference each call, triggering an infinite re-render loop.
const EMPTY_MESSAGES: Message[] = []

export function RightPanelHost() {
  const panel = useUIStore((s) => s.rightPanel)
  const closeRightPanel = useUIStore((s) => s.closeRightPanel)

  if (!panel.open || !panel.kind) return null

  return (
    <aside className="right-panel" style={{ width: `${panel.width}px` }}>
      <style>{RIGHT_PANEL_CSS}</style>

      <div className="right-panel-header">
        <div className="right-panel-heading">
          <span className="right-panel-icon">{renderPanelIcon(panel.kind)}</span>
          <div className="right-panel-header-copy">
            <h2 className="right-panel-title">{panel.title}</h2>
            {panel.sourceLabel && <p className="right-panel-meta">{panel.sourceLabel}</p>}
          </div>
        </div>
        <button className="right-panel-close" type="button" onClick={closeRightPanel}>
          <Close size={16} />
        </button>
      </div>

      <div className="right-panel-body">{renderPanelBody(panel)}</div>
    </aside>
  )
}

function renderPanelIcon(kind: NonNullable<ReturnType<typeof useUIStore.getState>['rightPanel']['kind']>) {
  switch (kind) {
    case 'browser':
      return <Browser size={16} />
    case 'subagents':
      return <Peoples size={16} />
    case 'subagent':
      return <Robot size={16} />
    case 'agent':
      return <Robot size={16} />
    case 'knowledge':
      return <Book size={16} />
    case 'plan':
      return <DocDetail size={16} />
    default:
      return <FileTextOne size={16} />
  }
}

function renderPanelBody(panel: ReturnType<typeof useUIStore.getState>['rightPanel']) {
  switch (panel.kind) {
    case 'agent':
      return <AgentMonitorPanel sessionId={panel.sessionId ?? ''} />
    case 'markdown':
      return panel.markdown ? (
        <MarkdownView>{panel.markdown}</MarkdownView>
      ) : (
        <EmptyState
          title="Markdown preview"
          description="Generated markdown content will render here when a note or document is opened."
        />
      )
    case 'pdf':
      return (
        <EmptyState
          title="PDF preview"
          description={
            panel.documentPath
              ? `Ready to display ${panel.documentPath} here.`
              : 'Generated PDFs will open here when the viewer is wired in.'
          }
        />
      )
    case 'subagents':
      return panel.agentNames?.length ? (
        <div className="right-panel-list">
          {panel.agentNames.map((agentName) => (
            <div key={agentName} className="right-panel-list-item">
              <span className="right-panel-list-title">{agentName}</span>
              <span className="right-panel-list-status">Running</span>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          title="Subagents"
          description="Background agents and their activity will appear here."
        />
      )
    case 'browser':
      return (
        <EmptyState
          title="Browser vision"
          description={
            panel.browserUrl
              ? `This panel is ready to host a browser view for ${panel.browserUrl}.`
              : 'Browser previews and vision sessions will open here later.'
          }
        />
      )
    case 'knowledge':
      return <KnowledgePanel results={panel.knowledgeResults ?? []} />
    case 'subagent':
      return <SubagentPanel sessionId={panel.sessionId ?? ''} toolUseId={panel.subagentToolUseId ?? ''} />
    case 'plan': {
      const planSessionId = panel.sessionId ?? ''
      const planPendingPermission = planSessionId
        ? useSessionStore.getState().getAgentState(planSessionId).pendingPermission
        : null
      const isExitPlanMode = planPendingPermission?.toolName === 'exit_plan_mode'
      const pendingPerm = isExitPlanMode
        ? { toolUseId: planPendingPermission.toolUseId }
        : null
      // No structured PlanDocument (agent called exit_plan_mode without
      // submit_plan) — fall back to the raw plan text so PlanEditorPanel can
      // still render the same annotate/comment review experience.
      const rawContent = !panel.planId && isExitPlanMode
        ? (planPendingPermission.toolInput.plan as string | undefined) ?? ''
        : undefined
      return (
        <PlanEditorPanel
          planId={panel.planId}
          sessionId={planSessionId}
          pendingPermission={pendingPerm}
          rawContent={rawContent}
        />
      )
    }
    default:
      return (
        <EmptyState
          title={panel.title || 'Right panel'}
          description={panel.note || 'Supplementary content will appear here.'}
        />
      )
  }
}

function KnowledgePanel({ results }: { results: NonNullable<ReturnType<typeof useUIStore.getState>['rightPanel']['knowledgeResults']> }) {
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

// ── Agent Monitor ─────────────────────────────────────────────────────────────

function AgentMonitorPanel({ sessionId }: { sessionId: string }) {
  const agentState = useSessionStore((s) => s.getAgentState(sessionId))
  const isStreaming = useSessionStore((s) => s.isSessionStreaming(sessionId))
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
      <ModeBadge state={agentState} isStreaming={isStreaming} />
      <TurnTokenStats state={agentState} />
      {agentState.activeTool && <ActiveToolSection state={agentState} />}
      {planArtifact && <PlanArtifactSection sessionId={sessionId} planArtifact={planArtifact} />}
      <PlanSection plan={plan} />
    </div>
  )
}

const MODE_META: Record<AgentState['executionMode'], { label: string; color: string; dot: string }> = {
  execute:         { label: 'Execute',         color: 'var(--color-accent)',  dot: '#ef7c2f' },
  plan:            { label: 'Plan',             color: '#60a5fa',              dot: '#3b82f6' },
  pair_programming:{ label: 'Pair Programming', color: '#a78bfa',              dot: '#7c3aed' },
}

function ModeBadge({ state, isStreaming }: { state: AgentState; isStreaming: boolean }) {
  const meta = MODE_META[state.executionMode] ?? MODE_META.execute
  return (
    <div className="am-section am-mode-section">
      <span className="am-section-label">Mode</span>
      <div className="am-mode-badge" style={{ '--mode-color': meta.color } as React.CSSProperties}>
        <span
          className={`am-mode-dot${isStreaming && state.isThinking ? ' am-mode-dot--pulse' : ''}`}
          style={{ background: meta.dot }}
        />
        <span className="am-mode-name">{meta.label}</span>
        {isStreaming && state.isThinking && (
          <span className="am-mode-thinking">thinking…</span>
        )}
      </div>
    </div>
  )
}

function TurnTokenStats({ state }: { state: AgentState }) {
  return (
    <div className="am-section">
      <span className="am-section-label">Stats</span>
      <div className="am-stat-grid">
        <Stat label="Turn" value={state.turnNumber > 0 ? `#${state.turnNumber}` : '—'} />
        <Stat label="Input tokens"  value={state.inputTokens  > 0 ? fmt(state.inputTokens)  : '—'} />
        <Stat label="Output tokens" value={state.outputTokens > 0 ? fmt(state.outputTokens) : '—'} />
        <Stat label="Total" value={
          state.inputTokens + state.outputTokens > 0
            ? fmt(state.inputTokens + state.outputTokens)
            : '—'
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
            {plan.completedCount}/{plan.items.length} done
            {plan.source === 'todo_write' ? ' · Todo' : ' · Tasks'}
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
                {item.status === 'completed' ? <CheckOne size={12} /> : <span className="am-plan-dot" />}
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
          <LoadingOne size={13} />
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
          width: 480,
          markdown: planArtifact,
        })}
      >
        <FileTextOne size={13} />
        <span>Implementation Plan</span>
      </button>
    </div>
  )
}

function toolDisplayName(name: string): string {
  const map: Record<string, string> = {
    bash: 'Bash', read: 'Read', write: 'Write', edit: 'Edit',
    glob: 'Glob', grep: 'Grep', web_search: 'Web Search', web_fetch: 'Web Fetch',
    agent: 'Agent', todo_write: 'Todo Write',
    task_create: 'Task Create', task_update: 'Task Update',
    file_read: 'Read File', file_write: 'Write File', file_edit: 'Edit File',
  }
  return map[name] ?? name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function fmt(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
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
.right-panel {
  flex-shrink: 0;
  height: 100%;
  border-left: 1px solid var(--color-border-subtle);
  background: rgba(43, 41, 48, 0.96);
  backdrop-filter: blur(14px);
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.right-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 18px 18px 14px;
  border-bottom: 1px solid var(--color-border-subtle);
}

.right-panel-heading {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  min-width: 0;
}

.right-panel-icon {
  width: 30px;
  height: 30px;
  border-radius: 10px;
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
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text);
}

.right-panel-meta {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--color-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.right-panel-close {
  width: 32px;
  height: 32px;
  border-radius: 8px;
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
}

.right-panel-empty {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 20px 18px;
}

.right-panel-empty h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
}

.right-panel-empty p {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--color-text-secondary);
}

.right-panel-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 20px 18px;
}

.right-panel-list-item {
  border: 1px solid var(--color-border-subtle);
  border-radius: 14px;
  padding: 12px 14px;
  background: rgba(255, 255, 255, 0.02);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.right-panel-list-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text);
}

.right-panel-list-status {
  font-size: 12px;
  color: var(--color-text-muted);
}

.right-panel-list-copy {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--color-text-secondary);
  white-space: pre-wrap;
}

/* ── Agent Monitor ─────────────────────────────────────────────────────────── */

.am-root {
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 0;
  height: 100%;
}

.am-section {
  padding: 16px 18px;
  border-bottom: 1px solid var(--color-border-subtle);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.am-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.am-section-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}

.am-plan-meta {
  font-size: 11px;
  color: var(--color-text-muted);
}

/* Mode badge */
.am-mode-section {}

.am-mode-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 7px 12px;
  border-radius: 20px;
  border: 1px solid color-mix(in srgb, var(--mode-color) 30%, transparent);
  background: color-mix(in srgb, var(--mode-color) 10%, transparent);
}

.am-mode-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}

.am-mode-dot--pulse {
  animation: am-pulse 1.4s ease-in-out infinite;
}

@keyframes am-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%       { opacity: 0.4; transform: scale(0.75); }
}

.am-mode-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--mode-color);
}

.am-mode-thinking {
  font-size: 11px;
  color: var(--color-text-muted);
  font-style: italic;
}

/* Stats grid */
.am-stat-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.am-stat {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--color-border-subtle);
  border-radius: 10px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.am-stat-value {
  font-size: 16px;
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
  font-size: 12px;
  color: var(--color-text-muted);
  font-style: italic;
}

.am-plan-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.am-plan-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--color-border-subtle);
  border-radius: 12px;
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
  border-color: rgba(239, 68, 68, 0.28);
  background: rgba(239, 68, 68, 0.05);
}

.am-plan-marker {
  width: 16px;
  height: 16px;
  margin-top: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #34d399;
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
  background: #ef4444;
}

.am-plan-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.am-plan-title {
  font-size: 13px;
  line-height: 1.45;
  color: var(--color-text);
}

.am-plan-detail {
  font-size: 12px;
  color: var(--color-text-secondary);
  line-height: 1.45;
}

/* Active tool indicator */
.am-section--compact {
  padding: 12px 18px;
}

.am-active-tool {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  padding: 9px 12px;
  border-radius: 10px;
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
  font-size: 13px;
  font-weight: 600;
  color: var(--color-accent);
}

.am-active-msg {
  font-size: 11px;
  color: var(--color-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Plan artifact button */
.am-artifact-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 12px;
  border-radius: 10px;
  border: 1px solid var(--color-border-subtle);
  background: rgba(255, 255, 255, 0.03);
  color: var(--color-text);
  font-size: 13px;
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
