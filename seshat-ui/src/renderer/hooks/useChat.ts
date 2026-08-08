import { useCallback, useRef } from 'react'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import { streamingToContentBlocks, useSessionStore, type MessageAttachment } from '@/stores/session'
import { useUIStore } from '@/stores/ui'
import { findLatestToolUseByName, normalizeSessionMessages, statusFromResult, toolResultFromDone } from '@/lib/chat'
import { permissionSignature } from '@/lib/permissionSignature'
import {
  abortController as abortSharedController,
  clearController as clearSharedController,
  clearStopRequested,
  isStopRequested,
  markStopRequested,
  registerController,
} from './chatControllers'
import { isUntitledSessionTitle } from '@/lib/sessionTitle'
import type { Message, RAGSearchResult, Session, StreamEvent, TokenUsage, ToolApproval, ToolPromptRequest, ToolStatus } from '@/api/types'
import type { StreamingBlock, ToolActivity } from '@/stores/session'

type RuntimeEventPayload = {
  type: string
  // When set, this event originates from a sub-agent identified by this tool use ID.
  agent_tool_use_id?: string
  turn_number?: number
  execution_mode?: string
  stop_reason?: string
  usage?: { input_tokens?: number; output_tokens?: number }
  // response.chunk events carry the chunk payload for sub-agent streaming
  chunk?: StreamEvent
  tool_progress?: {
    tool_name: string
    tool_use_id?: string
    stage: 'pending' | 'running' | 'completed' | 'failed'
    message?: string
    percent_complete?: number
    metadata?: Record<string, unknown>
  }
  permission_request?: {
    tool_use_id: string
    tool_name: string
    tool_input?: Record<string, unknown>
    description?: string
  }
  prompt_request?: {
    type: 'choice' | 'text' | 'confirm'
    message: string
    options?: Array<{ label: string; value: unknown; description?: string }>
    default?: unknown
    metadata?: Record<string, unknown>
  }
  plan_event?: {
    plan_id: string
    slug: string
    filename: string
    status: string
    version: number
  }
  // Carried by agent.spawn.begin/end, agent.wait.*, agent.interaction.*, and
  // agent.close.* — see AgentRuntimeEvent in the engine. agent_id is the
  // stable identifier returned by spawn_agent, distinct from the tool_use_id
  // used as the sub-agent's key everywhere else in this file; it is needed to
  // call the cancel endpoint (POST /subagents/{agent_id}/cancel).
  agent_event?: {
    call_id: string
    agent_id: string
    agent_nickname?: string
    agent_role?: string
    status?: string
  }
  error?: string
}

type DonePayload = {
  messages?: Message[]
  tool_results?: Array<{ id: string; content: string; is_error?: boolean; duration_ms?: number; metadata?: Record<string, unknown> }>
  rag_results?: RAGSearchResult[]
  // Present on the backend's queryResponse (see seshat-backend/internal/api/query.go)
  // but previously parsed off the wire and discarded — the Agent Monitor's stat
  // display only ever reflected the last turn.completed event, which can be
  // stale for multi-turn responses since `done` carries the authoritative final
  // snapshot for the whole exchange. See commitDonePayload.
  stop_reason?: string
  turn_number?: number
  usage?: TokenUsage
}

const MAX_RETRIES = 3
const RETRY_BASE_MS = 1000

// The backend's OnSessionTitled callback (see seshat-backend's bootstrap.go)
// only fires once the SDK's own background title-generation LLM call
// returns, up to ~30s after the first turn completes - there's no push
// channel for a one-shot, non-urgent update like this, so a short poll
// after the first message's turn finishes is the simplest way to pick it
// up. Gives up silently after ~30s; the session just keeps showing
// "Untitled conversation" if generation failed or took longer than that.
const TITLE_POLL_INTERVAL_MS = 3000
const TITLE_POLL_MAX_ATTEMPTS = 10

async function pollForGeneratedTitle(sessionId: string) {
  for (let attempt = 0; attempt < TITLE_POLL_MAX_ATTEMPTS; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, TITLE_POLL_INTERVAL_MS))
    try {
      const detail = await api.get<Session>(`/sessions/${sessionId}`)
      if (!isUntitledSessionTitle(detail.title)) {
        useSessionStore.getState().updateSession(sessionId, { title: detail.title })
        return
      }
    } catch {
      return // best effort - don't keep retrying against a failing backend
    }
  }
}

