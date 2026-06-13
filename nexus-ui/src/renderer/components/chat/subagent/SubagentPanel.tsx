import { memo, useRef, useEffect, useState } from 'react'
import { useSessionStore } from '@/stores/session'
import { MarkdownView } from '@/components/MarkdownView'
import { ToolBlock } from '../ToolBlock'
import type { StreamingBlock, ToolActivity } from '@/stores/session'

const SUBAGENT_PANEL_CSS = `
.sap-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

/* ── Header ── */
.sap-header {
  padding: 14px 16px 0;
  border-bottom: 1px solid var(--color-border-subtle);
  display: flex;
  flex-direction: column;
  gap: 0;
  flex-shrink: 0;
}

.sap-header-top {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.sap-status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}

.sap-status--running .sap-status-dot { background: var(--color-accent); }
.sap-status--completed .sap-status-dot { background: #34d399; }
.sap-status--failed .sap-status-dot { background: #f87171; }

.sap-type-badge {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.07em;
  text-transform: uppercase;
}

.sap-status--running .sap-type-badge { color: var(--color-accent); }
.sap-status--completed .sap-type-badge { color: #34d399; }
.sap-status--failed .sap-type-badge { color: #f87171; }

.sap-task {
  font-size: 13px;
  line-height: 1.5;
  color: var(--color-text);
  margin-bottom: 8px;
}

.sap-stats {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 11px;
  color: var(--color-text-muted);
  padding-bottom: 10px;
  flex-wrap: wrap;
}

.sap-stat-sep {
  opacity: 0.3;
}

/* ── Tabs ── */
.sap-tabs {
  display: flex;
  gap: 0;
  border-top: 1px solid var(--color-border-subtle);
  margin-top: auto;
}

.sap-tab {
  flex: 1;
  padding: 8px 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-muted);
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
}

.sap-tab--active {
  color: var(--color-accent);
  border-bottom-color: var(--color-accent);
}

.sap-tab:hover:not(.sap-tab--active) {
  color: var(--color-text-secondary);
}

/* ── Body ── */
.sap-body {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  scrollbar-width: thin;
}

.sap-body::-webkit-scrollbar { width: 4px; }
.sap-body::-webkit-scrollbar-thumb {
  background: var(--color-border-subtle);
  border-radius: 4px;
}

/* ── Chat tab ── */
.sap-chat {
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: 1;
}

.sap-block-text {
  font-size: 14px;
  line-height: 1.6;
  color: var(--color-text);
}

.sap-block-thinking {
  border-left: 2px solid rgba(239, 124, 47, 0.22);
  padding-left: 12px;
  font-size: 13px;
  line-height: 1.55;
  color: var(--color-text-muted);
  font-style: italic;
}

/* ── Progress tab ── */
.sap-progress {
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
}

.sap-progress-empty {
  font-size: 13px;
  color: var(--color-text-muted);
  padding: 8px 0;
}

.sap-activity-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid var(--color-border-subtle);
}

.sap-activity-item--running {
  border-color: rgba(239, 124, 47, 0.25);
  background: rgba(239, 124, 47, 0.04);
}

.sap-activity-item--completed {
  opacity: 0.72;
}

.sap-activity-marker {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  margin-top: 4px;
  flex-shrink: 0;
}

.sap-activity-item--pending .sap-activity-marker { background: var(--color-text-muted); }
.sap-activity-item--running .sap-activity-marker { background: var(--color-accent); }
.sap-activity-item--completed .sap-activity-marker { background: #34d399; }
.sap-activity-item--failed .sap-activity-marker { background: #f87171; }

.sap-activity-copy {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.sap-activity-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text);
}

.sap-activity-msg {
  font-size: 11px;
  color: var(--color-text-muted);
  line-height: 1.4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sap-activity-dur {
  font-size: 11px;
  color: var(--color-text-muted);
  flex-shrink: 0;
  font-family: monospace;
}

/* ── Active tool indicator ── */
.sap-active-tool {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid rgba(239, 124, 47, 0.25);
  background: rgba(239, 124, 47, 0.06);
  font-size: 12px;
  color: var(--color-accent);
}

.sap-active-spinner {
  width: 12px;
  height: 12px;
  border: 2px solid rgba(239, 124, 47, 0.25);
  border-top-color: var(--color-accent);
  border-radius: 50%;
  animation: sap-spin 0.9s linear infinite;
  flex-shrink: 0;
}

@keyframes sap-spin {
  to { transform: rotate(360deg); }
}

/* ── Empty / loading ── */
.sap-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  gap: 8px;
  color: var(--color-text-muted);
  padding: 32px;
}

.sap-empty-label { font-size: 13px; }

.sap-spinner {
  width: 18px;
  height: 18px;
  border: 2px solid var(--color-border-subtle);
  border-top-color: var(--color-accent);
  border-radius: 50%;
  animation: sap-spin 0.9s linear infinite;
}
`

type Tab = 'activity' | 'chat'

type Props = {
  sessionId: string
  toolUseId: string
}

