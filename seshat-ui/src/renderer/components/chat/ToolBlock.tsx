import { memo } from 'react'
import { Down } from '@icon-park/react'
import type { ToolStatus } from '@/api/types'
import { useUIStore } from '@/stores/ui'
import { StatusBadge } from './tool-block/common'
import { headerSummary, toolIcon, toolLabel, inputSnippetForSilent } from './tool-block/helpers'
import { renderBody } from './tool-block/renderBody'
import { SilentToolView } from './tool-block/renderers/SilentToolView'
import { TOOL_BLOCK_CSS } from './tool-block/styles'
import type { ToolBlockProps } from './tool-block/types'

// Tools rendered as a terse single line instead of a full bordered card.
// Note: since MessageItem.groupBlocks() now wraps any GROUPABLE_TOOLS run
// (a superset of this set, see tool-block/quietGroupPhrase.ts) in a
// quiet-group before ToolBlock ever sees it, this branch is effectively a
// safety net for silent tools that end up here some other way (e.g. a lone
// block adjacent to a non-tool_use block that breaks grouping upstream).
const SILENT_TOOLS = new Set([
  // file tools with no user-visible output
  'read', 'file_read', 'read_file',
  // task plumbing
  'task_get', 'task_stop', 'task_output',
  // internal discovery & control
  'tool_search', 'skill', 'config', 'brief',
  // LSP / code assist
  'lsp', 'code_complete',
  // RAG ingest (search has its own view)
  'rag_ingest',
  // MCP
  'mcp_list_resources', 'mcp_read_resource',
  // background task / agent management
  'monitor', 'wait_agent', 'list_agents', 'close_agent', 'resume_agent',
  // worktree lifecycle
  'enter_worktree', 'exit_worktree',
  // goal tracking
  'create_goal', 'get_goal', 'update_goal',
  // doc generation (no preview needed)
  'docx',
  // messaging
  'mailbox_send', 'mailbox_broadcast', 'send_agent_message',
])

// Note: awaiting_approval tool_use blocks never reach ToolBlock — MessageItem
// renders PermissionCard standalone for that status instead (see
// MessageItem.tsx's tool_use branch).
export const ToolBlock = memo(function ToolBlock({ tool, onSubmitPrompt }: ToolBlockProps) {
  const expanded = useUIStore((s) => s.toolExpansion[tool.id] ?? false)
  const setToolExpansion = useUIStore((s) => s.setToolExpansion)
  const result = tool._result
  const status: ToolStatus = tool._status
    ?? (result ? (result.isError ? 'failed' : 'completed') : 'running')
  const snippet = headerSummary(tool, status)

  if (SILENT_TOOLS.has(tool.name)) {
    return (
      <SilentToolView
        tool={tool}
        result={result}
        status={status}
        snippet={inputSnippetForSilent(tool)}
      />
    )
  }

  const showBody = expanded || Boolean(tool._prompt)

  return (
    <div className={`tb-root tb-root--${status}`}>
      <style>{TOOL_BLOCK_CSS}</style>

      <button
        className="tb-header"
        type="button"
        onClick={() => setToolExpansion(tool.id, !expanded)}
        aria-expanded={showBody}
      >
        <div className="tb-header-left">
          <span className="tb-icon">{toolIcon(tool.name)}</span>
          <div className="tb-copy-line">
            <span className="tb-name">{toolLabel(tool.name)}</span>
            {snippet && <span className="tb-snippet">{snippet}</span>}
          </div>
        </div>
        <div className="tb-header-right">
          <StatusBadge status={status} durationMs={result?.durationMs} />
          <span className={`tb-chevron${showBody ? ' tb-chevron--open' : ''}`}>
            <Down size={11} />
          </span>
        </div>
      </button>

      {showBody && (
        <div className="tb-body">
          {renderBody({ tool, result, status }, onSubmitPrompt)}
        </div>
      )}
    </div>
  )
})
