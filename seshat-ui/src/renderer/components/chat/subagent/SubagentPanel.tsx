import { memo, useRef, useEffect, useState } from 'react'
import { CloseOne } from '@icon-park/react'
import { useSessionStore } from '@/stores/session'
import { MarkdownView } from '@/components/MarkdownView'
import { api } from '@/api/client'
import { ToolBlock } from '../ToolBlock'
import { AgentCardsRow } from '../AgentToolView'
import { QuietToolGroup } from '../QuietToolGroup'
import { groupBlocks } from '../MessageItem'
import type { ToolStatus } from '@/api/types'
import type { ToolActivity } from '@/stores/session'

const SUBAGENT_PANEL_CSS = `
.sap-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

/* ── Header ── */
.sap-header {
  padding: 10px 11px 0;
  border-bottom: 1px solid var(--color-border-subtle);
  display: flex;
  flex-direction: column;
  gap: 0;
  flex-shrink: 0;
}

.sap-header-top {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}

.sap-status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}

.sap-status--running .sap-status-dot { background: var(--color-accent); animation: sap-pulse 1.4s ease-in-out infinite; }
.sap-status--completed .sap-status-dot { background: var(--color-success); }
.sap-status--failed .sap-status-dot { background: var(--color-error); }

@keyframes sap-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
}

.sap-type-badge {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.07em;
  text-transform: uppercase;
}

.sap-status--running .sap-type-badge { color: var(--color-accent); }
.sap-status--completed .sap-type-badge { color: var(--color-success); }
.sap-status--failed .sap-type-badge { color: var(--color-error); }

.sap-cancel-btn {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--color-text-secondary);
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: 20px;
  padding: 3px 8px 3px 7px;
  cursor: pointer;
  transition: color 0.15s ease, border-color 0.15s ease, background 0.15s ease;
}

.sap-cancel-btn:hover:not(:disabled) {
  color: var(--color-error);
  border-color: var(--color-error);
  background: rgba(var(--color-error-rgb), 0.08);
}

.sap-cancel-btn:disabled {
  opacity: 0.6;
  cursor: default;
}

.sap-cancel-error {
  font-size: 10.5px;
  color: var(--color-error);
  margin-bottom: 6px;
}

.sap-task {
  font-size: 11px;
  line-height: 1.5;
  color: var(--color-text);
  margin-bottom: 8px;
}

.sap-stats {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 10px;
  color: var(--color-text-muted);
  padding-bottom: 7px;
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
  padding: 6px 0;
  font-size: 10px;
  font-weight: 600;
  color: var(--color-text-muted);
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

.sap-tab--active {
  color: var(--color-accent);
  border-bottom-color: var(--color-accent);
}

.sap-tab:hover:not(.sap-tab--active):not(:disabled) {
  color: var(--color-text-secondary);
}

.sap-tab:disabled {
  cursor: not-allowed;
  opacity: 0.38;
}

.sap-tab-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-success);
  animation: sap-pulse 1.2s ease-in-out infinite;
  flex-shrink: 0;
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
  border-radius: 3px;
}

/* ── Activity tab (full stream) ── */
.sap-activity {
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
}

.sap-block-text {
  font-size: 12px;
  line-height: 1.6;
  color: var(--color-text);
}

.sap-block-thinking {
  border-left: 2px solid rgba(239, 124, 47, 0.22);
  padding-left: 8px;
  font-size: 11px;
  line-height: 1.55;
  color: var(--color-text-muted);
  font-style: italic;
}

/* ── Active tool indicator ── */
.sap-active-tool {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 7px;
  border-radius: 6px;
  border: 1px solid rgba(239, 124, 47, 0.25);
  background: rgba(239, 124, 47, 0.06);
  font-size: 10px;
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

.sap-tool-log {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.sap-tool-log-title {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--color-text-muted);
}

.sap-tool-log-row {
  display: grid;
  grid-template-columns: 8px minmax(0, 1fr) auto;
  gap: 7px;
  align-items: start;
  padding: 4px 0;
}

.sap-tool-log-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  margin-top: 5px;
  background: var(--color-border);
}

.sap-tool-log-row--completed .sap-tool-log-dot { background: var(--color-success); }
.sap-tool-log-row--failed .sap-tool-log-dot { background: var(--color-error); }
.sap-tool-log-row--running .sap-tool-log-dot,
.sap-tool-log-row--pending .sap-tool-log-dot { background: var(--color-accent); }

.sap-tool-log-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.sap-tool-log-name {
  font-size: 10.5px;
  font-weight: 600;
  color: var(--color-text);
}

.sap-tool-log-message {
  font-size: 10px;
  color: var(--color-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sap-tool-log-time {
  font-size: 10px;
  color: var(--color-text-muted);
}

@keyframes sap-spin {
  to { transform: rotate(360deg); }
}

/* ── Output tab ── */
.sap-output {
  padding: 10px;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sap-output-content {
  font-size: 12px;
  line-height: 1.6;
  color: var(--color-text);
}

.sap-output-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  gap: 6px;
  color: var(--color-text-muted);
  padding: 22px;
  text-align: center;
  font-size: 11px;
}

.sap-output-state {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.sap-output-status {
  font-size: 9px;
  font-weight: 700;
  line-height: 1;
}

.sap-output-status--failed { color: var(--color-error); }

.sap-final-output {
  border-top: 1px solid var(--color-border-subtle);
  padding-top: 9px;
  margin-top: 2px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.sap-final-output-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--color-text-muted);
}

.sap-final-output-content {
  font-size: 12px;
  line-height: 1.6;
  color: var(--color-text);
}

.sap-final-output-empty {
  font-size: 11px;
  color: var(--color-text-muted);
}

/* ── Empty / loading ── */
.sap-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  gap: 6px;
  color: var(--color-text-muted);
  padding: 22px;
}

.sap-empty-label { font-size: 11px; }

.sap-spinner {
  width: 18px;
  height: 18px;
  border: 2px solid var(--color-border-subtle);
  border-top-color: var(--color-accent);
  border-radius: 50%;
  animation: sap-spin 0.9s linear infinite;
}
`

