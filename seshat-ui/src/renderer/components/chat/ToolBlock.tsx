import { memo } from 'react'
import { Down } from '@icon-park/react'
import type { ToolStatus } from '@/api/types'
import { useUIStore } from '@/stores/ui'
import { StatusBadge } from './tool-block/common'
import { headerSummary, toolIcon, toolLabel, inputSnippetForSilent } from './tool-block/helpers'
import { isSilentTool } from './tool-block/quietGroupPhrase'
import { renderBody } from './tool-block/renderBody'
import { SilentToolView } from './tool-block/renderers/SilentToolView'
import { TOOL_BLOCK_CSS } from './tool-block/styles'
import type { ToolBlockProps } from './tool-block/types'

// Note: awaiting_approval tool_use blocks never reach ToolBlock — MessageItem
// renders PermissionCard standalone for that status instead (see
// MessageItem.tsx's tool_use branch). A lone tool of any other status
// (including failed) reaches here whenever it has no adjacent tool_use
// sibling — see MessageItem.groupBlocks(), which otherwise routes runs of
// 2+ into QuietToolGroup instead.
export const ToolBlock = memo(function ToolBlock({ tool, sessionId, onSubmitPrompt }: ToolBlockProps) {
  const expanded = useUIStore((s) => s.toolExpansion[tool.id] ?? false)
  const setToolExpansion = useUIStore((s) => s.setToolExpansion)
  const result = tool._result
  const status: ToolStatus = tool._status
    ?? (result ? (result.isError ? 'failed' : 'completed') : 'running')
  const snippet = headerSummary(tool, status)

  if (isSilentTool(tool.name)) {
    return (
      <SilentToolView
        tool={tool}
        result={result}
        status={status}
        snippet={inputSnippetForSilent(tool)}
        sessionId={sessionId}
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
