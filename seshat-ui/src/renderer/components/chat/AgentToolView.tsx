import { memo, useCallback, useEffect, useState } from 'react'
import { Robot, CheckOne, CloseOne, LoadingOne } from '@icon-park/react'
import { useSessionStore } from '@/stores/session'
import { useUIStore } from '@/stores/ui'
import type { ToolUseBlock, ToolStatus } from '@/api/types'

function useElapsedMs(startedAt: number, active: boolean): number {
  const [ms, setMs] = useState(() => Date.now() - startedAt)
  useEffect(() => {
    if (!active) { setMs(Date.now() - startedAt); return }
    const id = setInterval(() => setMs(Date.now() - startedAt), 1000)
    return () => clearInterval(id)
  }, [startedAt, active])
  return ms
}

function fmtElapsed(ms: number): string {
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s`
  const m = Math.floor(ms / 60_000)
  const s = Math.floor((ms % 60_000) / 1000)
  return s > 0 ? `${m}m ${s}s` : `${m}m`
}

function fmtTokens(n: number): string {
  if (n === 0) return ''
  if (n < 1000) return `${n} tok`
  return `${(n / 1000).toFixed(1)}k tok`
}

// CSS injected once at the component level
const AGENT_CARDS_CSS = `
.agent-cards-row {
  display: flex;
  gap: 7px;
  width: 100%;
  overflow-x: auto;
  scrollbar-width: thin;
  padding-bottom: 2px;
}

.agent-cards-row::-webkit-scrollbar {
  height: 4px;
}

.agent-cards-row::-webkit-scrollbar-thumb {
  background: var(--color-border-subtle);
  border-radius: 3px;
}

.agent-card {
  flex: 1 1 0;
  min-width: 220px;
  max-width: 100%;
  border: 1px solid var(--color-border-subtle);
  border-radius: 8px;
  background: var(--color-surface);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.agent-card:hover {
  border-color: rgba(239, 124, 47, 0.3);
  background: var(--color-hover);
}

.agent-card--running {
  border-color: rgba(239, 124, 47, 0.28);
}

.agent-card--completed {
  border-color: rgba(var(--color-success-rgb), 0.2);
}

.agent-card--failed {
  border-color: rgba(var(--color-error-rgb), 0.24);
}

.agent-card-header {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 7px 9px 5px;
}

.agent-card-icon {
  width: 26px;
  height: 26px;
  border-radius: 6px;
  background: rgba(239, 124, 47, 0.12);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-accent);
  flex-shrink: 0;
}

.agent-card-icon--completed {
  background: rgba(var(--color-success-rgb), 0.12);
  color: var(--color-success);
}

.agent-card-icon--failed {
  background: rgba(var(--color-error-rgb), 0.12);
  color: var(--color-error);
}

.agent-card-meta {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.agent-card-type {
  font-size: 10px;
  font-weight: 750;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}

.agent-card-status {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  font-weight: 650;
}

.agent-card-status--running { color: var(--color-accent); }
.agent-card-status--completed { color: var(--color-success); }
.agent-card-status--failed { color: var(--color-error); }
.agent-card-status--pending { color: var(--color-text-muted); }

.agent-card-spin {
  animation: agent-spin 1s linear infinite;
}

@keyframes agent-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.agent-card-body {
  padding: 0 9px 7px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
}

.agent-card-task {
  font-size: 12px;
  line-height: 1.45;
  color: var(--color-text);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.agent-card-activity {
  font-size: 10px;
  color: var(--color-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding: 3px 6px;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 5px;
  border: 1px solid var(--color-border-subtle);
}

.agent-card-footer {
  padding: 6px 9px;
  border-top: 1px solid var(--color-border-subtle);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.agent-card-view-link {
  font-size: 10px;
  font-weight: 650;
  color: var(--color-accent);
  display: flex;
  align-items: center;
  gap: 3px;
}

.agent-card-turn-badge {
  font-size: 10px;
  color: var(--color-text-muted);
}
`

type AgentToolCardProps = {
  tool: ToolUseBlock
  sessionId: string
  status: ToolStatus
}

function AgentToolCard({ tool, sessionId, status }: AgentToolCardProps) {
  const subagent = useSessionStore((s) => s.getSubagent(sessionId, tool.id))
  const openRightPanel = useUIStore((s) => s.openRightPanel)

  const agentType = (tool.input.type as string | undefined)
    ?? subagent?.agentType
    ?? 'agent'
  const task = (tool.input.task as string | undefined)
    ?? (tool.input.prompt as string | undefined)
    ?? subagent?.task
    ?? ''

  // Once a sub-agent entry exists, it is the source of truth for lifecycle status —
  // including 'running'. Falling back to the outer tool-call's own `status` while a
  // sub-agent is still running would be wrong for async tools like spawn_agent: the
  // outer call returns (and its block flips to 'completed') within milliseconds of
  // starting the background agent, well before the agent itself is actually done.
  // The outer `status` is only a reasonable proxy before any sub-agent entry exists
  // at all (the brief window right as the tool call is first dispatched).
  const derivedStatus: ToolStatus = subagent
    ? subagent.status === 'failed'
      ? 'failed'
      : subagent.status === 'completed'
        ? 'completed'
        : 'running'
    : status === 'completed'
      ? 'completed'
      : status === 'failed'
        ? 'failed'
        : 'running'

  const activeTool = subagent?.activeTool
  const turnNumber = subagent?.turnNumber ?? 0
  const tokens = (subagent?.inputTokens ?? 0) + (subagent?.outputTokens ?? 0)
  const startedAt = subagent?.startedAt ?? Date.now()
  const elapsedMs = useElapsedMs(startedAt, derivedStatus === 'running')

  const handleClick = useCallback(() => {
    openRightPanel({
      kind: 'subagent',
      title: agentType,
      sessionId,
      // Pass toolUseId via sessionId slot — we'll use a custom payload
      subagentToolUseId: tool.id,
    } as Parameters<typeof openRightPanel>[0])
  }, [openRightPanel, agentType, sessionId, tool.id])

  return (
    <div
      className={`agent-card agent-card--${derivedStatus}`}
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleClick() }}
    >
      <div className="agent-card-header">
        <div className={`agent-card-icon agent-card-icon--${derivedStatus}`}>
          {derivedStatus === 'completed'
            ? <CheckOne size={13} />
            : derivedStatus === 'failed'
              ? <CloseOne size={13} />
              : <Robot size={13} />
          }
        </div>
        <div className="agent-card-meta">
          <span className="agent-card-type">
            {agentType.replace(/_/g, ' ').replace(/-/g, ' ')}
          </span>
          <span className={`agent-card-status agent-card-status--${derivedStatus}`}>
            {derivedStatus === 'running' && (
              <span className="agent-card-spin" style={{ display: 'flex' }}>
                <LoadingOne size={10} />
              </span>
            )}
            {derivedStatus === 'completed'
              ? 'Completed'
              : derivedStatus === 'failed'
                ? 'Failed'
                : 'Running…'
            }
          </span>
        </div>
      </div>

      <div className="agent-card-body">
        {task && <div className="agent-card-task">{task}</div>}
        {activeTool && (
          <div className="agent-card-activity">
            {activeTool.toolName}{activeTool.message ? ` — ${activeTool.message}` : ''}
          </div>
        )}
      </div>

      <div className="agent-card-footer">
        <span className="agent-card-view-link">View activity →</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {tokens > 0 && (
            <span className="agent-card-turn-badge">{fmtTokens(tokens)}</span>
          )}
          {(turnNumber > 0 || derivedStatus === 'running') && (
            <span className="agent-card-turn-badge">{fmtElapsed(elapsedMs)}</span>
          )}
        </div>
      </div>
    </div>
  )
}

type Props = {
  tools: ToolUseBlock[]
  sessionId: string
  getStatus: (tool: ToolUseBlock) => ToolStatus
}

export const AgentCardsRow = memo(function AgentCardsRow({ tools, sessionId, getStatus }: Props) {
  return (
    <>
      <style>{AGENT_CARDS_CSS}</style>
      <div className="agent-cards-row">
        {tools.map((tool) => (
          <AgentToolCard
            key={tool.id}
            tool={tool}
            sessionId={sessionId}
            status={getStatus(tool)}
          />
        ))}
      </div>
    </>
  )
})
