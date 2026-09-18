import { api, SESHAT_BASE } from '@renderer/api/client'
import { useAuthStore } from '@renderer/stores/auth'
import type { ChatExecutionMode, ChatMessage, ChatPermissionMode, ChatSession, PlanDocument, StreamEvent } from './chatTypes'

type BackendSession = {
  session_id: string
  title?: string
  status?: 'idle' | 'running' | 'completed' | 'stopped' | 'failed'
  created_at?: number
  updated_at?: number
  messages?: ChatMessage[]
  provider_setting_id?: string
  model_id?: string
  execution_mode?: string
  permission_mode?: string
}

export async function fetchSessions() {
  const result = await api.get<{ sessions: BackendSession[] }>('/sessions')
  return (result.sessions ?? []).map(sessionFromBackend)
}

export async function fetchSession(id: string) {
  const result = await api.get<BackendSession>(`/sessions/${encodeURIComponent(id)}`)
  return sessionFromBackend(result)
}

export async function createSession(params: { providerSettingId?: string; modelId?: string } = {}) {
  const result = await api.post<{ session_id: string }>('/sessions', {
    provider_setting_id: params.providerSettingId,
    model_id: params.modelId
  })
  return result.session_id
}

export function interruptSession(id: string) {
  return api.post(`/sessions/${encodeURIComponent(id)}/interrupt`, {})
}

export function cancelSubagent(agentId: string, sessionId: string) {
  return api.post(`/subagents/${encodeURIComponent(agentId)}/cancel`, { session_id: sessionId })
}

export function patchSessionMetadata(id: string, params: { executionMode?: ChatExecutionMode; permissionMode?: ChatPermissionMode; title?: string }) {
  return api.patch(`/sessions/${encodeURIComponent(id)}`, {
    execution_mode: params.executionMode,
    permission_mode: params.permissionMode,
    title: params.title
  })
}

export function deleteSession(id: string) {
  return api.delete(`/sessions/${encodeURIComponent(id)}`)
}

export function decideToolPermission(params: {
  toolUseId: string
  sessionId: string
  approved: boolean
  remember?: boolean
  reason?: string
  planId?: string
}) {
  return api.post(`/permissions/${encodeURIComponent(params.toolUseId)}`, {
    session_id: params.sessionId,
    approved: params.approved,
    remember: params.remember,
    reason: params.reason,
    plan_id: params.planId
  })
}

export async function fetchPlan(id: string) {
  return api.get<PlanDocument>(`/plans/${encodeURIComponent(id)}`)
}

export async function fetchSessionPlans(sessionId: string) {
  const result = await api.get<{ plans: PlanDocument[] }>(`/plans?session_id=${encodeURIComponent(sessionId)}`)
  return result.plans ?? []
}

export async function patchPlan(id: string, params: { content?: string; status?: PlanDocument['status'] }) {
  return api.patch<PlanDocument>(`/plans/${encodeURIComponent(id)}`, params)
}

export function respondToPrompt(params: {
  promptId: string
  sessionId: string
  value?: unknown
  cancelled?: boolean
  metadata?: Record<string, unknown>
}) {
  return api.post(`/prompts/${encodeURIComponent(params.promptId)}`, {
    session_id: params.sessionId,
    value: params.value,
    cancelled: params.cancelled,
    metadata: params.metadata
  })
}

// An Error tagged with whether the caller's retry loop may safely resubmit
// the prompt for it. The Electron path's real error (and whether it's a
// pre-turn network failure vs. something else) lives in the main process,
// and IPC only carries a message string across - main/ipc/backend.ts's
// startStream tags retryable explicitly for exactly this reason (see its
// own `retryable: true/false` returns).
export type RetryableError = Error & { retryable?: boolean }

function makeRetryableError(message: string, retryable: boolean): RetryableError {
  const error: RetryableError = new Error(message)
  error.retryable = retryable
  return error
}