export function useChat(sessionId: string) {
  const isStreaming = useSessionStore((s) => Boolean(s.isStreamingBySession[sessionId]))
  // Tracks a pending requestAnimationFrame for batching assistant-message syncs.
  // Without batching, every SSE token triggers a full store.updateMessage call.
  const syncRafRef = useRef<number | null>(null)

  const sendMessage = useCallback(async (text: string, opts?: { corpusId?: string | null; fileIds?: string[]; attachments?: MessageAttachment[]; agentSlug?: string }) => {
    const store = useSessionStore.getState()
    if (store.isSessionStreaming(sessionId)) return

    const prompt = text.trim()
    if (!prompt) return
    const nowIso = new Date().toISOString()

    const assistantMessageId = crypto.randomUUID()
    const currentSession = store.sessions.find((session) => session.id === sessionId)
    // The title is left as "Untitled conversation" here rather than derived
    // from the prompt - the SDK generates a real short AI title in the
    // background once this turn completes (see pollForGeneratedTitle below
    // and seshat-backend's OnSessionTitled wiring), so this is genuinely
    // the session's very first message only when it's still untitled.
    const isFirstMessage = Boolean(currentSession && currentSession.messages.length === 0 && isUntitledSessionTitle(currentSession.title))
    store.updateSession(sessionId, { updatedAt: nowIso })
    store.addMessage(sessionId, {
      role: 'user',
      content: [{ type: 'text', text: prompt }],
      metadata: opts?.attachments?.length ? { attachments: opts.attachments } : undefined,
    })
    store.addMessage(sessionId, { id: assistantMessageId, role: 'assistant', content: [] })
    store.setIsStreaming(sessionId, true)
    store.clearStreaming(sessionId)
    store.updateAgentState(sessionId, { isThinking: true, activeTool: null })
    const abortController = new AbortController()
    registerController(sessionId, abortController)
    clearStopRequested(sessionId)

    // Cancel any stale RAF from a prior message (defensive).
    if (syncRafRef.current !== null) {
      cancelAnimationFrame(syncRafRef.current)
      syncRafRef.current = null
    }

    const token = useAuthStore.getState().token
    const permissionMode = useUIStore.getState().permissionMode
    let committed = false
    let pendingTool: ToolActivity | null = null

    // scheduleSync batches assistant-message store updates to once per animation frame.
    // Without this, every streamed token triggers updateMessage + React re-render.
    const scheduleSync = () => {
      if (syncRafRef.current !== null) return
      syncRafRef.current = requestAnimationFrame(() => {
        syncRafRef.current = null
        syncAssistantPlaceholder(sessionId, assistantMessageId, useSessionStore.getState())
      })
    }

    // flushSync cancels any pending RAF and syncs immediately (used at done/error boundaries).
    const flushSync = () => {
      if (syncRafRef.current !== null) {
        cancelAnimationFrame(syncRafRef.current)
        syncRafRef.current = null
      }
      syncAssistantPlaceholder(sessionId, assistantMessageId, useSessionStore.getState())
    }

    try {
      let retryAttempt = 0

      while (true) {
        let streamError: unknown = null
        // Set as soon as this attempt observes any real activity from the backend
        // (a runtime event or a content chunk) — proof the agent turn is actually
        // running server-side, and possibly already executing tools with side
        // effects (bash, file writes, external API calls). Once true, a dropped
        // connection must NOT be silently retried by resubmitting the same prompt,
        // since that would start a second, duplicate agent turn on top of the
        // first one instead of resuming it (the backend has no idempotency key).
        let receivedServerActivity = false

        try {
          const body = {
            prompt,
            session_id: sessionId,
            permission_mode: permissionMode,
            ...(opts?.corpusId ? { corpus_id: opts.corpusId } : {}),
            ...(opts?.fileIds?.length ? { file_ids: opts.fileIds } : {}),
            ...(opts?.agentSlug ? { agent_slug: opts.agentSlug } : {}),
          }
          if (window.nexus?.http) {
            await consumeElectronStream(
              body,
              abortController.signal,
              (donePayload) => {
                commitDonePayload(sessionId, assistantMessageId, donePayload, store)
                openKnowledgePanel(sessionId, donePayload.rag_results)
                store.clearStreaming(sessionId)
                committed = true
                flushSync()
              },
              (runtimeEvent) => {
                receivedServerActivity = true
                handleRuntimeEvent(sessionId, runtimeEvent, store, (tool) => {
                  pendingTool = tool
                }, () => pendingTool, scheduleSync)
              },
              (streamEvent) => {
                receivedServerActivity = true
                handleStreamChunk(sessionId, streamEvent, store, scheduleSync)
              },
            )
          } else {
            const res = await fetch(`http://127.0.0.1:8090/api/v1/query/stream`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Accept: 'text/event-stream',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
              },
              signal: abortController.signal,
              body: JSON.stringify(body),
            })

            if (!res.ok) {
              const errText = await res.text().catch(() => res.statusText)
              let msg = errText || `HTTP ${res.status}`
              try {
                msg = (JSON.parse(errText) as { error?: string }).error ?? msg
              } catch {
                // noop
              }
              throw new Error(msg)
            }

            const SSE_SUPPORTED_VERSION = '1'
            const sseVersion = res.headers.get('X-SSE-Version')
            if (sseVersion && sseVersion !== SSE_SUPPORTED_VERSION) {
              throw new Error(`Unsupported SSE protocol version: expected ${SSE_SUPPORTED_VERSION}, got ${sseVersion}`)
            }

            const reader = res.body?.getReader()
            if (!reader) throw new Error('No response body')

            const dec = new TextDecoder()
            let buf = ''
            let eventName = ''

            try {
              outer: while (true) {
                const { done, value } = await reader.read()
                if (done) break

                buf += dec.decode(value, { stream: true })
                const lines = buf.split('\n')
                buf = lines.pop() ?? ''

                for (const line of lines) {
                  if (line.startsWith('event: ')) {
                    eventName = line.slice(7).trim()
                    continue
                  }
                  if (line === '') {
                    eventName = ''
                    continue
                  }
                  if (!line.startsWith('data: ')) continue

                  const raw = line.slice(6).trim()
                  let parsed: Record<string, unknown>
                  try {
                    parsed = JSON.parse(raw) as Record<string, unknown>
                  } catch {
                    continue
                  }

                  if (eventName === 'error') {
                    throw new Error((parsed.error as string) || 'Streaming error')
                  }

                  if (eventName === 'done') {
                    const donePayload = parsed as DonePayload
                    commitDonePayload(sessionId, assistantMessageId, donePayload, store)
                    openKnowledgePanel(sessionId, donePayload.rag_results)
                    store.clearStreaming(sessionId)
                    committed = true
                    flushSync()
                    break outer
                  }

                  receivedServerActivity = true

                  if (eventName === 'runtime') {
                    handleRuntimeEvent(sessionId, parsed as RuntimeEventPayload, store, (tool) => {
                      pendingTool = tool
                    }, () => pendingTool, scheduleSync)
                    continue
                  }

                  handleStreamChunk(sessionId, parsed as StreamEvent, store, scheduleSync)
                }
              }
            } finally {
              try {
                reader.releaseLock()
              } catch {
                // noop
              }
            }
          }

        } catch (error) {
          streamError = error
        }

        if (streamError === null) break // clean exit

        const isAbort =
          isStopRequested(sessionId) ||
          (streamError instanceof DOMException && (streamError as DOMException).name === 'AbortError')

        if (isAbort || committed) throw streamError

        // TypeError = "Failed to fetch" / network drop — retryable, but only when the
        // backend never got the chance to start the turn (no chunk/runtime event was
        // observed yet). If it did, the backend has no idempotency key to tell a retry
        // apart from a brand-new turn, so resubmitting here could duplicate tool calls
        // that already ran (bash commands, file writes, external API calls). In that
        // case we fall through to surfacing a connection error instead, preserving
        // whatever partial content already streamed.
        //
        // Two ways a network drop surfaces here: `instanceof TypeError` on the
        // browser-fetch fallback path (a real TypeError, same as any web app),
        // or an explicit `.retryable` tag on the Electron path, where the
        // underlying error and its type live in the main process and don't
        // survive the IPC boundary — see makeRetryableError above.
        const isRetryableNetworkDrop =
          streamError instanceof TypeError || (streamError as RetryableError | undefined)?.retryable === true
        if (retryAttempt < MAX_RETRIES && isRetryableNetworkDrop && !receivedServerActivity) {
          retryAttempt++
          const delay = RETRY_BASE_MS * (2 ** (retryAttempt - 1)) // 1s, 2s, 4s
          store.updateMessage(sessionId, assistantMessageId, (msg) => ({
            ...msg,
            content: [{ type: 'text' as const, text: `> Connection lost. Reconnecting (attempt ${retryAttempt}/${MAX_RETRIES})…` }],
          }))
          await new Promise<void>((resolve) => setTimeout(resolve, delay))
          if (isStopRequested(sessionId)) break
          store.clearStreaming(sessionId)
          continue
        }

        throw streamError
      }

      if (!committed) {
        flushSync()
        const content = streamingToContentBlocks(useSessionStore.getState().getStreaming(sessionId))
        store.updateMessage(sessionId, assistantMessageId, (message) => ({
          ...message,
          content: content.length > 0 ? content : [{ type: 'text', text: '(empty response)' }],
        }))
        store.clearStreaming(sessionId)
      }
    } catch (error) {
      if (committed) return
      if (isStopRequested(sessionId) || (error instanceof DOMException && error.name === 'AbortError')) {
        flushSync()
        const partial = streamingToContentBlocks(useSessionStore.getState().getStreaming(sessionId))
        store.updateMessage(sessionId, assistantMessageId, (message) => ({
          ...message,
          content: partial,
        }))
        store.clearStreaming(sessionId)
        return
      }
      const errMsg = error instanceof Error ? error.message : 'Unable to reach the backend.'
      const partial = streamingToContentBlocks(useSessionStore.getState().getStreaming(sessionId))
      const content = [...partial, { type: 'text' as const, text: `> Connection error\n\n${errMsg}` }]
      store.updateMessage(sessionId, assistantMessageId, (message) => ({ ...message, content }))
      store.clearStreaming(sessionId)
    } finally {
      if (syncRafRef.current !== null) {
        cancelAnimationFrame(syncRafRef.current)
        syncRafRef.current = null
      }
      clearSharedController(sessionId)
      clearStopRequested(sessionId)
      store.setIsStreaming(sessionId, false)
      store.updateAgentState(sessionId, { isThinking: false, activeTool: null, pendingPermission: null })
      // Only the first turn triggers server-side title generation at all
      // (see the engine's TotalTurns==1 check) - and only once it actually
      // completed (committed), since an aborted/failed turn never reaches
      // that point server-side either.
      if (committed && isFirstMessage) {
        void pollForGeneratedTitle(sessionId)
      }
    }
  }, [sessionId])

  const stopMessage = useCallback(async () => {
    const store = useSessionStore.getState()
    if (!sessionId || !store.isSessionStreaming(sessionId)) return

    // markStopRequested/abortSharedController operate on the shared registry
    // (see chatControllers.ts), not a ref local to this hook instance — the
    // turn may have been started by a different useChat(sessionId) caller
    // (e.g. PlanEditorPanel's own hook after "Proceed"), and this needs to
    // reach that instance's in-flight fetch/EventSource, not just this one's.
    markStopRequested(sessionId)
    try {
      await api.post(`/sessions/${sessionId}/interrupt`)
    } catch {
      // Best effort — local abort below still stops the UI stream immediately.
    } finally {
      abortSharedController(sessionId)
    }
  }, [sessionId])

  return { isStreaming, sendMessage, stopMessage }
}

