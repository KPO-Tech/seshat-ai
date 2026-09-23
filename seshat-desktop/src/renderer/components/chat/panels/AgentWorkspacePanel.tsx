import { useEffect, useMemo, useState } from 'react'
import { CheckOne, Close, FileTextOne, LoadingOne, Play, PreviewOpen, Tool } from '@icon-park/react'
import { BrowserPanel } from './BrowserPanel'
import { derivePlanSnapshot } from '@renderer/lib/plan'
import { useUIStore } from '@renderer/stores/ui'
import { useSessionStore } from '@renderer/stores/session'
import { renderToolBody, toolLabel, toolSnippet } from '@renderer/components/chat/tools/toolDisplay'
import { toolStatus } from '@renderer/components/chat/tools/quietGroupPhrase'
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

export function AgentWorkspacePanel({ sessionId }: { sessionId: string }) {
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
