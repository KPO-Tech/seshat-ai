import { api } from '@/api/client'
import { useAuthStore } from '@/store/auth'
import type { WorkspaceChatEvent } from '@/features/workspaceChat/types'
import type { components } from '@/api/schema'

export type WorkspaceChatSessionHistory = components['schemas']['WorkspaceChatSessionHistory']

// Loads a persisted conversation for the "survive a refresh" feature -
// returns null for a 404 (session never existed or aged past the 48h
// retention window), since the caller treats both cases identically.
export async function fetchWorkspaceChatSession(sessionId: string): Promise<WorkspaceChatSessionHistory | null> {
  const { data, error, response } = await api.GET('/api/v1/users/me/workspace/chat/sessions/{sessionID}', {
    params: { path: { sessionID: sessionId } },
  })
  if (response.status === 404) return null
  if (error) throw error
  return data ?? null
}

export interface WorkspaceChatStreamParams {
  sessionId: string
  organizationId: string
  provider: string
  model: string
  corpusId?: string | null
  message: string
}

// Streams POST /api/v1/users/me/workspace/chat/stream - the response body is
// newline-delimited JSON (one WorkspaceChatEvent per line), not a single
// JSON document, so this bypasses the typed openapi-fetch client (@/api/client)
// in favor of a plain fetch()+ReadableStream reader. EventSource can't be
// used here since it only supports GET requests.
export async function streamWorkspaceChat(
  params: WorkspaceChatStreamParams,
  onEvent: (event: WorkspaceChatEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const token = useAuthStore.getState().token
  const response = await fetch('/api/v1/users/me/workspace/chat/stream', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      session_id: params.sessionId,
      organization_id: params.organizationId,
      provider: params.provider,
      model: params.model,
      corpus_id: params.corpusId || undefined,
      message: params.message,
    }),
    signal,
  })

  if (!response.ok || !response.body) {
    let message = `Request failed with status ${response.status}`
    try {
      const body = await response.json()
      message = body?.error?.message || message
    } catch {
      // response wasn't JSON - keep the generic status message
    }
    throw new Error(message)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  const processLine = (line: string) => {
    const trimmed = line.trim()
    if (!trimmed) return
    onEvent(JSON.parse(trimmed) as WorkspaceChatEvent)
  }

  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let newlineIndex: number
    while ((newlineIndex = buffer.indexOf('\n')) >= 0) {
      processLine(buffer.slice(0, newlineIndex))
      buffer = buffer.slice(newlineIndex + 1)
    }
  }
  if (buffer.trim()) processLine(buffer)
}
