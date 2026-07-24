import { Copy, Down } from '@icon-park/react'
import { useUIStore } from '@/stores/ui'
import type { ToolUseBlock } from '@/api/types'
import { renderBody } from './renderBody'
import { DiffView, resolveDiffRows } from './DiffView'
import { summarizeQuietGroup, toolStatus, isEditTool, isWriteTool } from './quietGroupPhrase'
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
  const copyText = tool._result?.content || JSON.stringify(tool.input, null, 2)

  function toggle() {
    setToolExpansion(tool.id, !expanded)
  }

  return (
    <div className="qtg-item">
      {/* A real <button> for copy can't nest inside another <button>, so the
          row itself is a div with button semantics instead. */}
      <div
        className={`qtg-item-line${isError ? ' qtg-item-line--error' : ''}`}
        role="button"
        tabIndex={0}
        onClick={toggle}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle() } }}
        aria-expanded={expanded}
      >
        <span className="qtg-icon">
          {isRunning && <span className="qtg-spinner" />}
          {!isRunning && !isError && <span className="qtg-check">✓</span>}
          {!isRunning && isError && <span className="qtg-cross">✗</span>}
        </span>
        <span className="qtg-item-label">{label}</span>
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

      {expanded && (
        <div className="qtg-item-body">
          {isDiffTool ? (
            <DiffContent tool={tool} />
          ) : (
            renderBody({ tool, result: tool._result, status }, onSubmitPrompt)
          )}
          {status === 'failed' && tool._result?.content && (
            <pre className="qtg-error-body">{tool._result.content}</pre>
          )}
        </div>
      )}
    </div>
  )
}

function DiffContent({ tool }: { tool: ToolUseBlock }) {
  const diff = resolveDiffRows(tool)
  const filePath = typeof tool.input.file_path === 'string' ? (tool.input.file_path as string) : ''
  if (!diff || diff.rows.length === 0) return null
  return <DiffView filePath={filePath} rows={diff.rows} addCount={diff.addCount} delCount={diff.delCount} />
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
.qtg-item-line--error { color: var(--color-error); }

.qtg-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.qtg-spinner {
  width: 9px;
  height: 9px;
  border: 1.5px solid rgba(239, 124, 47, 0.2);
  border-top-color: var(--color-accent);
  border-radius: 50%;
  animation: qtg-spin 0.85s linear infinite;
}

@keyframes qtg-spin {
  to { transform: rotate(360deg); }
}

.qtg-check { color: var(--color-success); line-height: 1; font-size: 10px; }
.qtg-cross { color: var(--color-error); line-height: 1; font-size: 10px; }

.qtg-item-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

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

.qtg-item-body {
  padding: 4px 0 6px 19px;
}

.qtg-error-body {
  margin-top: 6px;
  font-size: 10px;
  color: var(--color-error);
  font-family: monospace;
  white-space: pre-wrap;
  word-break: break-all;
  line-height: 1.5;
}
`