type Tab = 'activity' | 'output'

type Props = {
  sessionId: string
  toolUseId: string
}

export const SubagentPanel = memo(function SubagentPanel({ sessionId, toolUseId }: Props) {
  const subagent = useSessionStore((s) => s.getSubagent(sessionId, toolUseId))
  const [tab, setTab] = useState<Tab>('activity')
  const bottomRef = useRef<HTMLDivElement>(null)
  const prevResultRef = useRef<string | undefined>(undefined)
  const [outputReady, setOutputReady] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)

  const streaming = subagent?.streaming ?? []
  const result = subagent?.result
  const hasResult = Boolean(result?.trim())
  const hasTerminalOutputState = hasResult || (subagent != null && subagent.status !== 'running')

  // No optimistic local status update here — CloseAgent on the backend cancels
  // the agent's context, which makes its own completion notifier fire the
  // usual tool.progress(failed) event over SSE (see spawn_agent.go), so the
  // status transition arrives the same way a natural failure would. This
  // button just triggers that and surfaces a request-level error if the POST
  // itself fails (e.g. already finished, or a network drop).
  const handleCancel = async () => {
    if (!subagent?.agentId || cancelling) return
    setCancelling(true)
    setCancelError(null)
    try {
      await api.post(`/subagents/${subagent.agentId}/cancel`, { session_id: sessionId })
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : 'Failed to cancel agent')
    } finally {
      setCancelling(false)
    }
  }

  // Auto-scroll activity tab as new blocks arrive
  useEffect(() => {
    if (tab === 'activity') {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [streaming.length, tab])

  // When result first appears, light up the Output tab dot
  useEffect(() => {
    if (hasResult && result && prevResultRef.current === undefined) {
      setOutputReady(true)
      const id = setTimeout(() => setOutputReady(false), 4000)
      prevResultRef.current = result
      return () => clearTimeout(id)
    }
  }, [hasResult, result])

  const handleTabClick = (t: Tab) => {
    setTab(t)
    if (t === 'output') setOutputReady(false)
  }

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
          {subagent.status === 'running' && subagent.agentId && (
            <button
              type="button"
              className="sap-cancel-btn"
              disabled={cancelling}
              onClick={handleCancel}
            >
              <CloseOne size={12} />
              {cancelling ? 'Cancelling…' : 'Cancel'}
            </button>
          )}
        </div>

        {cancelError && <div className="sap-cancel-error">{cancelError}</div>}

        {subagent.task && <div className="sap-task">{subagent.task}</div>}

        <div className="sap-stats">
          <span>
            {subagent.status === 'running' ? `${formatMs(durationMs)} elapsed` : formatMs(durationMs)}
          </span>
          {subagent.turnNumber > 0 && (
            <>
              <span className="sap-stat-sep">·</span>
              <span>{subagent.turnNumber} turn{subagent.turnNumber > 1 ? 's' : ''}</span>
            </>
          )}
          {subagent.inputTokens > 0 && (
            <>
              <span className="sap-stat-sep">·</span>
              <span>
                {subagent.inputTokens.toLocaleString()} in / {subagent.outputTokens.toLocaleString()} out
              </span>
            </>
          )}
        </div>

        <div className="sap-tabs">
          <button
            className={`sap-tab${tab === 'activity' ? ' sap-tab--active' : ''}`}
            type="button"
            onClick={() => handleTabClick('activity')}
          >
            Activity
          </button>
          <button
            className={`sap-tab${tab === 'output' ? ' sap-tab--active' : ''}`}
            type="button"
            disabled={!hasTerminalOutputState}
            onClick={() => hasTerminalOutputState && handleTabClick('output')}
          >
            {outputReady && tab !== 'output' && <span className="sap-tab-dot" />}
            Output
          </button>
        </div>
      </div>

      <div className="sap-body">
        {tab === 'activity' && (
          <div className="sap-activity">
            {streaming.length === 0 && subagent.status === 'running' && (
              <div className="sap-empty">
                <div className="sap-spinner" />
                <span className="sap-empty-label">Agent is starting…</span>
              </div>
            )}
            {groupBlocks(streaming, toolUseId).map((item, i) => {
              if (item.kind === 'agent-group') {
                return (
                  <AgentCardsRow
                    key={`${toolUseId}-agents-${i}`}
                    tools={item.tools}
                    sessionId={sessionId}
                    getStatus={(t) => (t._status ?? (t._result ? (t._result.isError ? 'failed' : 'completed') : 'running')) as ToolStatus}
                  />
                )
              }
              if (item.kind === 'quiet-group') {
                const firstToolId = item.items.find((it) => it.kind === 'tool')?.tool.id
                return (
                  <QuietToolGroup
                    key={firstToolId || `${toolUseId}-quiet-${i}`}
                    items={item.items}
                    sessionId={sessionId}
                  />
                )
              }
              return <StreamBlockView key={`${toolUseId}-block-${i}`} block={item.block} sessionId={sessionId} />
            })}
            {subagent.activeTool && (
              <div className="sap-active-tool">
                <div className="sap-active-spinner" />
                <span>
                  <strong>{subagent.activeTool.toolName}</strong>
                  {subagent.activeTool.message ? ` — ${subagent.activeTool.message}` : ''}
                </span>
              </div>
            )}
            {subagent.activityLog.length > 0 && (
              <div className="sap-tool-log">
                <span className="sap-tool-log-title">Tool log</span>
                {subagent.activityLog.slice(-10).reverse().map((entry, index) => (
                  <div key={`${entry.toolName}-${entry.startedAt}-${index}`} className={`sap-tool-log-row sap-tool-log-row--${entry.stage}`}>
                    <span className="sap-tool-log-dot" />
                    <span className="sap-tool-log-copy">
                      <span className="sap-tool-log-name">{entry.toolName.replace(/_/g, ' ')}</span>
                      {entry.message && <span className="sap-tool-log-message">{entry.message}</span>}
                    </span>
                    <span className="sap-tool-log-time">{formatActivityDuration(entry)}</span>
                  </div>
                ))}
              </div>
            )}
            {hasTerminalOutputState && (
              <FinalOutputSummary status={subagent.status} result={result} sessionId={sessionId} />
            )}
            <div ref={bottomRef} />
          </div>
        )}

        {tab === 'output' && (
          <div className="sap-output">
            {hasResult
              ? (
                <div className="sap-output-content">
                  <MarkdownView sessionId={sessionId}>{result ?? ''}</MarkdownView>
                </div>
              )
              : (
                <div className="sap-output-empty">
                  <span className="sap-output-state">
                    {subagent.status === 'failed' && <span className="sap-output-status sap-output-status--failed">failed</span>}
                    <span>{subagent.status === 'running' ? 'Output will appear here once the agent finishes.' : 'No final output was captured.'}</span>
                  </span>
                </div>
              )
            }
          </div>
        )}
      </div>
    </div>
  )
})

