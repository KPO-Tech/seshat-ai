import { Down } from '@icon-park/react'
import { useUIStore } from '@/stores/ui'
import { MarkdownView } from '@/components/MarkdownView'
import { SilentToolView } from './tool-block/renderers/SilentToolView'
import { ToolLineItem, TOOL_LINE_CSS } from './tool-block/ToolLineItem'
import { toolStatus } from './tool-block/quietGroupPhrase'
import { isSilentTool, thinkingIcon, toolSnippet } from './tool-block/toolDisplay'
import { TOOL_BLOCK_CSS } from './tool-block/styles'
import type { ToolBlockProps } from './tool-block/types'
import type { QuietGroupItem } from './MessageItem'

type Props = {
  items: QuietGroupItem[]
  sessionId?: string
  revealThinking?: boolean
  autoExpandTools?: boolean
  onSubmitPrompt?: ToolBlockProps['onSubmitPrompt']
}

// A run of 2+ tools (or tools interleaved with thinking blocks) with no text
// between them - rendered as a single always-visible timeline, one dot per
// step on a shared vertical line, instead of hidden behind a "3 tools ran"
// summary someone has to click to see anything. Each step keeps its own
// expand-for-details affordance (ToolLineItem/SilentToolView/thinking below)
// - only the outer "collapse the whole run into one line" behavior is gone.
export function QuietToolGroup({ items, sessionId, revealThinking = false, autoExpandTools = false, onSubmitPrompt }: Props) {
  return (
    <div className="qtg-root">
      <style>{QUIET_GROUP_CSS}</style>
      <style>{TOOL_LINE_CSS}</style>
      {/* Every dedicated *ToolView body (Section/CodeBox/ProseBox/…) is
          styled by TOOL_BLOCK_CSS. ToolBlock.tsx injects it for a solo tool;
          this is the same injection for the grouped-run surface. */}
      <style>{TOOL_BLOCK_CSS}</style>
      <div className="qtg-items">
        {items.map((item) => {
          if (item.kind === 'thinking') {
            return <ThinkingGroupItem key={item.thinkingId} thinkingId={item.thinkingId} thinking={item.thinking} sessionId={sessionId} revealThinking={revealThinking} />
          }
          const tool = item.tool
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
                snippet={toolSnippet(tool)}
                sessionId={sessionId}
              />
            )
          }
          return (
            <ToolLineItem
              key={tool.id}
              tool={tool}
              sessionId={sessionId}
              autoExpand={autoExpandTools}
              onSubmitPrompt={onSubmitPrompt}
            />
          )
        })}
      </div>
    </div>
  )
}

// Folded into a group's item list wherever a thinking block sits between two
// groupable tool calls (see groupBlocks in MessageItem.tsx) - same row shape
// as ToolLineItem so it sits on the same timeline, closed by default since
// it's reasoning the run doesn't need to justify itself.
function ThinkingGroupItem({
  thinkingId,
  thinking,
  sessionId,
  revealThinking = false,
}: {
  thinkingId: string
  thinking: string
  sessionId?: string
  revealThinking?: boolean
}) {
  const storedExpansion = useUIStore((s) => s.thinkingExpansion[thinkingId])
  const expanded = storedExpansion ?? revealThinking
  const setThinkingExpansion = useUIStore((s) => s.setThinkingExpansion)

  function toggle() {
    setThinkingExpansion(thinkingId, !expanded)
  }

  return (
    <div className="qtg-item">
      <div
        className={`qtg-item-line qtg-item-line--thinking${expanded ? ' qtg-item-line--open' : ''}`}
        role="button"
        tabIndex={0}
        onClick={toggle}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle() } }}
        aria-expanded={expanded}
      >
        <span className="qtg-icon"><span className="tl-icon">{thinkingIcon()}</span></span>
        <span className="qtg-item-label qtg-item-label--thinking">Thinking</span>
        <span className={`qtg-chevron${expanded ? ' qtg-chevron--open' : ''}`}>
          <Down size={10} />
        </span>
      </div>
      {expanded && (
        <div className="qtg-item-body qtg-item-body--thinking">
          <MarkdownView className="tb-thinking-md" sessionId={sessionId}>{thinking}</MarkdownView>
        </div>
      )}
    </div>
  )
}

const QUIET_GROUP_CSS = `
.qtg-root {
  display: flex;
  flex-direction: column;
  margin: 0;
}

.qtg-items {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
}

.qtg-item-line--thinking .qtg-item-label--thinking {
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 650;
}

.qtg-item-line--thinking {
  min-height: 40px;
}

.qtg-item-line--thinking .qtg-chevron {
  margin-left: auto;
}

.qtg-item-line--open {
  border-radius: 6px 6px 0 0;
}

.qtg-item-body--thinking {
  padding: 9px 12px 10px 39px;
  border: 1px solid var(--color-border-subtle);
  border-top: none;
  border-radius: 0 0 6px 6px;
  background: color-mix(in srgb, var(--color-bg) 72%, white);
  font-size: 11px;
  font-style: normal;
  color: var(--color-text-muted);
  line-height: 1.55;
}

/* Same neutralizing rules as MessageItem.tsx's standalone ThinkingBlock -
   duplicated (not shared) since QuietToolGroup renders on its own inside
   SubagentPanel, where MessageItem's own <style> tag isn't guaranteed to be
   mounted. Reasoning-summary providers (Codex/gpt-5) format their summary
   with real markdown structure (bold lead-ins, headings, blockquotes) that
   would otherwise render at full weight instead of this row's small/muted/
   italic look. */
.tb-thinking-md h1, .tb-thinking-md h2, .tb-thinking-md h3 {
  margin: 0 0 4px;
  font-size: inherit;
  font-weight: 600;
  color: inherit;
}

.tb-thinking-md strong { font-weight: 600; }

.tb-thinking-md blockquote {
  margin: 4px 0;
  padding-left: 8px;
  border-left: 2px solid var(--color-border-subtle);
  color: inherit;
}

.tb-thinking-md p { margin: 0 0 6px; }
.tb-thinking-md p:last-child { margin-bottom: 0; }
`