// An Error tagged with whether useChat's retry loop may safely resubmit the
// prompt for it — see isRetryableNetworkError in main/ipc/backend.ts for why
// this can't just be `instanceof TypeError` on the Electron path: the real
// error (and its type) lives in the main process, and Electron's IPC only
// carries a message string across to here, so the main process tags
// retryability explicitly instead.
type RetryableError = Error & { retryable?: boolean }

function makeRetryableError(message: string, retryable: boolean): RetryableError {
  const error: RetryableError = new Error(message)
  error.retryable = retryable
  return error
}

async function consumeElectronStream(
  body: Record<string, unknown>,
  signal: AbortSignal,
  onDone: (payload: DonePayload) => void,
  onRuntime: (payload: RuntimeEventPayload) => void,
  onChunk: (payload: StreamEvent) => void,
) {
  if (!window.nexus?.http) {
    throw new Error('Electron HTTP bridge is unavailable')
  }

  const startResult = await window.nexus.http.startStream({
    path: '/query/stream',
    method: 'POST',
    body,
  })
  if ('error' in startResult) {
    if (startResult.unauthorized) {
      // The main process already cleared the OS-keychain session (see
      // startStream in main/ipc/backend.ts) — this store also needs clearing
      // so AuthGuard redirects to /login instead of the UI staying on a
      // session the backend has already invalidated.
      useAuthStore.getState().logout()
    }
    throw makeRetryableError(startResult.error, startResult.retryable)
  }
  const { streamId } = startResult

  await new Promise<void>((resolve, reject) => {
    let settled = false
    const unsubscribe = window.nexus.http!.onStreamEvent(streamId, ({ name, data }) => {
      if (settled) return
      if (name === 'error') {
        settled = true
        unsubscribe()
        cleanupAbort()
        reject(makeRetryableError((data.error as string) || 'Streaming error', data.retryable === true))
        return
      }
      if (name === 'done') {
        settled = true
        unsubscribe()
        cleanupAbort()
        onDone(data as DonePayload)
        resolve()
        return
      }
      if (name === 'runtime') {
        onRuntime(data as RuntimeEventPayload)
        return
      }
      onChunk(data as StreamEvent)
    })

    const onAbort = () => {
      if (settled) return
      settled = true
      unsubscribe()
      cleanupAbort()
      void window.nexus?.http?.cancelStream(streamId).catch(() => {
        // noop
      })
      reject(new DOMException('Aborted', 'AbortError'))
    }

    const cleanupAbort = () => signal.removeEventListener('abort', onAbort)
    signal.addEventListener('abort', onAbort, { once: true })

    if (signal.aborted) {
      onAbort()
    }
  })
}