export const SubagentPanel = memo(function SubagentPanel({ sessionId, toolUseId }: Props) {
  const subagent = useSessionStore((s) => s.getSubagent(sessionId, toolUseId))
  const [tab, setTab] = useState<Tab>('activity')
  const bottomRef = useRef<HTMLDivElement>(null)

  const streaming = subagent?.streaming ?? []
  useEffect(() => {
    if (tab === 'chat') {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [streaming.length, tab])

  if (!subagent) {
    return (
      <div className="sap-root">
        <style>{SUBAGENT_PANEL_CSS}</style>
        <div className="sap-empty">
          <div className="sap-spinner" />
          <span className="sap-empty-label">Waiting for sub-agent…</span>
        </div>
      </div>
    )
  }

  const durationMs = subagent.endedAt
    ? subagent.endedAt - subagent.startedAt
    : Date.now() - subagent.startedAt

  return (
    <div className="sap-root">
      <style>{SUBAGENT_PANEL_CSS}</style>

      <div className={`sap-header sap-status--${subagent.status}`}>
        <div className="sap-header-top">
          <span className="sap-status-dot" />
          <span className="sap-type-badge">
            {subagent.agentType.replace(/_/g, ' ').replace(/-/g, ' ')}
          </span>
        </div>

        {subagent.task && <div className="sap-task">{subagent.task}</div>}

        <div className="sap-stats">
          <span>{subagent.status === 'running' ? `${formatMs(durationMs)} elapsed` : formatMs(durationMs)}</span>
          {subagent.turnNumber > 0 && (
            <>
              <span className="sap-stat-sep">·</span>
              <span>{subagent.turnNumber} turn{subagent.turnNumber > 1 ? 's' : ''}</span>
            </>
          )}
          {subagent.inputTokens > 0 && (
            <>
              <span className="sap-stat-sep">·</span>
              <span>{subagent.inputTokens.toLocaleString()} in / {subagent.outputTokens.toLocaleString()} out</span>
            </>
          )}
        </div>

        <div className="sap-tabs">
          <button
            className={`sap-tab${tab === 'activity' ? ' sap-tab--active' : ''}`}
            type="button"
            onClick={() => setTab('activity')}
          >
            Activity
          </button>
          <button
            className={`sap-tab${tab === 'chat' ? ' sap-tab--active' : ''}`}
            type="button"
            onClick={() => setTab('chat')}
          >
            Output
          </button>
        </div>
      </div>

      <div className="sap-body">
        {tab === 'activity' && (
          <ActivityView
            activityLog={subagent.activityLog}
            activeTool={subagent.activeTool}
            status={subagent.status}
          />
        )}
        {tab === 'chat' && (
          <div className="sap-chat">
            {streaming.length === 0 && subagent.status === 'running' && (
              <div className="sap-empty">
                <div className="sap-spinner" />
                <span className="sap-empty-label">Agent is thinking…</span>
              </div>
            )}
            {streaming.map((block, i) => (
              <StreamBlockView key={`${toolUseId}-block-${i}`} block={block} />
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>
    </div>
  )
})

function ActivityView({
  activityLog,
  activeTool,
  status,
}: {
  activityLog: ToolActivity[]
  activeTool: ToolActivity | null
  status: string
}) {
  const isEmpty = activityLog.length === 0 && !activeTool

  return (
    <div className="sap-progress">
      {isEmpty && status === 'running' && (
        <div className="sap-active-tool">
          <div className="sap-active-spinner" />
          <span>Starting…</span>
        </div>
      )}

      {isEmpty && status !== 'running' && (
        <p className="sap-progress-empty">No tool activity recorded.</p>
      )}

      {activityLog.map((entry, i) => (
        <ActivityItem key={i} entry={entry} />
      ))}

      {activeTool && (
        <div className="sap-active-tool">
          <div className="sap-active-spinner" />
          <span>
            <strong>{toolLabel(activeTool.toolName)}</strong>
            {activeTool.message ? ` — ${activeTool.message}` : ''}
          </span>
        </div>
      )}
    </div>
  )
}

function ActivityItem({ entry }: { entry: ToolActivity }) {
  const dur = entry.endedAt ? entry.endedAt - entry.startedAt : null
  return (
    <div className={`sap-activity-item sap-activity-item--${entry.stage}`}>
      <div className="sap-activity-marker" />
      <div className="sap-activity-copy">
        <span className="sap-activity-name">{toolLabel(entry.toolName)}</span>
        {entry.message && <span className="sap-activity-msg">{entry.message}</span>}
      </div>
      {dur !== null && (
        <span className="sap-activity-dur">{formatMs(dur)}</span>
      )}
    </div>
  )
}

function StreamBlockView({ block }: { block: StreamingBlock }) {
  if (block.type === 'text') {
    if (!block.text.trim()) return null
    return (
      <div className="sap-block-text">
        <MarkdownView>{block.text}</MarkdownView>
      </div>
    )
  }

  if (block.type === 'thinking') {
    if (!block.thinking.trim()) return null
    return (
      <div className="sap-block-thinking">{block.thinking}</div>
    )
  }

  if (block.type === 'tool_use') {
    return (
      <ToolBlock
        tool={{
          type: 'tool_use',
          id: block.id,
          name: block.name,
          input: block.input,
          metadata: block.metadata,
          _status: block._status,
          _result: block._result,
          _approval: block._approval,
          _prompt: block._prompt,
          _partialInput: block._partialInput,
          _message: block._message,
        }}
      />
    )
  }

  return null
}

function toolLabel(name: string): string {
  const labels: Record<string, string> = {
    bash: 'Bash', read: 'Read', write: 'Write', edit: 'Edit',
    glob: 'Glob', grep: 'Grep', web_search: 'Web Search', web_fetch: 'Web Fetch',
    agent: 'Agent', todo_write: 'Todo Write',
    task_create: 'Task Create', task_update: 'Task Update', task_list: 'Task List',
    file_read: 'Read File', file_write: 'Write File', file_edit: 'Edit File',
  }
  return labels[name] ?? name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  const m = Math.floor(ms / 60_000)
  const s = Math.floor((ms % 60_000) / 1000)
  return `${m}m${s > 0 ? ` ${s}s` : ''}`
}
