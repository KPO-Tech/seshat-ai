import { memo } from 'react'
import type { ToolStatus } from '@/api/types'
import { isSilentTool, toolSnippet } from './tool-block/toolDisplay'
import { SilentToolView } from './tool-block/renderers/SilentToolView'
import { ToolLineItem, TOOL_LINE_CSS } from './tool-block/ToolLineItem'
import { TOOL_BLOCK_CSS } from './tool-block/styles'
import type { ToolBlockProps } from './tool-block/types'

// Note: awaiting_approval tool_use blocks never reach ToolBlock — MessageItem
// renders PermissionCard standalone for that status instead (see
// MessageItem.tsx's tool_use branch). A lone tool of any other status
// (including failed) reaches here whenever it has no adjacent tool_use
// sibling — see MessageItem.groupBlocks(), which otherwise routes runs of
// 2+ into QuietToolGroup instead.
//
// A solo tool gets the exact same terse, foldable line as one running
// inside a group (ToolLineItem) - it's the group wrapper that differs, not
// the individual row. A bordered "card" treatment here made even a single
// Read/Write look as heavy as an actual multi-step operation.
export const ToolBlock = memo(function ToolBlock({ tool, sessionId, onSubmitPrompt }: ToolBlockProps) {
  const result = tool._result
  const status: ToolStatus = tool._status
    ?? (result ? (result.isError ? 'failed' : 'completed') : 'running')

  if (isSilentTool(tool.name)) {
    return (
      <>
        <style>{TOOL_BLOCK_CSS}</style>
        {/* SilentToolView's status dot uses the shared .tl-dot/.tl-spinner
            classes defined in TOOL_LINE_CSS, same as ToolLineItem below and
            QuietToolGroup's grouped run - one dot style everywhere. */}
        <style>{TOOL_LINE_CSS}</style>
        <SilentToolView
          tool={tool}
          result={result}
          status={status}
          snippet={toolSnippet(tool)}
          sessionId={sessionId}
        />
      </>
    )
  }

  return (
    <>
      <style>{TOOL_BLOCK_CSS}</style>
      <style>{TOOL_LINE_CSS}</style>
      <ToolLineItem tool={tool} onSubmitPrompt={onSubmitPrompt} />
    </>
  )
})
