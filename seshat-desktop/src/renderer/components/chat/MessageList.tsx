import { useEffect, useRef } from 'react'
import type { ChatMessage, StreamingBlock } from './chatTypes'
import { ToolCard } from './ToolCard'

export function MessageList({ messages, streaming, isStreaming }: { messages: ChatMessage[]; streaming: StreamingBlock[]; isStreaming: boolean }) {
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages, streaming])

  return (
    <div className="mx-auto flex w-full max-w-[850px] flex-col gap-7 px-4 pb-8 pt-8">
      {messages.map((message, index) => (
        <MessageBubble key={message.id || index} message={message} />
      ))}
      {isStreaming && streaming.length > 0 && (
        <MessageBubble message={{ id: 'streaming', role: 'assistant', content: streaming }} live />
      )}
      {isStreaming && streaming.length === 0 && (
        <div className="text-center text-[13px] font-medium text-[var(--text-muted)]">SeshatOS is thinking...</div>
      )}
      <div ref={endRef} />
    </div>
  )
}

function MessageBubble({ message, live = false }: { message: ChatMessage; live?: boolean }) {
  const isUser = message.role === 'user'
  const textBlocks = message.content.filter((block) => block.type === 'text')

  if (message.role === 'system') return null

  return (
    <article className={isUser ? 'flex justify-end' : 'flex justify-start'}>
      <div className={isUser ? 'max-w-[72%]' : 'w-full max-w-[760px]'}>
        <div className={isUser
          ? 'rounded-2xl bg-[var(--surface-panel)] px-4 py-3 text-[14px] leading-6 text-[var(--text-primary)] shadow-sm'
          : 'text-[14px] leading-7 text-[var(--text-primary)]'
        }>
          {message.content.map((block, index) => {
            if (block.type === 'text') return <TextBlock key={index} text={block.text} />
            if (block.type === 'thinking') return <ThinkingBlock key={index} text={block.thinking} />
            if (block.type === 'tool_use') return <ToolCard key={block.id || index} tool={block} />
            return null
          })}
          {live && textBlocks.length === 0 && <span className="text-[var(--text-muted)]">Working...</span>}
        </div>
      </div>
    </article>
  )
}

function TextBlock({ text }: { text: string }) {
  return <div className="whitespace-pre-wrap">{text}</div>
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
