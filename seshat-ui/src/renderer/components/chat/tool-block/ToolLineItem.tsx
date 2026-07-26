import { Copy, Down } from '@icon-park/react'
import { useUIStore } from '@/stores/ui'
import type { ToolUseBlock } from '@/api/types'
import { DiffView, resolveDiffRows } from './DiffView'
import { summarizeQuietGroup, toolResultSubtitle, toolStatus } from './quietGroupPhrase'
import { categoryIcon, isEditTool, isWriteTool, renderToolBody } from './toolDisplay'
import type { ToolBlockProps } from './types'

// The single terse, foldable line used for every non-silent tool call,
// whether it's shown standalone (ToolBlock, one lone tool with no
// simultaneous neighbor) or nested inside a shared group (QuietToolGroup,
// 2+ tools running back-to-back with no text between them) - both surfaces
// render the exact same row so they can never visually drift apart.
export function ToolLineItem({ tool, onSubmitPrompt }: {
  tool: ToolUseBlock
  onSubmitPrompt?: ToolBlockProps['onSubmitPrompt']
}) {
  const expanded = useUIStore((s) => s.toolExpansion[tool.id] ?? false)
  const setToolExpansion = useUIStore((s) => s.setToolExpansion)
  const status = toolStatus(tool)
  const isRunning = status === 'running' || status === 'pending'
  const isError = status === 'failed'
  const label = summarizeQuietGroup([tool])
  const isDiffTool = isEditTool(tool.name) || isWriteTool(tool.name)
  // The label above already reads "Wrote foo.py +12 -3" - a "12 lines"
  // subtitle under it for a diff tool is pure repetition (and once
  // expanded, DiffView's own path/stats strip repeats it a third time).
  // Still surface "failed" though, same as every other tool - it's the one
  // subtitle worth seeing without expanding.
  const subtitle = isDiffTool && status !== 'failed' ? null : toolResultSubtitle(tool)
  const copyText = tool._result?.content || JSON.stringify(tool.input, null, 2)

  function toggle() {
    setToolExpansion(tool.id, !expanded)
  }

  return (
    <div className="qtg-item">
      {/* A real <button> for copy can't nest inside another <button>, so the
          row itself is a div with button semantics instead. */}
      <div
        className="qtg-item-line"
        role="button"
        tabIndex={0}
        onClick={toggle}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle() } }}
        aria-expanded={expanded}
      >
        <span className="qtg-icon">
          {isRunning && <span className="tl-spinner" />}
          {!isRunning && (
            <span className={`tl-icon${isError ? ' tl-icon--err' : ''}`}>
              {categoryIcon(tool.name)}
              {isError && <span className="tl-icon-badge" />}
            </span>
          )}
        </span>
        <span className="qtg-item-label">{label}</span>
        {isError && <span className="qtg-item-status qtg-item-status--failed">failed</span>}
        <button
          type="button"
          className="qtg-item-copy"
          title="Copy"
          onClick={(e) => { e.stopPropagation(); void navigator.clipboard.writeText(copyText) }}
        >
          <Copy size={10} />
        </button>
        <span className={`qtg-chevron${expanded ? ' qtg-chevron--open' : ''}`}>
          <Down size={10} />
        </span>
      </div>

      {subtitle && !isError && (
        <div className={`qtg-item-subtitle${isError ? ' qtg-item-subtitle--error' : ''}`}>{subtitle}</div>
      )}

      {/* Every dedicated *ToolView (and GenericToolView) already renders its
          own "Error" section from result.content when isError - showing it
          again here duplicated the same text under every failed tool call.
          See BashToolView/WebSearchToolView for the two that were missing
          that section until this pass. */}
      {expanded && (
        <div className="qtg-item-body">
          {isDiffTool ? (
            <DiffContent tool={tool} />
          ) : (
            renderToolBody({ tool, result: tool._result, status }, onSubmitPrompt)
          )}
        </div>
      )}
    </div>
  )
}

function DiffContent({ tool }: { tool: ToolUseBlock }) {
  const diff = resolveDiffRows(tool)
  const filePath = typeof tool.input.file_path === 'string' ? (tool.input.file_path as string) : ''
  if (diff && diff.rows.length > 0) {
    return <DiffView filePath={filePath} rows={diff.rows} addCount={diff.addCount} delCount={diff.delCount} />
  }
  // resolveDiffRows returns null for a landed, failed result (see its own
  // comment) - show the real error instead of a silently empty body, same
  // treatment WriteToolView/EditToolView give the non-grouped case.
  if (tool._result?.isError && tool._result.content) {
    return <pre className="tb-pre tb-pre--error">{tool._result.content}</pre>
  }
  return null
}

export const TOOL_LINE_CSS = `
.qtg-item { display: flex; flex-direction: column; }

.qtg-item-line {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: transparent;
  border: none;
  padding: 2px 0;
  cursor: pointer;
  color: var(--color-text-muted);
  text-align: left;
  width: 100%;
  font-size: 10px;
}

.qtg-item-line:hover { color: var(--color-text-secondary); }

.qtg-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

/* Shared timeline icon - sits centered in the 14px .qtg-icon/.tb-sl-icon
   column. Used by every step type (tool, silent tool, thinking) so a
   glance at the icon says *what kind* of step this was (read/write/edit/
   search/bash/other/thinking), not just that a step happened. Stays muted
   gray regardless of success - green never meant much more than "it
   didn't error," so a failure only needs its own signal (the badge below),
   not a whole extra color for the good path. */
.tl-icon {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-muted);
  flex-shrink: 0;
}

/* A touch brighter than the default muted gray - not red, the badge
   already carries that signal - just enough to help a failed row stand
   out slightly among a run of otherwise-identical gray icons. */
.tl-icon--err { color: var(--color-text-secondary); }

/* A small, subtle marker rather than recoloring the whole icon red - the
   icon itself stays legible as "this was a write/bash/..." even on
   failure, instead of the type information being replaced by an alarm
   color. */
.tl-icon-badge {
  position: absolute;
  top: -2px;
  right: -2px;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--color-error);
}

.tl-spinner {
  width: 9px;
  height: 9px;
  border: 1.5px solid rgba(239, 124, 47, 0.2);
  border-top-color: var(--color-accent);
  border-radius: 50%;
  animation: tl-spin 0.85s linear infinite;
  flex-shrink: 0;
}

@keyframes tl-spin {
  to { transform: rotate(360deg); }
}

.qtg-item-label {
  flex: 0 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.qtg-item-status {
  flex-shrink: 0;
  font-size: 9px;
  font-weight: 700;
  line-height: 1;
}

.qtg-item-status--failed { color: var(--color-error); }

.qtg-item-copy {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  border-radius: 4px;
  border: none;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.12s, background 0.12s, color 0.12s;
}

.qtg-item-line:hover .qtg-item-copy { opacity: 1; }
.qtg-item-copy:hover { background: var(--color-hover); color: var(--color-text); }

.qtg-chevron {
  display: inline-flex;
  align-items: center;
  opacity: 0.55;
  transition: transform 0.15s;
  flex-shrink: 0;
}

.qtg-chevron--open { transform: rotate(180deg); }

.qtg-item-subtitle {
  padding: 0 0 2px 19px;
  font-size: 9px;
  color: var(--color-text-muted);
  opacity: 0.65;
}

.qtg-item-subtitle--error { color: var(--color-error); opacity: 0.85; }

.qtg-item-body {
  padding: 4px 0 6px 19px;
}
`