function handleStreamChunk(
  sessionId: string,
  event: StreamEvent,
  store: ReturnType<typeof useSessionStore.getState>,
  syncAssistantMessage: () => void,
) {
  switch (event.type) {
    // Ignored events — exit before any work (no cloneStreaming call).
    case 'message_delta':
    case 'content_block_stop':
    case 'message_stop':
    case 'error':
      return

    case 'content_block_start': {
      const streaming = cloneStreaming(sessionId, store)
      if (event.content_block.type === 'tool_result') return
      if (event.content_block.type === 'tool_use') {
        streaming.push({
          type: 'tool_use',
          index: streaming.length,
          id: event.content_block.id,
          name: event.content_block.name,
          input: { ...event.content_block.input },
          metadata: event.content_block.metadata,
          _status: 'pending',
          _approval: undefined,
          _result: undefined,
          _partialInput: '',
          _message: undefined,
        })
      } else if (event.content_block.type === 'thinking') {
        streaming.push({ type: 'thinking', index: streaming.length, thinking: event.content_block.thinking ?? '' })
      } else {
        streaming.push({ type: 'text', index: streaming.length, text: event.content_block.text ?? '' })
      }
      store.setStreaming(sessionId, streaming)
      syncAssistantMessage()
      return
    }

    case 'content_block_delta': {
      // Fast path: last block matches expected type — shallow-clone only the modified block.
      // This is the hot path (fired on every streamed token). Avoids the O(n) deep clone
      // of all blocks that cloneStreaming() would perform.
      const rawStreaming = store.getStreaming(sessionId)
      const lastIdx = rawStreaming.length - 1
      const last = lastIdx >= 0 ? rawStreaming[lastIdx] : null

      if (last) {
        if (last.type === 'text' && (!event.delta_type || event.delta_type === 'text_delta')) {
          store.setStreaming(sessionId, [...rawStreaming.slice(0, lastIdx), { ...last, text: last.text + (event.delta ?? '') }])
          syncAssistantMessage()
          return
        }
        if (last.type === 'thinking' && event.delta_type === 'thinking_delta') {
          store.setStreaming(sessionId, [...rawStreaming.slice(0, lastIdx), { ...last, thinking: last.thinking + (event.delta ?? '') }])
          syncAssistantMessage()
          return
        }
        if (last.type === 'tool_use' && event.delta_type === 'input_json_delta') {
          const newPartial = `${last._partialInput ?? ''}${event.partial_json ?? ''}`
          store.setStreaming(sessionId, [
            ...rawStreaming.slice(0, lastIdx),
            { ...last, _partialInput: newPartial, input: mergePartialToolInput(last.input, newPartial) },
          ])
          syncAssistantMessage()
          return
        }
      }

      // Slow path: type mismatch or no current block — full clone + new block insertion.
      const streaming = cloneStreaming(sessionId, store)
      let current = streaming[streaming.length - 1]
      if (!current) {
        if (event.delta_type === 'thinking_delta') {
          current = { type: 'thinking', index: 0, thinking: '' }
          streaming.push(current)
        } else {
          current = { type: 'text', index: 0, text: '' }
          streaming.push(current)
        }
      }
      if (!current) return
      if (event.delta_type === 'thinking_delta' && current.type !== 'thinking') {
        current = { type: 'thinking', index: streaming.length, thinking: '' }
        streaming.push(current)
      } else if ((!event.delta_type || event.delta_type === 'text_delta') && current.type !== 'text') {
        current = { type: 'text', index: streaming.length, text: '' }
        streaming.push(current)
      }
      if (current.type === 'text' && (!event.delta_type || event.delta_type === 'text_delta')) {
        current.text += event.delta ?? ''
      } else if (current.type === 'thinking' && event.delta_type === 'thinking_delta') {
        current.thinking += event.delta ?? ''
      } else if (current.type === 'tool_use' && event.delta_type === 'input_json_delta') {
        current._partialInput = `${current._partialInput ?? ''}${event.partial_json ?? ''}`
        current.input = mergePartialToolInput(current.input, current._partialInput)
      }
      store.setStreaming(sessionId, streaming)
      syncAssistantMessage()
      return
    }
  }
}

