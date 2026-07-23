import { useState } from 'react'
import type { ToolViewProps } from '../types'
import type { ToolStatus } from '@/api/types'

const CSS = `
.tb-sl {
  display: flex;
  flex-direction: column;
  margin: 0 0 2px;
}

.tb-sl-line {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 0;
  font-size: 10px;
  color: var(--color-text-muted);
  cursor: default;
  user-select: none;
}

.tb-sl-line--clickable {
  cursor: pointer;
}

.tb-sl-line--clickable:hover {
  color: var(--color-text-secondary);
}

.tb-sl-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.tb-sl-spinner {
  width: 9px;
  height: 9px;
  border: 1.5px solid rgba(239, 124, 47, 0.2);
  border-top-color: var(--color-accent);
  border-radius: 50%;
  animation: tb-sl-spin 0.85s linear infinite;
}

@keyframes tb-sl-spin {
  to { transform: rotate(360deg); }
}

.tb-sl-name {
  font-style: italic;
  color: inherit;
}

.tb-sl-snippet {
  font-family: monospace;
  font-size: 10px;
  opacity: 0.55;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 320px;
}

.tb-sl-error-text {
  color: var(--color-error);
}

.tb-sl-arrow {
  opacity: 0.45;
  font-size: 10px;
  transition: transform 0.15s;
  line-height: 1;
}

.tb-sl-arrow--open {
  transform: rotate(180deg);
}

.tb-sl-error-body {
  margin-top: 4px;
  padding-left: 14px;
  font-size: 10px;
  color: var(--color-error);
  font-family: monospace;
  white-space: pre-wrap;
  word-break: break-all;
  line-height: 1.5;
}
`

const LABELS: Record<string, string> = {
  // file
  read: 'Read', file_read: 'Read', read_file: 'Read', glob: 'Glob',
  // task plumbing
  task_get: 'Get Task', task_stop: 'Stop Task', task_output: 'Task Output',
  // internal
  tool_search: 'Tool Search', skill: 'Skill', config: 'Config', brief: 'Brief',
  // LSP / code
  lsp: 'LSP', code_complete: 'Complete',
  // RAG
  rag_ingest: 'Ingest',
  // MCP
  mcp_list_resources: 'MCP Resources', mcp_read_resource: 'MCP Read',
  // agent management
  monitor: 'Monitor', wait_agent: 'Wait', list_agents: 'List Agents',
  close_agent: 'Close Agent', resume_agent: 'Resume Agent',
  // worktree
  enter_worktree: 'Worktree', exit_worktree: 'Exit Worktree',
  // goals
  create_goal: 'Goal', get_goal: 'Get Goal', update_goal: 'Update Goal',
  // doc
  docx: 'Docx',
  // messaging
  mailbox_send: 'Send', mailbox_broadcast: 'Broadcast', send_agent_message: 'Message',
}

type Props = ToolViewProps & { status: ToolStatus; snippet: string }

export function SilentToolView({ tool, result, status, snippet }: Props) {
  const [open, setOpen] = useState(false)
  const isError = result?.isError === true || status === 'failed'
  const isRunning = status === 'running' || status === 'pending'
  const label = LABELS[tool.name] ?? tool.name

  return (
    <div className="tb-sl">
      <style>{CSS}</style>
      <div
        className={`tb-sl-line${isError ? ' tb-sl-line--clickable tb-sl-error-text' : ''}`}
        role={isError ? 'button' : undefined}
        tabIndex={isError ? 0 : undefined}
        onClick={isError ? () => setOpen((v) => !v) : undefined}
        onKeyDown={isError ? (e) => { if (e.key === 'Enter' || e.key === ' ') setOpen((v) => !v) } : undefined}
      >
        <span className="tb-sl-icon">
          {isRunning && <span className="tb-sl-spinner" />}
          {!isRunning && !isError && <span style={{ color: 'var(--color-success)', lineHeight: 1 }}>✓</span>}
          {!isRunning && isError && <span style={{ lineHeight: 1 }}>✗</span>}
        </span>
        <span className="tb-sl-name">{label}</span>
        {snippet && <span className="tb-sl-snippet">{snippet}</span>}
        {isError && (
          <span className={`tb-sl-arrow${open ? ' tb-sl-arrow--open' : ''}`}>▾</span>
        )}
      </div>
      {isError && open && result?.content && (
        <div className="tb-sl-error-body">{result.content}</div>
      )}
    </div>
  )
}
