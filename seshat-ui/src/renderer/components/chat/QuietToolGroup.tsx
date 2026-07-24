import { Down } from '@icon-park/react'
import { useUIStore } from '@/stores/ui'
import type { ToolUseBlock } from '@/api/types'
import { inputSnippetForSilent } from './tool-block/helpers'
import { renderBody } from './tool-block/renderBody'
import { SilentToolView } from './tool-block/renderers/SilentToolView'
import { DiffView, resolveDiffRows } from './tool-block/DiffView'
import { summarizeQuietGroup, toolStatus, isEditTool, isWriteTool, isSilentTool } from './tool-block/quietGroupPhrase'
import type { ToolBlockProps } from './tool-block/types'

type Props = {
  tools: ToolUseBlock[]
  sessionId?: string
  onSubmitPrompt?: ToolBlockProps['onSubmitPrompt']
}

export function QuietToolGroup({ tools, sessionId, onSubmitPrompt }: Props) {
  const groupId = tools[0]?.id ?? ''
  const expanded = useUIStore((s) => s.toolGroupExpansion[groupId] ?? false)
  const setToolGroupExpansion = useUIStore((s) => s.setToolGroupExpansion)
  const label = summarizeQuietGroup(tools)
  const anyRunning = tools.some((t) => toolStatus(t) === 'running' || toolStatus(t) === 'pending')
  // A failed tool no longer breaks out of the group (see breaksGroup's doc
  // comment) - it stays collapsed inside this summary line like everything
  // else, so the line itself needs to flag that before anyone expands it.
  const anyFailed = !anyRunning && tools.some((t) => toolStatus(t) === 'failed')

  return (
    <div className="qtg-root">
      <style>{QUIET_GROUP_CSS}</style>
      <button
        className={`qtg-summary${anyFailed ? ' qtg-summary--error' : ''}`}
        type="button"
        onClick={() => setToolGroupExpansion(groupId, !expanded)}
        aria-expanded={expanded}
      >
        <span className="qtg-icon">
          {anyRunning ? <span className="qtg-spinner" /> : anyFailed ? <span className="qtg-cross">✗</span> : <span className="qtg-dot" />}
        </span>
        <span className="qtg-label">{label}</span>
        <span className={`qtg-chevron${expanded ? ' qtg-chevron--open' : ''}`}>
          <Down size={10} />
        </span>
      </button>

      {expanded && (
        <div className="qtg-items">
          {tools.map((tool) => (
            <QuietGroupItem
              key={tool.id}
              tool={tool}
              sessionId={sessionId}
              onSubmitPrompt={onSubmitPrompt}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// Approval prompts inside a group are unreachable today — breaksGroup() in
// quietGroupPhrase.ts stops the run before an awaiting_approval tool, so it
// always renders standalone via ToolBlock/PermissionCard instead. No
// onApprove/onDeny threading needed here.
function QuietGroupItem({ tool, sessionId, onSubmitPrompt }: {
  tool: ToolUseBlock
  sessionId?: string
  onSubmitPrompt?: ToolBlockProps['onSubmitPrompt']
}) {
  const expanded = useUIStore((s) => s.toolExpansion[tool.id] ?? false)
  const setToolExpansion = useUIStore((s) => s.setToolExpansion)
  const status = toolStatus(tool)
  const isRunning = status === 'running' || status === 'pending'
  const isError = status === 'failed'
  const label = summarizeQuietGroup([tool])
  const isDiffTool = isEditTool(tool.name) || isWriteTool(tool.name)

  // A silent tool (see ToolBlock's matching check) already renders a
  // complete, self-sufficient line via SilentToolView - wrapping that in
  // this component's own header/expand-toggle would just double up the
  // same information in two nested rows for no reason.
  if (isSilentTool(tool.name)) {
    return <SilentToolView tool={tool} result={tool._result} status={status} snippet={inputSnippetForSilent(tool)} sessionId={sessionId} />
  }

  return (
    <div className="qtg-item">
      <button
        className={`qtg-item-line${isError ? ' qtg-item-line--error' : ''}`}
        type="button"
        onClick={() => setToolExpansion(tool.id, !expanded)}
        aria-expanded={expanded}
      >
        <span className="qtg-icon">
          {isRunning && <span className="qtg-spinner" />}
          {!isRunning && !isError && <span className="qtg-check">✓</span>}
          {!isRunning && isError && <span className="qtg-cross">✗</span>}
        </span>
        <span className="qtg-item-label">{label}</span>
        <span className={`qtg-chevron${expanded ? ' qtg-chevron--open' : ''}`}>
          <Down size={10} />
        </span>
      </button>

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

const QUIET_GROUP_CSS = `
.qtg-root {
  display: flex;
  flex-direction: column;
  margin: 0 0 2px;
}

.qtg-summary {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: transparent;
  border: none;
  padding: 2px 0;
  cursor: pointer;
  color: var(--color-text-muted);
  text-align: left;
  width: fit-content;
  max-width: 100%;
}

.qtg-summary:hover { color: var(--color-text-secondary); }
.qtg-summary--error { color: var(--color-error); }
.qtg-summary--error:hover { color: var(--color-error); opacity: 0.85; }

.qtg-label {
  font-size: 10px;
  font-style: italic;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.qtg-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.qtg-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
  opacity: 0.5;
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

.qtg-chevron {
  display: inline-flex;
  align-items: center;
  opacity: 0.55;
  transition: transform 0.15s;
  flex-shrink: 0;
}

.qtg-chevron--open { transform: rotate(180deg); }

.qtg-items {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 2px 0 4px 18px;
  padding-left: 7px;
  border-left: 2px solid var(--color-border-subtle);
}

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

.qtg-item-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

.qtg-item-body {
  padding: 4px 0 6px 15px;
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
