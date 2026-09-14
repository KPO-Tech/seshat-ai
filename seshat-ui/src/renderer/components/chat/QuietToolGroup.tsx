import { Down } from '@icon-park/react'
import { useUIStore } from '@/stores/ui'
import { MarkdownView } from '@/components/MarkdownView'
import { SilentToolView } from './tool-block/renderers/SilentToolView'
import { ToolLineItem } from './tool-block/ToolLineItem'
import { toolStatus } from './tool-block/quietGroupPhrase'
import { isSilentTool, thinkingIcon, toolSnippet } from './tool-block/toolDisplay'
import type { ToolBlockProps } from './tool-block/types'
import type { QuietGroupItem } from './MessageItem'

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

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
    <div className="m-0 flex flex-col">
      <style>{THINKING_MARKDOWN_CSS}</style>
      <div className="m-0 flex flex-col gap-1.5">
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
    <div className="flex flex-col">
      <div
        className={cx(
          'group inline-flex min-h-10 w-full cursor-pointer items-center gap-1.5 border border-app-border-subtle bg-app-surface px-2 py-1.5 text-left text-[10.5px] leading-snug text-app-text-muted transition-colors duration-150 hover:border-[color-mix(in_srgb,var(--color-accent)_20%,var(--color-border-subtle))] hover:bg-app-surface-elevated hover:text-app-text-secondary',
          expanded ? 'rounded-t-md' : 'rounded-md',
        )}
        role="button"
        tabIndex={0}
        onClick={toggle}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle() } }}
        aria-expanded={expanded}
      >
        <span className="inline-flex size-3.5 shrink-0 items-center justify-center">
          <span className="relative inline-flex shrink-0 items-center justify-center text-app-text-muted">{thinkingIcon()}</span>
        </span>
        <span className="min-w-0 flex-none overflow-hidden text-ellipsis whitespace-nowrap text-[12px] font-[650] text-app-text-secondary">Thinking</span>
        <span className={cx('ml-auto inline-flex shrink-0 items-center opacity-45 transition-transform duration-150', expanded && 'rotate-180')}>
          <Down size={10} />
        </span>
      </div>
      {expanded && (
        <div className="rounded-b-md border border-t-0 border-app-border-subtle bg-[color-mix(in_srgb,var(--color-bg)_72%,white)] pb-[10px] pl-[39px] pr-3 pt-[9px] text-[11px] not-italic leading-[1.55] text-app-text-muted">
          <MarkdownView className="tb-thinking-md" sessionId={sessionId}>{thinking}</MarkdownView>
        </div>
      )}
    </div>
  )
}

const THINKING_MARKDOWN_CSS = `
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
