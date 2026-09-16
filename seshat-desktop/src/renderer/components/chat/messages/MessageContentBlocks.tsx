import { useEffect, useState } from 'react'
import type { ChatContentBlock, ToolUseBlock } from '../lib/chatTypes'
import { isGroupableTool } from '../tools/catalog/toolCatalog'
import { getToolPresentation } from '../tools/catalog/toolPresentation'
import { QuietToolGroup } from '../tools/QuietToolGroup'
import { ToolRenderer } from '../tools/ToolRenderer'

export function MessageContentBlocks({ sessionId, blocks, live = false }: { sessionId?: string; blocks: ChatContentBlock[]; live?: boolean }) {
  const items = groupBlocks(blocks)
  return (
    <>
      {items.map((item, index) => {
        if (item.kind === 'group') return <QuietToolGroup key={`group-${index}`} sessionId={sessionId} tools={item.tools} />
        const block = item.block
        if (block.type === 'text') return <TextBlock key={index} text={block.text} />
        if (block.type === 'thinking') return <ThinkingBlock key={index} text={block.thinking} active={live && index === items.length - 1} />
        if (block.type === 'tool_use') return <ToolRenderer key={block.id || index} sessionId={sessionId} tool={block} />
        return null
      })}
    </>
  )
}

function TextBlock({ text }: { text: string }) {
  return <div className="whitespace-pre-wrap break-words">{text}</div>
}

function ThinkingBlock({ text, active }: { text: string; active: boolean }) {
  const [open, setOpen] = useState(active)

  useEffect(() => {
    setOpen(active)
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
        </span>
        <span className="text-[11px] font-semibold text-[var(--text-muted)]">{open ? 'Hide' : 'Details'}</span>
      </button>
      {open && <div className="border-t border-[var(--border-soft)] px-3 py-2 text-[12px] leading-6 text-[var(--text-secondary)]">{text}</div>}
    </div>
  )
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
