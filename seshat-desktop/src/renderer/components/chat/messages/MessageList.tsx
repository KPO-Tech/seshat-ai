import { useEffect, useRef, type RefObject } from 'react'
import type { ChatMessage, StreamingBlock } from '../lib/chatTypes'
import { AgentMessage } from './AgentMessage'
import { UserMessage } from './UserMessage'

// How close to the bottom (in px) still counts as "at the bottom" for
// auto-scroll purposes - a little slack so a user who's basically caught up
// but a few pixels off (e.g. mid-momentum-scroll) doesn't get treated as
// "reading history."
const AT_BOTTOM_THRESHOLD_PX = 60

export function MessageList({ containerRef, sessionId, messages, streaming, isStreaming, onRetry, contextWindow }: {
  containerRef: RefObject<HTMLDivElement | null>
  sessionId: string
  messages: ChatMessage[]
  streaming: StreamingBlock[]
  isStreaming: boolean
  onRetry?: (text: string) => void
  contextWindow?: number
}) {
  const endRef = useRef<HTMLDivElement>(null)
  const isAtBottomRef = useRef(true)
  const scrollRafRef = useRef<number | null>(null)
  const lastSessionIdRef = useRef(sessionId)

  // Track whether the user is at the bottom so streaming/new-message
  // updates only auto-scroll when they're already following along -
  // otherwise scrolling up to read history gets yanked back down on every
  // token, a real, frequently-cited chat-UI annoyance.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onScroll = () => {
      isAtBottomRef.current = el.scrollTop + el.clientHeight >= el.scrollHeight - AT_BOTTOM_THRESHOLD_PX
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [containerRef])

  // Switching sessions (or a brand-new session's first message) always
  // jumps to the bottom regardless of prior scroll position - there's no
  // "history" the user was reading in a conversation they just opened.
  useEffect(() => {
    if (lastSessionIdRef.current === sessionId) return
    lastSessionIdRef.current = sessionId
    isAtBottomRef.current = true
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [sessionId])

  // Auto-scroll on new messages or streaming tokens, but only if already
  // near the bottom - and throttled to once per animation frame, since
  // `streaming` gets a new array reference on every batched sync (still far
  // more often than once per frame during a dense response).
  useEffect(() => {
    if (!isAtBottomRef.current) return
    if (scrollRafRef.current !== null) return
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null
      if (isAtBottomRef.current) endRef.current?.scrollIntoView({ block: 'end' })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, streaming])

  useEffect(() => {
    return () => {
      if (scrollRafRef.current !== null) cancelAnimationFrame(scrollRafRef.current)
    }
  }, [])

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
            onRetry={onRetry}
            contextWindow={contextWindow}
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

function MessageBubble({ sessionId, message, hidePendingAssistant, onRetry, contextWindow }: { sessionId: string; message: ChatMessage; hidePendingAssistant?: boolean; onRetry?: (text: string) => void; contextWindow?: number }) {
  if (message.role === 'system') return null
  if (message.role === 'user') return <UserMessage message={message} onRetry={onRetry} />
  if (hidePendingAssistant && message.content.length === 0 && message.status !== 'error') return null
  return <AgentMessage sessionId={sessionId} message={message} contextWindow={contextWindow} />
}
