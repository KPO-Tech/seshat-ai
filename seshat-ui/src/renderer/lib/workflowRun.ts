// Streams a workflow run against seshat-backend's POST /workflows/run (see
// seshat-backend/internal/api/workflows.go). Mirrors useChat.ts's two
// transport paths - the Electron IPC bridge (window.nexus.http.startStream,
// generic across any SSE path) when available, a raw fetch+SSE-line-parser
// fallback for browser-dev mode otherwise - but the event schema here is
// much smaller (node/done/error only), so this doesn't need chat's full
// runtime-event taxonomy.
import { useAuthStore } from '@/stores/auth'

export type WorkflowNodeEvent = {
  id: string
  agent?: string
  success: boolean
  output?: string
  error?: string
  duration_ms: number
}

export type WorkflowDoneEvent = {
  name: string
  success: boolean
  duration_ms: number
  order: string[]
}

export type WorkflowRunParams = {
  definition: string
  provider_setting_id?: string
  max_parallel?: number
}

export type WorkflowRunCallbacks = {
  onNode: (event: WorkflowNodeEvent) => void
  onDone: (event: WorkflowDoneEvent) => void
  onError: (message: string) => void
}

export async function runWorkflow(params: WorkflowRunParams, callbacks: WorkflowRunCallbacks, signal: AbortSignal): Promise<void> {
  if (window.nexus?.http) {
    return runViaElectronBridge(params, callbacks, signal)
  }
  return runViaFetch(params, callbacks, signal)
}

async function runViaElectronBridge(params: WorkflowRunParams, callbacks: WorkflowRunCallbacks, signal: AbortSignal): Promise<void> {
  const startResult = await window.nexus!.http!.startStream({ path: '/workflows/run', method: 'POST', body: params })
  if ('error' in startResult) {
    callbacks.onError(startResult.error)
    return
  }
  const { streamId } = startResult

  await new Promise<void>((resolve) => {
    let settled = false
    const unsubscribe = window.nexus!.http!.onStreamEvent(streamId, ({ name, data }) => {
      if (settled) return
      if (name === 'error') {
        settled = true
        unsubscribe()
        cleanupAbort()
        callbacks.onError((data.error as string) || 'Workflow run failed')
        resolve()
        return
      }
      if (name === 'done') {
        settled = true
        unsubscribe()
        cleanupAbort()
        callbacks.onDone(data as unknown as WorkflowDoneEvent)
        resolve()
        return
      }
      if (name === 'node') {
        callbacks.onNode(data as unknown as WorkflowNodeEvent)
      }
    })

    const onAbort = () => {
      if (settled) return
      settled = true
      unsubscribe()
      cleanupAbort()
      void window.nexus?.http?.cancelStream(streamId).catch(() => {})
      resolve()
    }
    const cleanupAbort = () => signal.removeEventListener('abort', onAbort)
    signal.addEventListener('abort', onAbort, { once: true })
    if (signal.aborted) onAbort()
  })
}

async function runViaFetch(params: WorkflowRunParams, callbacks: WorkflowRunCallbacks, signal: AbortSignal): Promise<void> {
  const token = useAuthStore.getState().token
  const res = await fetch('http://127.0.0.1:8090/api/v1/workflows/run', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    signal,
    body: JSON.stringify(params),
  })
  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText)
    let msg = errText || `HTTP ${res.status}`
    try {
      msg = (JSON.parse(errText) as { error?: string }).error ?? msg
    } catch {
      // noop
    }
    callbacks.onError(msg)
    return
  }

  const reader = res.body?.getReader()
  if (!reader) {
    callbacks.onError('No response body')
    return
  }
  const decoder = new TextDecoder()
  let buffer = ''
  let eventName = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
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
      let parsed: Record<string, unknown>
      try {
        parsed = JSON.parse(line.slice(6).trim())
      } catch {
        continue
      }
      if (eventName === 'error') {
        callbacks.onError((parsed.error as string) || 'Workflow run failed')
        return
      }
      if (eventName === 'done') {
        callbacks.onDone(parsed as unknown as WorkflowDoneEvent)
        return
      }
      if (eventName === 'node') {
        callbacks.onNode(parsed as unknown as WorkflowNodeEvent)
      }
    }
  }
}
