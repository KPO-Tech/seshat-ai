import { useEffect, useRef } from 'react'
import type { ChatMessage, StreamingBlock } from '../lib/chatTypes'
import { AgentMessage } from './AgentMessage'
import { UserMessage } from './UserMessage'

export function MessageList({ messages, streaming, isStreaming }: { messages: ChatMessage[]; streaming: StreamingBlock[]; isStreaming: boolean }) {
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages, streaming])

  return (
    <div className="mx-auto flex w-full max-w-[850px] flex-col gap-6 px-4 pb-8 pt-8">
      {messages.map((message, index) => (
        <MessageBubble key={message.id || index} message={message} />
      ))}
      {isStreaming && streaming.length > 0 && (
        <AgentMessage message={{ id: 'streaming', role: 'assistant', content: streaming }} live />
      )}
      {isStreaming && streaming.length === 0 && (
        <AgentMessage message={{ id: 'streaming', role: 'assistant', content: [] }} live />
      )}
      <div ref={endRef} />
    </div>
  )
}

function MessageBubble({ message }: { message: ChatMessage }) {
  if (message.role === 'system') return null
  if (message.role === 'user') return <UserMessage message={message} />
  return <AgentMessage message={message} />
}
