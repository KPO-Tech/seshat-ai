import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useChatStore } from '@renderer/stores/chat'
import { useBrowserStore } from '@renderer/stores/browser'
import { useTerminalStore } from '@renderer/stores/terminal'
import { useTaskStore } from '@renderer/stores/tasks'
import { useAgentStore } from '@renderer/stores/agents'
import { createSession, fetchSession, fetchSessions, interruptSession, patchSessionMetadata, streamQuery, type RetryableError } from './chatApi'
import { applyStreamEvent, mergeDoneIntoMessages } from './streaming'
import { uploadSessionFile } from '../attachments/attachmentApi'
import type { ChatContentBlock, ChatExecutionMode, ChatMessage, MessageAttachment, QueryDone, RuntimeEvent } from './chatTypes'

type ChatModelSelection = {
  providerSettingId?: string
  modelId?: string
}

const TITLE_POLL_INTERVAL_MS = 3000
const TITLE_POLL_MAX_ATTEMPTS = 10
const MAX_RETRIES = 3
const RETRY_BASE_MS = 1000
// Ceiling for "the connection looks fine but the server never responds at
// all" - distinct from the network-drop retry below, which only fires on a
// detected disconnect. Mirrors seshat-ui's own useChat.ts precedent.
const WATCHDOG_TIMEOUT_MS = 150_000

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
  const [draftExecutionMode, setDraftExecutionMode] = useState<ChatExecutionMode>('execute')
  const abortRef = useRef<Record<string, AbortController>>({})
  // Tracks a pending requestAnimationFrame per session, batching live-block
  // publishes to the chat/browser/task/agent stores to once per frame -
  // without this, every SSE token triggers 4 store updates + re-renders.
  const syncRafRef = useRef<Record<string, number>>({})

  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId) ?? null,
    [activeSessionId, sessions]
  )
  const executionMode = activeSession?.executionMode ?? draftExecutionMode

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

  const setExecutionMode = useCallback(async (mode: ChatExecutionMode) => {
    setError(null)
    setDraftExecutionMode(mode)
    if (!activeSessionId) return

    const previous = useChatStore.getState().sessions.find((session) => session.id === activeSessionId)?.executionMode ?? 'execute'
    updateSession(activeSessionId, { executionMode: mode, updatedAt: new Date().toISOString() })
    try {
      await patchSessionMetadata(activeSessionId, { executionMode: mode })
    } catch (err) {
      updateSession(activeSessionId, { executionMode: previous, updatedAt: new Date().toISOString() })
      setDraftExecutionMode(previous)
      setError(err instanceof Error ? err.message : 'Failed to update execution mode.')
    }
  }, [activeSessionId, updateSession])

  const send = useCallback(async (prompt: string, model?: ChatModelSelection, files: File[] = []) => {
    const text = prompt.trim()
    if (!text && files.length === 0) return
    const requestText = text || 'Review the attached files.'
    const initialTitle = (text || files[0]?.name || 'New task').slice(0, 64)
    setError(null)

    let sessionId = activeSessionId
    if (!sessionId) {
      try {
        sessionId = await createSession(model)
        await patchSessionMetadata(sessionId, { executionMode: draftExecutionMode })
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create session.')
        return
      }
      upsertSession({
        id: sessionId,
        title: initialTitle,
        messages: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'idle',
        providerSettingId: model?.providerSettingId,
        modelId: model?.modelId,
        executionMode: draftExecutionMode
      })
      setActiveSessionId(sessionId)
    }
    if (useChatStore.getState().isSessionStreaming(sessionId)) return
    await useTerminalStore.getState().attachSession(sessionId)
    const browserStore = useBrowserStore.getState()
    const taskStore = useTaskStore.getState()
    const agentStore = useAgentStore.getState()
    clearStreaming(sessionId)

    let attachments: MessageAttachment[] = []
    try {
      attachments = await Promise.all(files.map((file) => uploadSessionFile(sessionId, file)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload attachments.')
      return
    }

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text ? [{ type: 'text', text }] : [],
      metadata: attachments.length > 0 ? { attachments } : undefined,
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

    // Watchdog: aborts the turn if no server activity (chunk/runtime event)
    // arrives within WATCHDOG_TIMEOUT_MS of the last one - covers the case
    // where the connection never drops (so the retry-on-network-error path
    // below never triggers) but the server also never responds. Reset on
    // every sign of life, cleared once 'done' arrives or in the outer finally.
    let watchdogTimedOut = false
    let watchdogTimer: ReturnType<typeof setTimeout> | null = null
    const resetWatchdog = () => {
      if (watchdogTimer !== null) clearTimeout(watchdogTimer)
      watchdogTimer = setTimeout(() => {
        watchdogTimedOut = true
        controller.abort()
      }, WATCHDOG_TIMEOUT_MS)
    }
    resetWatchdog()

    // Cancel any stale RAF from a prior turn on this session (defensive).
    const staleRaf = syncRafRef.current[sessionId]
    if (staleRaf !== undefined) {
      cancelAnimationFrame(staleRaf)
      delete syncRafRef.current[sessionId]
    }

    let liveBlocks = useChatStore.getState().getStreaming(sessionId)
    // scheduleSync batches the 4 store publishes (chat/browser/task/agent)
    // to once per animation frame - without this, every streamed token
    // triggers 4 store updates + re-renders. flushSync cancels any pending
    // frame and publishes immediately (used at turn boundaries: done/error/stop).
    const publishLiveBlocks = () => {
      setStreaming(sessionId, liveBlocks)
      browserStore.ingestBlocks(sessionId, liveBlocks)
      taskStore.ingestBlocks(sessionId, liveBlocks)
      agentStore.ingestBlocks(sessionId, liveBlocks)
    }
    const scheduleSync = () => {
      if (syncRafRef.current[sessionId] !== undefined) return
      syncRafRef.current[sessionId] = requestAnimationFrame(() => {
        delete syncRafRef.current[sessionId]
        publishLiveBlocks()
      })
    }
    const flushSync = () => {
      const pending = syncRafRef.current[sessionId]
      if (pending !== undefined) {
        cancelAnimationFrame(pending)
        delete syncRafRef.current[sessionId]
      }
      publishLiveBlocks()
    }

    try {
      let retryAttempt = 0

      while (true) {
        let streamError: unknown = null
        // Set as soon as this attempt observes any real activity from the
        // backend - proof the agent turn is actually running server-side,
        // possibly already executing tools with side effects (bash, file
        // writes, external API calls). Once true, a dropped connection must
        // NOT be silently retried by resubmitting the same prompt, since the
        // backend has no idempotency key to tell a retry apart from a
        // brand-new turn - that would start a second, duplicate agent turn
        // on top of the first instead of resuming it.
        let receivedServerActivity = false

        try {
          await streamQuery({
            prompt: requestText,
            sessionId,
            providerSettingId: model?.providerSettingId,
            modelId: model?.modelId,
            fileIds: attachments.map((attachment) => attachment.id),
            signal: controller.signal,
            onEvent: (event) => {
              if (event.event === 'done') {
                if (watchdogTimer !== null) clearTimeout(watchdogTimer)
                const done = event.data as QueryDone
                const current = useChatStore.getState().sessions.find((session) => session.id === sessionId)?.messages ?? []
                const merged = mergeDoneIntoMessages(current, done, assistantId, liveBlocks)
                setMessages(sessionId, merged)
                browserStore.ingestBlocks(sessionId, contentBlocksFromMessages(merged))
                taskStore.ingestBlocks(sessionId, contentBlocksFromMessages(merged))
                agentStore.ingestBlocks(sessionId, contentBlocksFromMessages(merged))
                updateSession(sessionId, { status: 'completed', updatedAt: new Date().toISOString() })
                flushSync()
                return
              }
              if (event.event === 'error') {
                const data = event.data as { error?: string; message?: string }
                throw new Error(data.error ?? data.message ?? 'Streaming failed.')
              }
              receivedServerActivity = true
              resetWatchdog()
              if (event.event === 'session_titled') {
                const data = event.data as { session_id?: string; title?: string }
                if (data.session_id === sessionId && data.title?.trim()) {
                  updateSession(sessionId, { title: data.title.trim(), updatedAt: new Date().toISOString() })
                }
                return
              }
              if (event.event === 'runtime') {
                agentStore.ingestEvent(sessionId, event.data as RuntimeEvent, liveBlocks)
              }
              liveBlocks = applyStreamEvent(liveBlocks, event)
              scheduleSync()
            }
          })
        } catch (streamErr) {
          streamError = streamErr
        }

        if (streamError === null) break // clean exit (done arrived)

        const isAbort = controller.signal.aborted || (streamError instanceof DOMException && streamError.name === 'AbortError')
        if (isAbort) throw streamError

        // TypeError = "Failed to fetch" / network drop on the browser-fetch
        // fallback path; an explicit `.retryable` tag on the Electron path
        // (see chatApi.ts's makeRetryableError - the real error lives in the
        // main process and doesn't survive the IPC boundary as a TypeError).
        const isRetryableNetworkDrop =
          streamError instanceof TypeError || (streamError as RetryableError | undefined)?.retryable === true
        if (retryAttempt < MAX_RETRIES && isRetryableNetworkDrop && !receivedServerActivity) {
          retryAttempt += 1
          const delay = RETRY_BASE_MS * (2 ** (retryAttempt - 1)) // 1s, 2s, 4s
          liveBlocks = [{ type: 'text', text: `> Connection lost. Reconnecting (attempt ${retryAttempt}/${MAX_RETRIES})…` }]
          flushSync()
          await new Promise<void>((resolve) => setTimeout(resolve, delay))
          if (controller.signal.aborted) break
          continue
        }

        throw streamError
      }

      const refreshed = await fetchSession(sessionId).catch(() => null)
      if (refreshed) upsertSession(refreshed)
      const latest = useChatStore.getState().sessions.find((session) => session.id === sessionId)
      if (latest?.title === initialTitle) {
        void pollForGeneratedTitle(sessionId, updateSession)
      }
    } catch (err) {
      // A watchdog-triggered abort looks identical to a user Stop at the
      // AbortError level, but it isn't one - the turn stalled, not the
      // user's choice, so unlike a real Stop it must surface as a visible
      // failure rather than silently preserving partial content as "done."
      const isUserStop = !watchdogTimedOut && controller.signal.aborted
      flushSync()
      const current = useChatStore.getState().sessions.find((session) => session.id === sessionId)?.messages ?? []
      if (isUserStop) {
        setMessages(sessionId, current.map((message) => message.id === assistantId ? {
          ...message,
          status: 'stopped' as const,
          content: liveBlocks.length > 0 ? (liveBlocks as ChatContentBlock[]) : message.content
        } : message))
        updateSession(sessionId, { status: 'stopped', updatedAt: new Date().toISOString() })
      } else {
        const messageText = watchdogTimedOut
          ? 'No response from the agent. The connection may have stalled.'
          : err instanceof Error ? err.message : 'Message failed.'
        setMessages(sessionId, current.map((message) => message.id === assistantId ? {
          ...message,
          status: 'error' as const,
          content: [...(liveBlocks as ChatContentBlock[]), { type: 'text', text: messageText }]
        } : message.id === userMessage.id ? { ...message, status: 'error' as const } : message))
        updateSession(sessionId, { status: 'failed', updatedAt: new Date().toISOString() })
      }
    } finally {
      if (watchdogTimer !== null) clearTimeout(watchdogTimer)
      const pending = syncRafRef.current[sessionId]
      if (pending !== undefined) {
        cancelAnimationFrame(pending)
        delete syncRafRef.current[sessionId]
      }
      setIsStreaming(sessionId, false)
      clearStreaming(sessionId)
      delete abortRef.current[sessionId]
    }
  }, [activeSessionId, addMessage, clearStreaming, draftExecutionMode, setActiveSessionId, setIsStreaming, setMessages, setStreaming, updateSession, upsertSession])

  const stop = useCallback(async (sessionId = activeSessionId) => {
    if (!sessionId) return
    // Aborting here lets send()'s own catch/finally own the full stop
    // lifecycle (committing whatever partial content already streamed,
    // clearing the streaming buffer, flipping isStreaming off) - clearing
    // any of that state here first would race send() and could wipe the
    // partial content before it gets committed to the message.
    abortRef.current[sessionId]?.abort()
    await interruptSession(sessionId).catch(() => undefined)
  }, [activeSessionId])

  return { sessions, activeSession, streaming, isStreaming, loading, error, executionMode, openSession, send, stop, setExecutionMode }
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

function contentBlocksFromMessages(messages: ChatMessage[]) {
  const blocks: ChatContentBlock[] = []
  for (const message of messages) blocks.push(...message.content)
  return blocks
}
