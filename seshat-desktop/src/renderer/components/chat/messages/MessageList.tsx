import { useEffect, useRef } from 'react'
import type { ChatMessage, StreamingBlock } from '../lib/chatTypes'
import { AgentMessage } from './AgentMessage'
import { UserMessage } from './UserMessage'

export function MessageList({ sessionId, messages, streaming, isStreaming }: { sessionId: string; messages: ChatMessage[]; streaming: StreamingBlock[]; isStreaming: boolean }) {
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages, streaming])

  return (
    <div className="mx-auto flex w-full max-w-[850px] flex-col gap-6 px-4 pb-8 pt-8">
      {messages.map((message, index) => {
        const isLast = index === messages.length - 1
        return (
          <MessageBubble
            key={message.id || index}
            sessionId={sessionId}
            message={message}
            hidePendingAssistant={isStreaming && isLast}
          />
        )
      })}
      {isStreaming && streaming.length > 0 && (
        <AgentMessage sessionId={sessionId} message={{ id: 'streaming', role: 'assistant', content: streaming }} live />
      )}
      {isStreaming && streaming.length === 0 && (
        <AgentMessage sessionId={sessionId} message={{ id: 'streaming', role: 'assistant', content: [] }} live />
      )}
      <div ref={endRef} />
    </div>
  )
}

function MessageBubble({ sessionId, message, hidePendingAssistant }: { sessionId: string; message: ChatMessage; hidePendingAssistant?: boolean }) {
  if (message.role === 'system') return null
  if (message.role === 'user') return <UserMessage message={message} />
  if (hidePendingAssistant && message.content.length === 0 && message.status !== 'error') return null
  return <AgentMessage sessionId={sessionId} message={message} />
}
