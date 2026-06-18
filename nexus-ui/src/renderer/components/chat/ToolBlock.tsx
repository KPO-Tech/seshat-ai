import { memo } from 'react'
import { Down } from '@icon-park/react'
import type { ToolStatus } from '@/api/types'
import { useUIStore } from '@/stores/ui'
import { ApprovalSection, StatusBadge } from './tool-block/common'
import { headerSummary, toolIcon, toolLabel, inputSnippetForSilent } from './tool-block/helpers'
import { AskUserToolView } from './tool-block/renderers/AskUserToolView'
import { BashToolView } from './tool-block/renderers/BashToolView'
import { EditToolView } from './tool-block/renderers/EditToolView'
import { GenericToolView } from './tool-block/renderers/GenericToolView'
import { GlobToolView } from './tool-block/renderers/GlobToolView'
import { GrepToolView } from './tool-block/renderers/GrepToolView'
import { ImageGenToolView } from './tool-block/renderers/ImageGenToolView'
import { RagSearchToolView } from './tool-block/renderers/RagSearchToolView'
import { ReadToolView } from './tool-block/renderers/ReadToolView'
import { SilentToolView } from './tool-block/renderers/SilentToolView'
import { SttToolView } from './tool-block/renderers/SttToolView'
import { TaskToolView } from './tool-block/renderers/TaskToolView'
import { TodoWriteToolView } from './tool-block/renderers/TodoWriteToolView'
import { TtsToolView } from './tool-block/renderers/TtsToolView'
import { WebFetchToolView } from './tool-block/renderers/WebFetchToolView'
import { WebSearchToolView } from './tool-block/renderers/WebSearchToolView'
import { WriteToolView } from './tool-block/renderers/WriteToolView'
import { TOOL_BLOCK_CSS } from './tool-block/styles'
import type { ToolBlockProps, ToolViewProps } from './tool-block/types'

const SILENT_TOOLS = new Set([
  // file tools with no user-visible output
  'read', 'file_read', 'read_file', 'glob',
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

function renderBody(props: ToolViewProps, onSubmitPrompt?: ToolBlockProps['onSubmitPrompt']) {
  const { tool } = props
  switch (tool.name) {
    case 'bash':
      return <BashToolView {...props} />
    case 'ask_user_question':
      return <AskUserToolView {...props} onSubmitPrompt={onSubmitPrompt} />
    case 'todo_write':
      return <TodoWriteToolView {...props} />
    case 'task_create':
    case 'task_update':
    case 'task_list':
      return <TaskToolView {...props} />
    case 'web_search':
      return <WebSearchToolView {...props} />
    case 'web_fetch':
    case 'read_document_url':
    case 'read_url':
      return <WebFetchToolView {...props} />
    case 'edit':
    case 'file_edit':
    case 'edit_file':
      return <EditToolView {...props} />
    case 'write':
    case 'file_write':
    case 'write_file':
      return <WriteToolView {...props} />
    case 'glob':
      return <GlobToolView {...props} />
    case 'grep':
      return <GrepToolView {...props} />
    case 'generate_image':
      return <ImageGenToolView {...props} />
    case 'text_to_speech':
      return <TtsToolView {...props} />
    case 'speech_to_text':
      return <SttToolView {...props} />
    case 'rag_search':
      return <RagSearchToolView {...props} />
    default:
      return <GenericToolView {...props} />
  }
}

export const ToolBlock = memo(function ToolBlock({ tool, onApprove, onDeny, onSubmitPrompt }: ToolBlockProps) {
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

  const showBody = expanded || status === 'awaiting_approval' || Boolean(tool._prompt)

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
            <Down size={13} />
          </span>
        </div>
      </button>

      {showBody && (
        <div className="tb-body">
          {status === 'awaiting_approval' && (
            <ApprovalSection tool={tool} onApprove={onApprove} onDeny={onDeny} />
          )}
          {renderBody({ tool, result, status }, onSubmitPrompt)}
        </div>
      )}
    </div>
  )
})