function handleRuntimeEvent(
  sessionId: string,
  event: RuntimeEventPayload,
  store: ReturnType<typeof useSessionStore.getState>,
  setPendingTool: (tool: ToolActivity | null) => void,
  getPendingTool: () => ToolActivity | null,
  syncAssistantMessage: () => void,
) {
  // Sub-agent events are tagged with agent_tool_use_id — route them separately.
  if (event.agent_tool_use_id) {
    handleSubagentEvent(sessionId, event, store)
    return
  }

  switch (event.type) {
    // Authoritative plan/execute mode signal, emitted the instant
    // enter_plan_mode/exit_plan_mode complete — previously the UI only ever
    // inferred the mode indirectly from a tool_name heuristic on the next
    // tool.progress(completed) event (see the 'tool.progress' case below),
    // which happened to work for the same reason but was guessing rather
    // than reading the engine's own signal for this.
    case 'execution_mode.changed': {
      store.updateAgentState(sessionId, { executionMode: normaliseMode(event.execution_mode) })
      break
    }

    case 'turn.started': {
      store.updateAgentState(sessionId, {
        executionMode: normaliseMode(event.execution_mode),
        turnNumber: event.turn_number ?? 0,
        isThinking: true,
        activeTool: null,
      })
      break
    }

    case 'turn.completed': {
      store.updateAgentState(sessionId, {
        executionMode: normaliseMode(event.execution_mode),
        turnNumber: event.turn_number ?? 0,
        inputTokens: event.usage?.input_tokens ?? 0,
        outputTokens: event.usage?.output_tokens ?? 0,
        isThinking: false,
        activeTool: null,
      })
      syncAssistantMessage()
      break
    }

    case 'turn.failed':
      store.updateAgentState(sessionId, { isThinking: false, activeTool: null })
      markLatestStreamingTool(sessionId, store, null, 'failed')
      syncAssistantMessage()
      break

    case 'tool.permission_required': {
      const request = event.permission_request
      if (!request) break

      const approval = {
        toolUseId: request.tool_use_id,
        toolName: request.tool_name,
        toolInput: request.tool_input ?? {},
        description: request.description,
      }

      // "Always allow" from a previous PermissionCard — auto-resolve via the
      // same API the card's own buttons use, without ever surfacing it again.
      const signature = permissionSignature(request.tool_name, request.tool_input ?? {})
      if (useUIStore.getState().rememberedApprovals[signature]) {
        void api.post(`/permissions/${request.tool_use_id}`, { approved: true, remember: true, session_id: sessionId }).catch(() => {})
        updateStreamingTool(sessionId, store, request.tool_use_id, {
          _status: 'running',
          input: request.tool_input ?? {},
        })
        syncAssistantMessage()
        break
      }

      store.updateAgentState(sessionId, { pendingPermission: approval })
      ensureStreamingTool(sessionId, store, {
        toolUseId: request.tool_use_id,
        toolName: request.tool_name,
        input: request.tool_input ?? {},
        status: 'awaiting_approval',
        approval,
        message: request.description ?? `Awaiting approval for ${request.tool_name}`,
      })
      updateStreamingTool(sessionId, store, request.tool_use_id, {
        _status: 'awaiting_approval',
        _approval: approval,
        input: request.tool_input ?? {},
        _message: request.description ?? `Awaiting approval for ${request.tool_name}`,
      })
      syncAssistantMessage()
      break
    }

    case 'prompt.request': {
      const request = event.prompt_request
      if (!request) break

      const metadata = request.metadata ?? {}
      const metadataToolUseId =
        typeof metadata.tool_use_id === 'string' ? metadata.tool_use_id : ''
      const promptId =
        typeof metadata.prompt_id === 'string' ? metadata.prompt_id : ''
      const toolUseId =
        metadataToolUseId ||
        findLatestStreamingToolUseByName(sessionId, store, 'ask_user_question')?.id ||
        `ask-user-${Date.now()}`
      const toolName =
        typeof metadata.tool_name === 'string' ? metadata.tool_name : 'ask_user_question'

      const prompt: ToolPromptRequest = {
        promptId,
        type: request.type,
        message: request.message,
        options: request.options?.map((option) => ({ ...option })),
        default: request.default,
        metadata: { ...metadata },
      }

      ensureStreamingTool(sessionId, store, {
        toolUseId,
        toolName,
        status: 'running',
        message: request.message,
        prompt,
      })
      updateStreamingTool(sessionId, store, toolUseId, {
        _status: 'running',
        _prompt: prompt,
        _message: request.message,
      })
      syncAssistantMessage()
      break
    }

    case 'tool.progress': {
      const progress = event.tool_progress
      if (!progress) break

      const now = Date.now()
      const currentTool = progress.tool_use_id
        ? findStreamingToolById(sessionId, store, progress.tool_use_id)
        : findLatestToolUseByName([{ role: 'assistant', content: streamingToContentBlocks(store.getStreaming(sessionId)) }], progress.tool_name)
      const toolStatus = progress.stage as ToolStatus
      const progressInput = toolInputFromProgress(progress)

      if (!currentTool) {
        ensureStreamingTool(sessionId, store, {
          toolUseId: progress.tool_use_id || `${progress.tool_name}-${now}`,
          toolName: progress.tool_name,
          input: progressInput,
          status: toolStatus,
          message: progress.message,
        })
      }

      if (progress.stage === 'pending' || progress.stage === 'running') {
        const activity: ToolActivity = {
          toolName: progress.tool_name,
          stage: progress.stage,
          message: progress.message,
          startedAt: now,
        }
        store.updateAgentState(sessionId, { activeTool: activity })
        setPendingTool(activity)
      } else {
        const previous = getPendingTool()
        const activity: ToolActivity = {
          toolName: progress.tool_name,
          stage: progress.stage,
          message: progress.message,
          startedAt: previous?.startedAt ?? now,
          endedAt: now,
        }
        // Immediately reflect mode transitions in the Agent Monitor when the
        // mode tool completes, without waiting for the next turn.started event.
        const modeUpdate: Partial<import('@/stores/session').AgentState> = {
          activeTool: null,
          pendingPermission: null,
        }
        if (progress.stage === 'completed') {
          if (progress.tool_name === 'enter_plan_mode') modeUpdate.executionMode = 'plan'
          else if (progress.tool_name === 'exit_plan_mode') modeUpdate.executionMode = 'execute'
          else if (progress.tool_name === 'enter_pair_programming_mode') modeUpdate.executionMode = 'pair_programming'
          else if (progress.tool_name === 'exit_pair_programming_mode') modeUpdate.executionMode = 'execute'
        }
        store.updateAgentState(sessionId, modeUpdate)
        store.pushToolActivity(sessionId, activity)
        setPendingTool(null)

        // When the agent tool itself completes/fails, propagate status to sub-agent state.
        //
        // For the synchronous `agent` tool, the outer tool call blocks until the
        // sub-agent is done, so this event IS the real completion signal.
        //
        // For `spawn_agent`, the outer tool call returns almost immediately (it
        // only starts a background agent), so the engine's generic tool-execution
        // pipeline emits a `tool.progress` "completed" event for `spawn_agent`
        // well before the underlying agent has actually finished. The real
        // completion is a *second*, later `tool.progress` event with the same
        // tool_use_id, emitted explicitly once the background agent's own
        // ag.Wait() unblocks (see spawn_agent.go) — it carries
        // metadata.subagent_finished=true to distinguish it from the spurious
        // first one. Without checking that marker, the sub-agent card would flip
        // to "Completed" within milliseconds while the agent keeps running, and
        // the real completion would never arrive to unstick it.
        const isSpawnAgentFinished = progress.tool_name === 'spawn_agent' && progress.metadata?.subagent_finished === true
        if ((progress.tool_name === 'agent' || isSpawnAgentFinished) && progress.tool_use_id) {
          const agentResultText = progress.stage === 'completed'
            ? (typeof progress.metadata?.content === 'string'
                ? progress.metadata.content
                : typeof progress.message === 'string' ? progress.message : undefined)
            : undefined
          store.upsertSubagent(sessionId, progress.tool_use_id, {
            status: progress.stage === 'completed' ? 'completed' : 'failed',
            endedAt: now,
            isThinking: false,
            activeTool: null,
            error: progress.stage === 'failed' ? (progress.message ?? 'Agent failed') : undefined,
            result: agentResultText,
          })
        }
      }

      const resolvedTool = progress.tool_use_id
        ? findStreamingToolById(sessionId, store, progress.tool_use_id)
        : currentTool

      if (resolvedTool) {
        const renderedResult = toolResultFromProgress(progress)
        updateStreamingTool(sessionId, store, resolvedTool.id, {
          _status: toolStatus,
          input: Object.keys(progressInput).length > 0 ? progressInput : resolvedTool.input,
          _result: renderedResult ?? resolvedTool._result,
          _approval: toolStatus === 'completed' || toolStatus === 'failed' ? undefined : resolvedTool._approval,
          _prompt: toolStatus === 'completed' || toolStatus === 'failed' ? undefined : resolvedTool._prompt,
          _message: progress.message ?? resolvedTool._message,
        })
        syncAssistantMessage()
      }
      break
    }

    case 'plan.submitted': {
      const planEvent = event.plan_event
      if (!planEvent) break
      // Seed a minimal pending plan immediately so the UI can show the artifact card.
      // A background fetch will fill in the full content.
      const seedPlan: import('@/api/types').PlanDocument = {
        id: planEvent.plan_id,
        session_id: sessionId,
        slug: planEvent.slug,
        filename: planEvent.filename,
        content: '',
        status: planEvent.status as import('@/api/types').PlanStatus,
        version: planEvent.version,
        created_at: Math.floor(Date.now() / 1000),
        updated_at: Math.floor(Date.now() / 1000),
      }
      store.upsertPlan(sessionId, seedPlan)
      // Fetch full content in background
      void fetchPlanContent(sessionId, planEvent.plan_id, store)
      break
    }
  }
}

