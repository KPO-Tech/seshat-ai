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
  gap: 10px;
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
  border-radius: 4px;
}

.agent-card {
  flex: 1 1 0;
  min-width: 240px;
  max-width: 100%;
  border: 1px solid var(--color-border-subtle);
  border-radius: 12px;
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
  border-color: rgba(52, 211, 153, 0.2);
}

.agent-card--failed {
  border-color: rgba(248, 113, 113, 0.24);
}

.agent-card-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px 8px;
}

.agent-card-icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: rgba(239, 124, 47, 0.12);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-accent);
  flex-shrink: 0;
}

.agent-card-icon--completed {
  background: rgba(52, 211, 153, 0.12);
  color: #34d399;
}

.agent-card-icon--failed {
  background: rgba(248, 113, 113, 0.12);
  color: #f87171;
}

.agent-card-meta {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.agent-card-type {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}

.agent-card-status {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  font-weight: 600;
}

.agent-card-status--running { color: var(--color-accent); }
.agent-card-status--completed { color: #34d399; }
.agent-card-status--failed { color: #f87171; }
.agent-card-status--pending { color: var(--color-text-muted); }

.agent-card-spin {
  animation: agent-spin 1s linear infinite;
}

@keyframes agent-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.agent-card-body {
  padding: 0 14px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
}

.agent-card-task {
  font-size: 13px;
  line-height: 1.5;
  color: var(--color-text);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.agent-card-activity {
  font-size: 11px;
  color: var(--color-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding: 4px 8px;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 6px;
  border: 1px solid var(--color-border-subtle);
}

.agent-card-footer {
  padding: 8px 14px;
  border-top: 1px solid var(--color-border-subtle);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.agent-card-view-link {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-accent);
  display: flex;
  align-items: center;
  gap: 4px;
}

.agent-card-turn-badge {
  font-size: 11px;
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

  const derivedStatus: ToolStatus = subagent?.status === 'failed'
    ? 'failed'
    : subagent?.status === 'completed'
      ? 'completed'
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
      width: 480,
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
            ? <CheckOne size={16} />
            : derivedStatus === 'failed'
              ? <CloseOne size={16} />
              : <Robot size={16} />
          }
        </div>
        <div className="agent-card-meta">
          <span className="agent-card-type">
            {agentType.replace(/_/g, ' ').replace(/-/g, ' ')}
          </span>
          <span className={`agent-card-status agent-card-status--${derivedStatus}`}>
            {derivedStatus === 'running' && (
              <span className="agent-card-spin" style={{ display: 'flex' }}>
                <LoadingOne size={12} />
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
