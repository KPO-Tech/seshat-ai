import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { cancelSubagent } from '../../lib/chatApi'
import type { ToolUseBlock } from '../../lib/chatTypes'
import { useAgentStore } from '@renderer/stores/agents'
import { useChatStore } from '@renderer/stores/chat'
import type { ToolPresentation } from '../catalog/toolPresentation'
import { getToolStatus, ToolGlyph, toolSnippet } from '../ToolDetails'
import { MessageContentBlocks } from '../../messages/MessageContentBlocks'
import type { AgentLifecycle } from './agentState'

export function AgentActivityCard({
  sessionId,
  tool,
  presentation
}: {
  sessionId?: string
  tool: ToolUseBlock
  presentation: ToolPresentation
}) {
  const ingestTool = useAgentStore((state) => state.ingestTool)
  const markStopped = useAgentStore((state) => state.markStopped)
  const openSessionById = useChatStore((state) => state.openSessionById)
  const agent = useAgentStore((state) => sessionId ? state.sessions[sessionId]?.agents[tool.id] : undefined)
  const fallbackStatus = getToolStatus(tool)
  const status: AgentLifecycle = agent?.status ?? (fallbackStatus === 'failed' ? 'failed' : fallbackStatus === 'completed' ? 'completed' : 'running')
  const active = status === 'initializing' || status === 'running' || status === 'waiting'
  const [open, setOpen] = useState(active || Boolean(presentation.initiallyOpen))
  const [cancelling, setCancelling] = useState(false)
  const [cancelError, setCancelError] = useState('')
  const [tab, setTab] = useState<'result' | 'activity'>('result')
  const elapsed = useElapsed(agent?.startedAt, agent?.endedAt, active)
  const task = agent?.task || toolSnippet(tool) || ''
  const displayName = agent?.nickname || readable(agent?.role || agent?.agentType || presentation.label)
  const tokens = (agent?.inputTokens ?? 0) + (agent?.outputTokens ?? 0)

  useEffect(() => {
    if (sessionId) ingestTool(sessionId, tool)
  }, [ingestTool, sessionId, tool])

  useEffect(() => {
    setOpen(active)
  }, [active])

  async function handleCancel() {
    if (!sessionId || !agent?.agentId || cancelling) return
    setCancelling(true)
    setCancelError('')
    try {
      await cancelSubagent(agent.agentId, sessionId)
      markStopped(sessionId, tool.id)
    } catch (error) {
      setCancelError(error instanceof Error ? error.message : 'Unable to stop agent.')
    } finally {
      setCancelling(false)
    }
  }

  return (
    <div className="my-2 overflow-hidden rounded-lg border border-[var(--border-soft)] bg-[var(--surface-panel)]">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-12 w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-[var(--surface-muted)]"
      >
        <span className="relative flex size-8 shrink-0 items-center justify-center rounded-md bg-[var(--accent-primary)]/10 text-[var(--accent-primary)]">
          <ToolGlyph name={tool.name} />
          <StatusDot status={status} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-[12px] font-semibold text-[var(--text-primary)]">{displayName}</span>
            <span className={statusTextClass(status)}>{statusLabel(status)}</span>
          </span>
          {task && <span className="block truncate text-[11px] text-[var(--text-muted)]">{task}</span>}
        </span>
        <span className="flex shrink-0 items-center gap-2 text-[10px] text-[var(--text-muted)]">
          {agent && agent.turnNumber > 0 && <span>{agent.turnNumber} turn{agent.turnNumber === 1 ? '' : 's'}</span>}
          {tokens > 0 && <span>{formatTokens(tokens)}</span>}
          {agent && <span>{formatElapsed(elapsed)}</span>}
        </span>
        <ChevronIcon open={open} />
      </button>

      {open && (
        <div className="border-t border-[var(--border-soft)] px-3 py-3">
          {agent?.activeTool && (
            <div className="mb-3 flex items-center gap-2 rounded-md bg-[var(--surface-muted)] px-2.5 py-2 text-[11px] text-[var(--text-secondary)]">
              <span className="size-3.5 shrink-0 animate-spin rounded-full border-2 border-[var(--border-strong)] border-t-[var(--accent-primary)]" />
              <span className="min-w-0 flex-1 truncate">
                <strong className="font-semibold text-[var(--text-primary)]">{readable(agent.activeTool.toolName)}</strong>
                {agent.activeTool.message ? `: ${agent.activeTool.message}` : ''}
              </span>
            </div>
          )}

          <div className="mb-3 flex items-center gap-1 border-b border-[var(--border-soft)]">
            <TabButton active={tab === 'result'} onClick={() => setTab('result')}>Result</TabButton>
            <TabButton active={tab === 'activity'} onClick={() => setTab('activity')}>
              Activity{agent && agent.activityLog.length > 0 ? ` (${agent.activityLog.length})` : ''}
            </TabButton>
          </div>

          {tab === 'result' ? (
            <>
              {(agent?.blocks.length ?? 0) > 0 ? (
                <div className="max-h-72 overflow-auto text-[12px] leading-5 text-[var(--text-secondary)]">
                  <MessageContentBlocks sessionId={agent?.sessionId ?? sessionId} blocks={agent!.blocks} live={active} />
                </div>
              ) : agent?.output ? (
                <div className="max-h-56 overflow-auto whitespace-pre-wrap break-words text-[12px] leading-5 text-[var(--text-secondary)]">{agent.output}</div>
              ) : (
                <div className="text-[11px] text-[var(--text-muted)]">{active ? 'Output will appear as the agent works.' : 'No output was captured.'}</div>
              )}
              {agent?.error && <div className="mt-3 text-[11px] font-semibold text-[var(--accent-danger)]">{agent.error}</div>}
            </>
          ) : (
            <div className="max-h-56 overflow-auto">
              {(agent?.activityLog.length ?? 0) === 0 ? (
                <div className="text-[11px] text-[var(--text-muted)]">No tool activity recorded yet.</div>
              ) : (
                agent?.activityLog.slice().reverse().map((entry, index) => (
                  <div key={`${entry.toolName}-${entry.startedAt}-${index}`} className="flex min-h-7 items-start gap-2 border-b border-[var(--border-soft)]/60 py-1.5 text-[11px] text-[var(--text-muted)] last:border-0">
                    <span className={`mt-1 size-1.5 shrink-0 rounded-full ${entry.stage === 'failed' ? 'bg-[var(--accent-danger)]' : 'bg-[var(--accent-success)]'}`} />
                    <span className="min-w-0 flex-1">
                      <span className="text-[var(--text-secondary)]">{readable(entry.toolName)}</span>
                      {entry.message ? `: ${entry.message}` : ''}
                    </span>
                    {entry.endedAt && <span className="shrink-0 text-[10px]">{formatElapsed(entry.endedAt - entry.startedAt)}</span>}
                  </div>
                ))
              )}
            </div>
          )}

          {cancelError && <div className="mt-3 text-[11px] font-semibold text-[var(--accent-danger)]">{cancelError}</div>}

          {(agent?.sessionId || (active && agent?.agentId)) && (
            <div className="mt-3 flex justify-end gap-2 border-t border-[var(--border-soft)] pt-3">
              {agent?.sessionId && (
                <button
                  type="button"
                  onClick={() => void openSessionById(agent.sessionId!)}
                  className="rounded-md border border-[var(--border-soft)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]"
                >
                  Open session
                </button>
              )}
              {active && agent?.agentId && (
                <button
                  type="button"
                  onClick={() => void handleCancel()}
                  disabled={cancelling}
                  className="rounded-md border border-[var(--border-soft)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] disabled:opacity-50"
                >
                  {cancelling ? 'Stopping' : 'Stop agent'}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`-mb-px border-b-2 px-2 pb-1.5 text-[11px] font-semibold transition-colors ${
        active ? 'border-[var(--accent-primary)] text-[var(--text-primary)]' : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
      }`}
    >
      {children}
    </button>
  )
}

function StatusDot({ status }: { status: AgentLifecycle }) {
  const color = status === 'completed' ? 'bg-[var(--accent-success)]'
    : status === 'failed' ? 'bg-[var(--accent-danger)]'
      : status === 'stopped' ? 'bg-[var(--text-muted)]'
        : 'bg-[var(--accent-primary)]'
  return <span className={`absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-[var(--surface-panel)] ${color} ${status === 'running' || status === 'initializing' ? 'animate-pulse' : ''}`} />
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg className={`shrink-0 text-[var(--text-muted)] transition-transform ${open ? 'rotate-180' : ''}`} width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m4 5.5 3 3 3-3" />
    </svg>
  )
}

function useElapsed(startedAt?: number, endedAt?: number, active?: boolean) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!active) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [active])
  return useMemo(() => startedAt ? Math.max(0, (endedAt ?? now) - startedAt) : 0, [endedAt, now, startedAt])
}

function statusLabel(status: AgentLifecycle) {
  if (status === 'initializing') return 'Starting'
  if (status === 'waiting') return 'Waiting'
  if (status === 'completed') return 'Completed'
  if (status === 'failed') return 'Failed'
  if (status === 'stopped') return 'Stopped'
  return 'Working'
}

function statusTextClass(status: AgentLifecycle) {
  const base = 'text-[10px] font-semibold'
  if (status === 'completed') return `${base} text-[var(--accent-success)]`
  if (status === 'failed') return `${base} text-[var(--accent-danger)]`
  if (status === 'stopped') return `${base} text-[var(--text-muted)]`
  return `${base} text-[var(--accent-primary)]`
}

function formatElapsed(ms: number) {
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s`
  const minutes = Math.floor(ms / 60_000)
  const seconds = Math.floor((ms % 60_000) / 1000)
  return seconds ? `${minutes}m ${seconds}s` : `${minutes}m`
}

function formatTokens(value: number) {
  return value < 1000 ? `${value} tok` : `${(value / 1000).toFixed(1)}k tok`
}

function readable(value: string) {
  return value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase())
}
