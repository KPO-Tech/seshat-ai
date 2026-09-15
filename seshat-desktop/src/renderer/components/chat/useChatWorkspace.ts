import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useChatStore } from '@renderer/stores/chat'
import { createSession, fetchSession, fetchSessions, interruptSession, streamQuery } from './chatApi'
import { applyStreamEvent, mergeDoneIntoMessages } from './streaming'
import type { ChatMessage, QueryDone } from './chatTypes'

export function useChatWorkspace() {
  const sessions = useChatStore((state) => state.sessions)
  const activeSessionId = useChatStore((state) => state.activeSessionId)
  const streaming = useChatStore((state) => state.streaming)
  const isStreaming = useChatStore((state) => state.isStreaming)
  const setSessions = useChatStore((state) => state.setSessions)
  const setActiveSessionId = useChatStore((state) => state.setActiveSessionId)
  const upsertSession = useChatStore((state) => state.upsertSession)
  const addMessage = useChatStore((state) => state.addMessage)
  const setMessages = useChatStore((state) => state.setMessages)
  const setStreaming = useChatStore((state) => state.setStreaming)
  const clearStreaming = useChatStore((state) => state.clearStreaming)
  const setIsStreaming = useChatStore((state) => state.setIsStreaming)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId) ?? null,
    [activeSessionId, sessions]
  )

  useEffect(() => {
    let cancelled = false
    fetchSessions()
      .then((next) => {
        if (cancelled) return
        setSessions(next)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load sessions.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [setSessions])

  const openSession = useCallback(async (id: string | null) => {
    setActiveSessionId(id)
    if (!id) return
    try {
      const session = await fetchSession(id)
      upsertSession(session)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open session.')
    }
  }, [setActiveSessionId, upsertSession])

  const send = useCallback(async (prompt: string) => {
    const text = prompt.trim()
    if (!text || isStreaming) return
    setError(null)
    clearStreaming()

    let sessionId = activeSessionId
    if (!sessionId) {
      sessionId = await createSession()
      upsertSession({
        id: sessionId,
        title: text.slice(0, 64),
        messages: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      })
      setActiveSessionId(sessionId)
    }

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: [{ type: 'text', text }],
      status: 'sent'
    }
    const assistantId = crypto.randomUUID()
    const assistantMessage: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: []
    }
    addMessage(sessionId, userMessage)
    addMessage(sessionId, assistantMessage)

    const controller = new AbortController()
    abortRef.current = controller
    setIsStreaming(true)

    try {
      let liveBlocks = useChatStore.getState().streaming
      await streamQuery({
        prompt: text,
        sessionId,
        signal: controller.signal,
        onEvent: (event) => {
          if (event.event === 'done') {
            const done = event.data as QueryDone
            const current = useChatStore.getState().sessions.find((session) => session.id === sessionId)?.messages ?? []
            setMessages(sessionId, mergeDoneIntoMessages(current, done, assistantId, liveBlocks))
            return
          }
          if (event.event === 'error') {
            const data = event.data as { error?: string; message?: string }
            throw new Error(data.error ?? data.message ?? 'Streaming failed.')
          }
          liveBlocks = applyStreamEvent(liveBlocks, event)
          setStreaming(liveBlocks)
        }
      })
      const refreshed = await fetchSession(sessionId).catch(() => null)
      if (refreshed) upsertSession(refreshed)
    } catch (err) {
      if (controller.signal.aborted) return
      setError(err instanceof Error ? err.message : 'Message failed.')
      const current = useChatStore.getState().sessions.find((session) => session.id === sessionId)?.messages ?? []
      setMessages(sessionId, current.map((message) => message.id === assistantId ? {
        ...message,
        content: [{ type: 'text', text: err instanceof Error ? err.message : 'Message failed.' }]
      } : message))
    } finally {
      setIsStreaming(false)
      clearStreaming()
      abortRef.current = null
    }
  }, [activeSessionId, addMessage, clearStreaming, isStreaming, setActiveSessionId, setIsStreaming, setMessages, setStreaming, upsertSession])

  const stop = useCallback(async () => {
    abortRef.current?.abort()
    if (activeSessionId) await interruptSession(activeSessionId).catch(() => undefined)
    setIsStreaming(false)
    clearStreaming()
  }, [activeSessionId, clearStreaming, setIsStreaming])

  return { sessions, activeSession, streaming, isStreaming, loading, error, openSession, send, stop }
}