function handleSubagentEvent(
  sessionId: string,
  event: RuntimeEventPayload,
  store: ReturnType<typeof useSessionStore.getState>,
) {
  const toolUseId = event.agent_tool_use_id!

  // Ensure the sub-agent entry exists. Try to read agentType/task from the
  // parent session's streaming block so the card/panel show meaningful data immediately.
  if (!store.getSubagent(sessionId, toolUseId)) {
    const parentBlock = store.getStreaming(sessionId).find(
      (b) => b.type === 'tool_use' && b.id === toolUseId
    )
    const inputType = parentBlock?.type === 'tool_use'
      ? String(parentBlock.input.type ?? parentBlock.input.agent_type ?? 'agent')
      : 'agent'
    const inputTask = parentBlock?.type === 'tool_use'
      ? String(parentBlock.input.task ?? parentBlock.input.prompt ?? '')
      : ''
    store.upsertSubagent(sessionId, toolUseId, {
      agentType: inputType,
      task: inputTask,
      status: 'running',
    })
  }

  switch (event.type) {
    case 'agent.spawn.end': {
      // Carries the stable agent_id returned by spawn_agent — needed to call
      // the cancel endpoint. agent.spawn.begin has no agent_id yet (the agent
      // hasn't been assigned one when that event fires) so it's not handled here.
      const agentId = event.agent_event?.agent_id
      if (agentId) {
        store.upsertSubagent(sessionId, toolUseId, { agentId })
      }
      break
    }

    case 'turn.started': {
      store.upsertSubagent(sessionId, toolUseId, {
        turnNumber: event.turn_number ?? 0,
        isThinking: true,
        activeTool: null,
      })
      break
    }

    case 'turn.completed': {
      store.upsertSubagent(sessionId, toolUseId, {
        turnNumber: event.turn_number ?? 0,
        inputTokens: event.usage?.input_tokens ?? 0,
        outputTokens: event.usage?.output_tokens ?? 0,
        isThinking: false,
        activeTool: null,
      })
      break
    }

    case 'turn.failed': {
      store.upsertSubagent(sessionId, toolUseId, {
        isThinking: false,
        activeTool: null,
        status: 'failed',
      })
      break
    }

    case 'response.chunk': {
      const chunk = event.chunk
      if (!chunk) break
      handleSubagentStreamChunk(sessionId, toolUseId, chunk, store)
      break
    }

    case 'tool.progress': {
      const progress = event.tool_progress
      if (!progress) break

      const now = Date.now()
      const subagent = store.getSubagent(sessionId, toolUseId)

      // Detect agentType from tool_progress metadata if available
      if (subagent?.agentType === 'agent' && progress.metadata?.agent_type) {
        store.upsertSubagent(sessionId, toolUseId, {
          agentType: String(progress.metadata.agent_type),
        })
      }
      if (subagent?.task === '' && progress.metadata?.task) {
        store.upsertSubagent(sessionId, toolUseId, {
          task: String(progress.metadata.task),
        })
      }

      if (progress.stage === 'pending' || progress.stage === 'running') {
        const activity: ToolActivity = {
          toolName: progress.tool_name,
          stage: progress.stage,
          message: progress.message,
          startedAt: now,
        }
        store.upsertSubagent(sessionId, toolUseId, { activeTool: activity })
      } else {
        const activity: ToolActivity = {
          toolName: progress.tool_name,
          stage: progress.stage,
          message: progress.message,
          startedAt: now,
          endedAt: now,
        }
        store.pushSubagentToolActivity(sessionId, toolUseId, activity)
        store.upsertSubagent(sessionId, toolUseId, { activeTool: null })
      }

      // Update sub-agent streaming block status
      const subagentCurrent = store.getSubagent(sessionId, toolUseId)
      if (!subagentCurrent) break
      const toolBlockIndex = subagentCurrent.streaming.findIndex(
        (b) => b.type === 'tool_use' && (progress.tool_use_id ? b.id === progress.tool_use_id : b.name === progress.tool_name)
      )
      if (toolBlockIndex >= 0) {
        store.updateSubagentStreamBlock(sessionId, toolUseId, subagentCurrent.streaming[toolBlockIndex].index, {
          _status: progress.stage as ToolStatus,
          _message: progress.message,
        })
      }
      break
    }
  }
}

