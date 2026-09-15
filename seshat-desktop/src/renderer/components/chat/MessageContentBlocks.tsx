import type { ChatContentBlock } from './chatTypes'
import { ToolCard } from './ToolCard'

export function MessageContentBlocks({ blocks }: { blocks: ChatContentBlock[] }) {
  return (
    <>
      {blocks.map((block, index) => {
        if (block.type === 'text') return <TextBlock key={index} text={block.text} />
        if (block.type === 'thinking') return <ThinkingBlock key={index} text={block.thinking} />
        if (block.type === 'tool_use') return <ToolCard key={block.id || index} tool={block} />
        return null
      })}
    </>
  )
}

function TextBlock({ text }: { text: string }) {
  return <div className="whitespace-pre-wrap break-words">{text}</div>
}

function ThinkingBlock({ text }: { text: string }) {
  if (!text.trim()) return null
  return (
    <details className="my-2 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-panel)]">
      <summary className="cursor-pointer px-3 py-2 text-[12px] font-semibold text-[var(--text-muted)]">Thinking</summary>
      <div className="border-t border-[var(--border-soft)] px-3 py-2 text-[12px] leading-6 text-[var(--text-secondary)]">{text}</div>
    </details>
  )
}