export async function streamQuery(params: {
  prompt: string
  sessionId: string
  providerSettingId?: string
  modelId?: string
  agentSlug?: string
  fileIds?: string[]
  signal?: AbortSignal
  onEvent: (event: StreamEvent) => void
}) {
  if (window.nexus?.http?.startStream) {
    const started = await window.nexus.http.startStream({
      path: '/query/stream',
      method: 'POST',
      body: {
        prompt: params.prompt,
        session_id: params.sessionId,
        provider_setting_id: params.providerSettingId,
        model_id: params.modelId,
        agent_slug: params.agentSlug,
        file_ids: params.fileIds
      }
    })

    if (started.unauthorized) useAuthStore.getState().logout()
    if (!started.streamId) throw makeRetryableError(started.error || 'Streaming failed.', started.retryable === true)
    const streamId = started.streamId

    await new Promise<void>((resolve, reject) => {
      let settled = false
      const cleanup = window.nexus?.http?.onStreamEvent(streamId, (event) => {
        if (event.name === 'error') {
          settle(() => reject(makeRetryableError(String(event.data.error ?? event.data.message ?? 'Streaming failed.'), event.data.retryable === true)))
          return
        }

        params.onEvent({ event: event.name, data: event.data } as StreamEvent)
        if (event.name === 'done') {
          settle(resolve)
        }
      })

      const cancel = () => {
        void window.nexus?.http?.cancelStream(streamId)
        settle(() => reject(new DOMException('The operation was aborted.', 'AbortError')))
      }

      params.signal?.addEventListener('abort', cancel, { once: true })

      function settle(callback: () => void) {
        if (settled) return
        settled = true
        cleanup?.()
        params.signal?.removeEventListener('abort', cancel)
        callback()
      }
    })
    return
  }

  const token = useAuthStore.getState().token
  const response = await fetch(`${SESHAT_BASE}/query/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify({
      prompt: params.prompt,
      session_id: params.sessionId,
      provider_setting_id: params.providerSettingId,
      model_id: params.modelId,
      agent_slug: params.agentSlug,
      file_ids: params.fileIds
    }),
    signal: params.signal
  })

  if (!response.ok || !response.body) {
    const text = await response.text().catch(() => response.statusText)
    let message = text || `HTTP ${response.status}`
    try {
      message = (JSON.parse(text) as { error?: string }).error ?? message
    } catch {
      // not JSON - keep the raw text/status message
    }
    throw new Error(message)
  }

  const SSE_SUPPORTED_VERSION = '1'
  const sseVersion = response.headers.get('X-SSE-Version')
  if (sseVersion && sseVersion !== SSE_SUPPORTED_VERSION) {
    throw new Error(`Unsupported SSE protocol version: expected ${SSE_SUPPORTED_VERSION}, got ${sseVersion}`)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const frames = buffer.split(/\n\n/)
    buffer = frames.pop() ?? ''
    frames.forEach((frame) => {
      const parsed = parseSSEFrame(frame)
      if (parsed) params.onEvent(parsed)
    })
  }

  if (buffer.trim()) {
    const parsed = parseSSEFrame(buffer)
    if (parsed) params.onEvent(parsed)
  }
}

function parseSSEFrame(frame: string): StreamEvent | null {
  const lines = frame.split(/\r?\n/)
  let event = 'message'
  const data: string[] = []

  lines.forEach((line) => {
    if (line.startsWith(':')) return
    if (line.startsWith('event:')) event = line.slice(6).trim()
    if (line.startsWith('data:')) data.push(line.slice(5).trimStart())
  })

  if (data.length === 0) return null
  try {
    return { event, data: JSON.parse(data.join('\n')) } as StreamEvent
  } catch {
    return { event, data: { message: data.join('\n') } } as StreamEvent
  }
}

function sessionFromBackend(session: BackendSession): ChatSession {
  const created = session.created_at ? new Date(session.created_at * 1000).toISOString() : new Date().toISOString()
  const updated = session.updated_at ? new Date(session.updated_at * 1000).toISOString() : created
  return {
    id: session.session_id,
    title: session.title || 'New task',
    messages: session.messages ?? [],
    createdAt: created,
    updatedAt: updated,
    status: session.status,
    providerSettingId: session.provider_setting_id,
    modelId: session.model_id,
    executionMode: normalizeExecutionMode(session.execution_mode),
    permissionMode: normalizePermissionMode(session.permission_mode)
  }
}

function normalizeExecutionMode(value?: string): ChatExecutionMode | undefined {
  if (value === 'plan' || value === 'execute') return value
  return undefined
}

export function normalizePermissionMode(value?: string): ChatPermissionMode | undefined {
  if (value === 'auto' || value === 'bypass') return value
  return undefined
}