function handleSubagentStreamChunk(
  sessionId: string,
  toolUseId: string,
  chunk: StreamEvent,
  store: ReturnType<typeof useSessionStore.getState>,
) {
  const subagent = store.getSubagent(sessionId, toolUseId)
  if (!subagent) return

  switch (chunk.type) {
    case 'message_delta':
    case 'content_block_stop':
    case 'message_stop':
    case 'error':
      return

    case 'content_block_start': {
      if (chunk.content_block.type === 'tool_result') return
      const index = subagent.streaming.length
      if (chunk.content_block.type === 'tool_use') {
        store.appendSubagentStreamBlock(sessionId, toolUseId, {
          type: 'tool_use',
          index,
          id: chunk.content_block.id,
          name: chunk.content_block.name,
          input: { ...chunk.content_block.input },
          metadata: chunk.content_block.metadata,
          _status: 'pending',
          _partialInput: '',
        })
      } else if (chunk.content_block.type === 'thinking') {
        store.appendSubagentStreamBlock(sessionId, toolUseId, {
          type: 'thinking',
          index,
          thinking: chunk.content_block.thinking ?? '',
        })
      } else {
        store.appendSubagentStreamBlock(sessionId, toolUseId, {
          type: 'text',
          index,
          text: chunk.content_block.text ?? '',
        })
      }
      return
    }

    case 'content_block_delta': {
      const current = store.getSubagent(sessionId, toolUseId)
      if (!current) return
      const lastIdx = current.streaming.length - 1
      const last = lastIdx >= 0 ? current.streaming[lastIdx] : null
      if (!last) return

      if (last.type === 'text' && (!chunk.delta_type || chunk.delta_type === 'text_delta')) {
        store.updateSubagentStreamBlock(sessionId, toolUseId, last.index, {
          ...last,
          text: last.text + (chunk.delta ?? ''),
        })
      } else if (last.type === 'thinking' && chunk.delta_type === 'thinking_delta') {
        store.updateSubagentStreamBlock(sessionId, toolUseId, last.index, {
          ...last,
          thinking: last.thinking + (chunk.delta ?? ''),
        })
      } else if (last.type === 'tool_use' && chunk.delta_type === 'input_json_delta') {
        const newPartial = `${last._partialInput ?? ''}${chunk.partial_json ?? ''}`
        store.updateSubagentStreamBlock(sessionId, toolUseId, last.index, {
          ...last,
          _partialInput: newPartial,
          input: mergePartialToolInput(last.input, newPartial),
        })
      }
      return
    }
  }
}

function commitDonePayload(
  sessionId: string,
  assistantMessageId: string,
  payload: DonePayload,
  store: ReturnType<typeof useSessionStore.getState>,
) {
  // done carries the authoritative final turn_number/usage for the whole
  // exchange — refresh the Agent Monitor's stats with it rather than leaving
  // whatever the last turn.completed event happened to report, which can be
  // stale for multi-turn responses (each turn.completed only reflects that
  // one turn, not the aggregate).
  if (payload.turn_number != null || payload.usage) {
    store.updateAgentState(sessionId, {
      ...(payload.turn_number != null ? { turnNumber: payload.turn_number } : {}),
      ...(payload.usage?.input_tokens != null ? { inputTokens: payload.usage.input_tokens } : {}),
      ...(payload.usage?.output_tokens != null ? { outputTokens: payload.usage.output_tokens } : {}),
    })
  }

  if (Array.isArray(payload.messages)) {
    const normalized = normalizeSessionMessages(payload.messages)
    preserveLocalUserAttachments(sessionId, normalized, store)
    attachDoneResults(normalized, payload.tool_results ?? [])
    store.updateSession(sessionId, { messages: normalized })
    return
  }

  const content = streamingToContentBlocks(store.getStreaming(sessionId))
  store.updateMessage(sessionId, assistantMessageId, (message) => ({ ...message, content }))
}

function preserveLocalUserAttachments(
  sessionId: string,
  messages: Message[],
  store: ReturnType<typeof useSessionStore.getState>,
) {
  const existing = store.sessions.find((session) => session.id === sessionId)?.messages ?? []
  const localById = new Map(
    existing
      .filter((message) => message.id && message.role === 'user' && Array.isArray(message.metadata?.attachments))
      .map((message) => [message.id as string, message]),
  )
  const localUserMessages = existing.filter((message) => message.role === 'user' && Array.isArray(message.metadata?.attachments))
  if (localUserMessages.length === 0 && localById.size === 0) return

  const used = new Set<number>()
  let userOrdinal = 0
  for (let messageIndex = 0; messageIndex < messages.length; messageIndex++) {
    const message = messages[messageIndex]
    if (message.role !== 'user') continue
    const currentOrdinal = userOrdinal
    userOrdinal++
    if (message.role !== 'user' || message.metadata?.attachments) continue

    const byId = message.id ? localById.get(message.id) : undefined
    if (byId?.metadata?.attachments) {
      message.metadata = { ...message.metadata, attachments: byId.metadata.attachments }
      continue
    }

    const byOrdinal = localUserMessages[currentOrdinal]
    if (byOrdinal?.metadata?.attachments && !used.has(currentOrdinal)) {
      used.add(currentOrdinal)
      message.metadata = { ...message.metadata, attachments: byOrdinal.metadata.attachments }
      continue
    }

    const text = message.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim()
    const matchIndex = localUserMessages.findIndex((local, index) => {
      if (used.has(index)) return false
      const localText = local.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('\n')
        .trim()
      return localText === text
    })
    if (matchIndex < 0) continue
    used.add(matchIndex)
    message.metadata = {
      ...message.metadata,
      attachments: localUserMessages[matchIndex].metadata?.attachments,
    }
  }
}

function attachDoneResults(messages: Message[], results: NonNullable<DonePayload['tool_results']>) {
  if (results.length === 0) return
  const normalized = normalizeSessionMessages(messages)
  for (const result of results) {
    const rendered = toolResultFromDone(result)
    if (!rendered) continue
    for (const message of normalized) {
      for (const block of message.content) {
        if (block.type !== 'tool_use' || block.id !== result.id) continue
        block._result = rendered
        block._status = statusFromResult(rendered)
      }
    }
  }
  messages.splice(0, messages.length, ...normalized)
}

function updateStreamingTool(
  sessionId: string,
  store: ReturnType<typeof useSessionStore.getState>,
  toolUseId: string,
  patch: Partial<ReturnType<typeof cloneStreaming>[number]>,
) {
  const streaming = cloneStreaming(sessionId, store)
  for (const block of streaming) {
    if (block.type !== 'tool_use' || block.id !== toolUseId) continue
    Object.assign(block, patch)
  }
  store.setStreaming(sessionId, streaming)
}

