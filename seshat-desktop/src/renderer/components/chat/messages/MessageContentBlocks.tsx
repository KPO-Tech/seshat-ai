import { useEffect, useRef, useState } from 'react'
import type { ChatContentBlock, ToolUseBlock } from '../lib/chatTypes'
import { isGroupableTool, isHiddenTool } from '../tools/catalog/toolCatalog'
import { getToolPresentation } from '../tools/catalog/toolPresentation'
import { QuietToolGroup } from '../tools/QuietToolGroup'
import { ToolRenderer } from '../tools/ToolRenderer'
import { MarkdownView } from '../../ui/MarkdownView'

export function MessageContentBlocks({ sessionId, blocks, live = false }: { sessionId?: string; blocks: ChatContentBlock[]; live?: boolean }) {
  const visibleBlocks = blocks.filter((block) => block.type !== 'tool_use' || block._approval || block._prompt || !isHiddenTool(block.name))
  const items = groupBlocks(visibleBlocks)
  return (
    <>
      {items.map((item, index) => {
        if (item.kind === 'group') return <QuietToolGroup key={`group-${index}`} sessionId={sessionId} tools={item.tools} />
        const block = item.block
        const isLast = index === items.length - 1
        if (block.type === 'text') return <TextBlock key={index} text={block.text} sessionId={sessionId} streaming={live && isLast} />
        if (block.type === 'thinking') return <ThinkingBlock key={index} text={block.thinking} active={live && isLast} />
        if (block.type === 'tool_use') return <ToolRenderer key={block.id || index} sessionId={sessionId} tool={block} />
        return null
      })}
    </>
  )
}

function TextBlock({ text, sessionId, streaming }: { text: string; sessionId?: string; streaming: boolean }) {
  return <MarkdownView className="break-words" sessionId={sessionId} streaming={streaming}>{text}</MarkdownView>
}

function ThinkingBlock({ text, active }: { text: string; active: boolean }) {
  const [open, setOpen] = useState(active)
  // The backend sends no start/end timestamp for a thinking block, so this
  // times it client-side: the moment it first becomes the actively-streaming
  // block until the moment it stops (either the turn moves on to the next
  // block, or streaming ends) - an approximation, but the only duration
  // signal available without new backend telemetry.
  const startedAtRef = useRef<number | null>(null)
  const [durationMs, setDurationMs] = useState<number | null>(null)

  useEffect(() => {
    setOpen(active)
    if (active) {
      if (startedAtRef.current === null) startedAtRef.current = Date.now()
      setDurationMs(null)
    } else if (startedAtRef.current !== null) {
      setDurationMs(Date.now() - startedAtRef.current)
    }
  }, [active])

  if (!text.trim()) return null
  return (
    <div className="my-2 overflow-hidden rounded-lg border border-[var(--border-soft)] bg-[var(--surface-panel)]">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-9 w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-[var(--surface-muted)]"
      >
        <span className="flex items-center gap-2 text-[12px] font-semibold text-[var(--text-muted)]">
          {active && <span className="size-2 rounded-full bg-[var(--accent-primary)] shadow-[0_0_10px_var(--accent-primary)]" />}
          Thinking
          {!active && durationMs !== null && <span className="text-[11px] font-normal text-[var(--text-faint)]">{formatThinkingDuration(durationMs)}</span>}
        </span>
        <span className="text-[11px] font-semibold text-[var(--text-muted)]">{open ? 'Hide' : 'Details'}</span>
      </button>
      {open && <div className="border-t border-[var(--border-soft)] px-3 py-2 text-[12px] leading-6 text-[var(--text-secondary)]">{text}</div>}
    </div>
  )
}

function formatThinkingDuration(ms: number) {
  return ms < 1000 ? '<1s' : `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`
}

type RenderItem = { kind: 'block'; block: ChatContentBlock } | { kind: 'group'; tools: ToolUseBlock[] }

function groupBlocks(blocks: ChatContentBlock[]): RenderItem[] {
  const items: RenderItem[] = []
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index]
    if (block.type !== 'tool_use' || !canGroup(block)) {
      items.push({ kind: 'block', block })
      continue
    }

    const tools: ToolUseBlock[] = [block]
    let cursor = index + 1
    while (cursor < blocks.length) {
      const next = blocks[cursor]
      if (next.type !== 'tool_use' || !canGroup(next)) break
      tools.push(next)
      cursor += 1
    }

    if (tools.length > 1) {
      items.push({ kind: 'group', tools })
      index = cursor - 1
    } else {
      items.push({ kind: 'block', block })
    }
  }
  return items
}

function canGroup(tool: ToolUseBlock) {
  return getToolPresentation(tool.name).mode === 'compact' && isGroupableTool(tool.name) && tool._status !== 'awaiting_approval'
}