function FinalOutputSummary({ status, result, sessionId }: { status: 'running' | 'completed' | 'failed'; result?: string; sessionId?: string }) {
  const hasResult = Boolean(result?.trim())
  return (
    <div className="sap-final-output">
      <div className="sap-final-output-title">
        {status === 'failed' && <span className="sap-output-status sap-output-status--failed">failed</span>}
        <span>Agent output</span>
      </div>
      {hasResult
        ? (
          <div className="sap-final-output-content">
            <MarkdownView sessionId={sessionId}>{result ?? ''}</MarkdownView>
          </div>
        )
        : (
          <div className="sap-final-output-empty">No final output was captured.</div>
        )
      }
    </div>
  )
}

function StreamBlockView({ block, sessionId }: { block: Parameters<typeof groupBlocks>[0][number]; sessionId?: string }) {
  if (block.type === 'tool_result') return null

  if (block.type === 'text') {
    if (!block.text.trim()) return null
    return (
      <div className="sap-block-text">
        <MarkdownView sessionId={sessionId}>{block.text}</MarkdownView>
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

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  const m = Math.floor(ms / 60_000)
  const s = Math.floor((ms % 60_000) / 1000)
  return `${m}m${s > 0 ? ` ${s}s` : ''}`
}

function formatActivityDuration(entry: ToolActivity): string {
  if (!entry.endedAt) return 'now'
  return formatMs(Math.max(0, entry.endedAt - entry.startedAt))
}