function ensureStreamingTool(
  sessionId: string,
  store: ReturnType<typeof useSessionStore.getState>,
  tool: {
    toolUseId: string
    toolName: string
    input?: Record<string, unknown>
    status?: ToolStatus
    approval?: ToolApproval
    prompt?: ToolPromptRequest
    message?: string
  },
) {
  if (!tool.toolUseId || findStreamingToolById(sessionId, store, tool.toolUseId)) {
    return
  }

  const streaming = cloneStreaming(sessionId, store)
  streaming.push({
    type: 'tool_use',
    index: streaming.length,
    id: tool.toolUseId,
    name: tool.toolName,
    input: { ...tool.input },
    _status: tool.status ?? 'pending',
    _approval: tool.approval,
    _prompt: tool.prompt,
    _result: undefined,
    _partialInput: '',
    _message: tool.message,
  })
  store.setStreaming(sessionId, streaming)
}

function markLatestStreamingTool(
  sessionId: string,
  store: ReturnType<typeof useSessionStore.getState>,
  toolName: string | null,
  status: ToolStatus,
) {
  const streaming = cloneStreaming(sessionId, store)
  for (let index = streaming.length - 1; index >= 0; index--) {
    const block = streaming[index]
    if (block.type !== 'tool_use') continue
    if (toolName && block.name !== toolName) continue
    block._status = status
    break
  }
  store.setStreaming(sessionId, streaming)
}

function findStreamingToolById(
  sessionId: string,
  store: ReturnType<typeof useSessionStore.getState>,
  toolUseId: string,
) {
  for (const block of store.getStreaming(sessionId)) {
    if (block.type === 'tool_use' && block.id === toolUseId) {
      return block
    }
  }
  return null
}

function cloneStreaming(sessionId: string, store: ReturnType<typeof useSessionStore.getState>) {
  return store.getStreaming(sessionId).map((block) => {
    if (block.type === 'text') return { ...block }
    if (block.type === 'thinking') return { ...block }
    return {
      ...block,
      input: { ...block.input },
      metadata: block.metadata ? { ...block.metadata } : undefined,
      _approval: block._approval ? { ...block._approval, toolInput: { ...block._approval.toolInput } } : undefined,
      _prompt: block._prompt
        ? {
            ...block._prompt,
            options: block._prompt.options?.map((option) => ({ ...option })),
            metadata: block._prompt.metadata ? { ...block._prompt.metadata } : undefined,
          }
        : undefined,
      _result: block._result
        ? {
            ...block._result,
            metadata: block._result.metadata ? { ...block._result.metadata } : undefined,
          }
        : undefined,
      _partialInput: block._partialInput,
      _message: block._message,
    }
  }) as StreamingBlock[]
}

function findLatestStreamingToolUseByName(
  sessionId: string,
  store: ReturnType<typeof useSessionStore.getState>,
  toolName: string,
) {
  const streaming = store.getStreaming(sessionId)
  for (let index = streaming.length - 1; index >= 0; index -= 1) {
    const block = streaming[index]
    if (block.type === 'tool_use' && block.name === toolName) {
      return block
    }
  }
  return null
}

function mergePartialToolInput(current: Record<string, unknown>, partialJSON: string) {
  const trimmed = partialJSON.trim()
  if (!trimmed) return current
  try {
    return { ...current, ...JSON.parse(trimmed) as Record<string, unknown> }
  } catch {
    return current
  }
}

function toolResultFromProgress(
  progress: NonNullable<RuntimeEventPayload['tool_progress']>,
) {
  const metadata = progress.metadata
  if (!metadata) return undefined

  // Only 'completed'/'failed' stage events carry an actual tool result -
  // 'pending'/'running' progress only ever carries tool_name/tool_input (see
  // progressMetadata in the engine's internal/execution/progress.go), so
  // there's nothing to render yet.
  //
  // Each tool's own ResultMetadata.Additional (e.g. bash's stdout/stderr/
  // exit_code, submit_plan's plan_id/slug/filename/version/status,
  // web_search's provider/mode) is always flattened directly onto this same
  // metadata object by the engine/backend before it reaches the wire (see
  // toolResultMetadata/buildToolResultMessages/buildToolResultSSE) - there is
  // no generic nested `metadata.additional` key to check for, and no set of
  // field names common to every tool. The stage is what reliably tells us a
  // real result exists, regardless of which tool-specific keys ended up
  // flattened onto it.
  if (progress.stage !== 'completed' && progress.stage !== 'failed') return undefined

  const content = typeof metadata.content === 'string'
    ? metadata.content
    : typeof progress.message === 'string'
      ? progress.message
      : ''

  const durationMs = typeof metadata.execution_duration_ms === 'number'
    ? metadata.execution_duration_ms
    : undefined

  return {
    content,
    isError: progress.stage === 'failed',
    durationMs,
    metadata: { ...metadata },
  }
}

function openKnowledgePanel(sessionId: string, ragResults?: RAGSearchResult[]) {
  if (!ragResults || ragResults.length === 0) return
  useUIStore.getState().openRightPanel({
    kind: 'knowledge',
    title: 'Knowledge Context',
    sessionId,
    sourceLabel: `${ragResults.length} retrieved excerpt${ragResults.length > 1 ? 's' : ''}`,
    knowledgeResults: ragResults,
  })
}

function toolInputFromProgress(
  progress: NonNullable<RuntimeEventPayload['tool_progress']>,
): Record<string, unknown> {
  const raw = progress.metadata?.tool_input
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {}
  }
  return { ...(raw as Record<string, unknown>) }
}

function normaliseMode(raw?: string): AgentState['executionMode'] {
  if (raw === 'plan' || raw === 'pair_programming') return raw
  return 'execute'
}

function syncAssistantPlaceholder(
  sessionId: string,
  assistantMessageId: string,
  store: ReturnType<typeof useSessionStore.getState>,
) {
  const content = streamingToContentBlocks(store.getStreaming(sessionId))
  store.updateMessage(sessionId, assistantMessageId, (message) => ({
    ...message,
    content,
  }))
}

type AgentState = ReturnType<ReturnType<typeof useSessionStore.getState>['getAgentState']>

async function fetchPlanContent(
  sessionId: string,
  planId: string,
  store: ReturnType<typeof useSessionStore.getState>,
) {
  try {
    const { api } = await import('@/api/client')
    const plan = await api.get<import('@/api/types').PlanDocument>(`/plans/${planId}`)
    store.upsertPlan(sessionId, plan)
  } catch {
    // Best-effort prefetch - content stays empty; PlanEditorPanel's own
    // loadFull() retries this same request when the user opens the panel,
    // and surfaces a visible error with a Retry button if that also fails.
  }
}
