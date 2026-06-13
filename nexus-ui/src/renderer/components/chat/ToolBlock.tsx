import { memo } from 'react'
import { Down } from '@icon-park/react'
import type { ToolStatus } from '@/api/types'
import { useUIStore } from '@/stores/ui'
import { ApprovalSection, StatusBadge } from './tool-block/common'
import { headerSummary, toolIcon, toolLabel } from './tool-block/helpers'
import { BashToolView } from './tool-block/renderers/BashToolView'
import { AskUserToolView } from './tool-block/renderers/AskUserToolView'
import { GenericToolView } from './tool-block/renderers/GenericToolView'
import { TaskToolView } from './tool-block/renderers/TaskToolView'
import { TodoWriteToolView } from './tool-block/renderers/TodoWriteToolView'
import { WebSearchToolView } from './tool-block/renderers/WebSearchToolView'
import { TOOL_BLOCK_CSS } from './tool-block/styles'
import type { ToolBlockProps } from './tool-block/types'

export const ToolBlock = memo(function ToolBlock({ tool, onApprove, onDeny, onSubmitPrompt }: ToolBlockProps) {
  const expanded = useUIStore((s) => s.toolExpansion[tool.id] ?? false)
  const setToolExpansion = useUIStore((s) => s.setToolExpansion)
  const result = tool._result
  const status: ToolStatus = tool._status
    ?? (result ? (result.isError ? 'failed' : 'completed') : 'running')
  const snippet = headerSummary(tool, status)
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
          {tool.name === 'bash' && <BashToolView tool={tool} result={result} status={status} />}
          {tool.name === 'ask_user_question' && (
            <AskUserToolView tool={tool} result={result} status={status} onSubmitPrompt={onSubmitPrompt} />
          )}
          {tool.name === 'todo_write' && <TodoWriteToolView tool={tool} result={result} status={status} />}
          {['task_create', 'task_update', 'task_list'].includes(tool.name) && (
            <TaskToolView tool={tool} result={result} status={status} />
          )}
          {tool.name === 'web_search' && <WebSearchToolView tool={tool} result={result} status={status} />}
          {tool.name !== 'bash'
            && tool.name !== 'ask_user_question'
            && tool.name !== 'web_search'
            && tool.name !== 'todo_write'
            && !['task_create', 'task_update', 'task_list'].includes(tool.name) && (
            <GenericToolView tool={tool} result={result} status={status} />
          )}
        </div>
      )}
    </div>
  )
})
