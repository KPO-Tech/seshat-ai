import { Down } from '@icon-park/react'
import { useUIStore } from '@/stores/ui'
import type { ToolUseBlock } from '@/api/types'
import { inputSnippetForSilent } from './tool-block/helpers'
import { SilentToolView } from './tool-block/renderers/SilentToolView'
import { ToolLineItem, TOOL_LINE_CSS } from './tool-block/ToolLineItem'
import { summarizeQuietGroup, toolStatus, isSilentTool } from './tool-block/quietGroupPhrase'
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
      <style>{TOOL_LINE_CSS}</style>
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
          {tools.map((tool) => {
            const status = toolStatus(tool)
            // A silent tool already renders a complete, self-sufficient line
            // via SilentToolView - wrapping that in ToolLineItem's own
            // header/expand-toggle would just double up the same
            // information in two nested rows for no reason.
            if (isSilentTool(tool.name)) {
              return (
                <SilentToolView
                  key={tool.id}
                  tool={tool}
                  result={tool._result}
                  status={status}
                  snippet={inputSnippetForSilent(tool)}
                  sessionId={sessionId}
                />
              )
            }
            return (
              <ToolLineItem
                key={tool.id}
                tool={tool}
                onSubmitPrompt={onSubmitPrompt}
              />
            )
          })}
        </div>
      )}
    </div>
  )
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

.qtg-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
  opacity: 0.5;
}

.qtg-items {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 2px 0 4px 18px;
  padding-left: 7px;
  border-left: 2px solid var(--color-border-subtle);
}
`
