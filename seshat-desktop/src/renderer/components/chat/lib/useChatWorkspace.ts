import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useChatStore } from '@renderer/stores/chat'
import { createSession, fetchSession, fetchSessions, interruptSession, streamQuery } from './chatApi'
import { applyStreamEvent, mergeDoneIntoMessages } from './streaming'
import type { ChatMessage, QueryDone } from './chatTypes'

type ChatModelSelection = {
  providerSettingId?: string
  modelId?: string
}

const TITLE_POLL_INTERVAL_MS = 3000
const TITLE_POLL_MAX_ATTEMPTS = 10

export function useChatWorkspace() {
  const sessions = useChatStore((state) => state.sessions)
  const activeSessionId = useChatStore((state) => state.activeSessionId)
  const streaming = useChatStore((state) => activeSessionId ? state.streamingBySession[activeSessionId] ?? [] : [])
  const isStreaming = useChatStore((state) => activeSessionId ? Boolean(state.isStreamingBySession[activeSessionId]) : false)
  const setSessions = useChatStore((state) => state.setSessions)
  const setActiveSessionId = useChatStore((state) => state.setActiveSessionId)
  const upsertSession = useChatStore((state) => state.upsertSession)
  const updateSession = useChatStore((state) => state.updateSession)
  const addMessage = useChatStore((state) => state.addMessage)
  const setMessages = useChatStore((state) => state.setMessages)
  const setStreaming = useChatStore((state) => state.setStreaming)
  const clearStreaming = useChatStore((state) => state.clearStreaming)
  const setIsStreaming = useChatStore((state) => state.setIsStreaming)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<Record<string, AbortController>>({})

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

  const send = useCallback(async (prompt: string, model?: ChatModelSelection) => {
    const text = prompt.trim()
    if (!text) return
    setError(null)

    let sessionId = activeSessionId
    if (!sessionId) {
      sessionId = await createSession(model)
      upsertSession({
        id: sessionId,
        title: text.slice(0, 64),
        messages: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'idle',
        providerSettingId: model?.providerSettingId,
        modelId: model?.modelId
      })
      setActiveSessionId(sessionId)
    }
    if (useChatStore.getState().isSessionStreaming(sessionId)) return
    clearStreaming(sessionId)

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
    abortRef.current[sessionId] = controller
    setIsStreaming(sessionId, true)

    try {
      let liveBlocks = useChatStore.getState().getStreaming(sessionId)
      await streamQuery({
        prompt: text,
        sessionId,
        providerSettingId: model?.providerSettingId,
        modelId: model?.modelId,
        signal: controller.signal,
        onEvent: (event) => {
          if (event.event === 'done') {
            const done = event.data as QueryDone
            const current = useChatStore.getState().sessions.find((session) => session.id === sessionId)?.messages ?? []
            setMessages(sessionId, mergeDoneIntoMessages(current, done, assistantId, liveBlocks))
            updateSession(sessionId, { status: 'completed', updatedAt: new Date().toISOString() })
            return
          }
          if (event.event === 'error') {
            const data = event.data as { error?: string; message?: string }
            throw new Error(data.error ?? data.message ?? 'Streaming failed.')
          }
          if (event.event === 'session_titled') {
            const data = event.data as { session_id?: string; title?: string }
            if (data.session_id === sessionId && data.title?.trim()) {
              updateSession(sessionId, { title: data.title.trim(), updatedAt: new Date().toISOString() })
            }
            return
          }
          liveBlocks = applyStreamEvent(liveBlocks, event)
          setStreaming(sessionId, liveBlocks)
        }
      })
      const refreshed = await fetchSession(sessionId).catch(() => null)
      if (refreshed) upsertSession(refreshed)
      const latest = useChatStore.getState().sessions.find((session) => session.id === sessionId)
      if (latest?.title === text.slice(0, 64)) {
        void pollForGeneratedTitle(sessionId, updateSession)
      }
    } catch (err) {
      if (controller.signal.aborted) return
      const messageText = err instanceof Error ? err.message : 'Message failed.'
      const current = useChatStore.getState().sessions.find((session) => session.id === sessionId)?.messages ?? []
      setMessages(sessionId, current.map((message) => message.id === assistantId ? {
        ...message,
        status: 'error' as const,
        content: [{ type: 'text', text: messageText }]
      } : message))
      updateSession(sessionId, { status: 'failed', updatedAt: new Date().toISOString() })
    } finally {
      setIsStreaming(sessionId, false)
      clearStreaming(sessionId)
      delete abortRef.current[sessionId]
    }
  }, [activeSessionId, addMessage, clearStreaming, setActiveSessionId, setIsStreaming, setMessages, setStreaming, updateSession, upsertSession])

  const stop = useCallback(async (sessionId = activeSessionId) => {
    if (!sessionId) return
    abortRef.current[sessionId]?.abort()
    await interruptSession(sessionId).catch(() => undefined)
    setIsStreaming(sessionId, false)
    clearStreaming(sessionId)
    updateSession(sessionId, { status: 'stopped', updatedAt: new Date().toISOString() })
  }, [activeSessionId, clearStreaming, setIsStreaming, updateSession])

  return { sessions, activeSession, streaming, isStreaming, loading, error, openSession, send, stop }
}

async function pollForGeneratedTitle(
  sessionId: string,
  updateSession: (id: string, patch: { title?: string; updatedAt?: string }) => void
) {
  for (let attempt = 0; attempt < TITLE_POLL_MAX_ATTEMPTS; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, TITLE_POLL_INTERVAL_MS))
    const session = await fetchSession(sessionId).catch(() => null)
    if (!session) continue
    const title = session?.title?.trim()
    if (!title || title === 'New task') continue
    updateSession(sessionId, { title, updatedAt: session.updatedAt })
    return
  }
}
