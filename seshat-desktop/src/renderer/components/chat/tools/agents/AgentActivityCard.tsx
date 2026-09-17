import { useEffect, useMemo, useState } from 'react'
import { cancelSubagent } from '../../lib/chatApi'
import type { ToolUseBlock } from '../../lib/chatTypes'
import { useAgentStore } from '@renderer/stores/agents'
import type { ToolPresentation } from '../catalog/toolPresentation'
import { getToolStatus, ToolGlyph, toolSnippet } from '../ToolDetails'
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
  const agent = useAgentStore((state) => sessionId ? state.sessions[sessionId]?.agents[tool.id] : undefined)
  const fallbackStatus = getToolStatus(tool)
  const status: AgentLifecycle = agent?.status ?? (fallbackStatus === 'failed' ? 'failed' : fallbackStatus === 'completed' ? 'completed' : 'running')
  const active = status === 'initializing' || status === 'running' || status === 'waiting'
  const [open, setOpen] = useState(active || Boolean(presentation.initiallyOpen))
  const [cancelling, setCancelling] = useState(false)
  const [cancelError, setCancelError] = useState('')
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

          {agent?.thinking && active && (
            <details className="mb-3 text-[11px] text-[var(--text-muted)]">
              <summary className="cursor-pointer font-semibold">Thinking</summary>
              <div className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap leading-5">{agent.thinking}</div>
            </details>
          )}

          {agent?.output ? (
            <div className="max-h-56 overflow-auto whitespace-pre-wrap break-words text-[12px] leading-5 text-[var(--text-secondary)]">{agent.output}</div>
          ) : (
            <div className="text-[11px] text-[var(--text-muted)]">{active ? 'Output will appear as the agent works.' : 'No output was captured.'}</div>
          )}

          {agent?.error && <div className="mt-3 text-[11px] font-semibold text-[var(--accent-danger)]">{agent.error}</div>}
          {cancelError && <div className="mt-3 text-[11px] font-semibold text-[var(--accent-danger)]">{cancelError}</div>}

          {(agent?.activityLog.length ?? 0) > 0 && (
            <div className="mt-3 border-t border-[var(--border-soft)] pt-2">
              {agent?.activityLog.slice(-4).reverse().map((entry, index) => (
                <div key={`${entry.toolName}-${entry.startedAt}-${index}`} className="flex min-h-6 items-center gap-2 text-[10px] text-[var(--text-muted)]">
                  <span className={`size-1.5 rounded-full ${entry.stage === 'failed' ? 'bg-[var(--accent-danger)]' : 'bg-[var(--accent-success)]'}`} />
                  <span className="min-w-0 flex-1 truncate">{readable(entry.toolName)}{entry.message ? `: ${entry.message}` : ''}</span>
                </div>
              ))}
            </div>
          )}

          {active && agent?.agentId && (
            <div className="mt-3 flex justify-end border-t border-[var(--border-soft)] pt-3">
              <button
                type="button"
                onClick={() => void handleCancel()}
                disabled={cancelling}
                className="rounded-md border border-[var(--border-soft)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] disabled:opacity-50"
              >
                {cancelling ? 'Stopping' : 'Stop agent'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
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
