import { useAuthStore } from '@renderer/stores/auth'

export const SESHAT_BASE = 'http://127.0.0.1:8090/api/v1'

type RequestOptions = {
  method?: string
  body?: unknown
  signal?: AbortSignal
}

type BridgeResponse = {
  ok: boolean
  status: number
  data?: unknown
  text?: string
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

function extractErrorMessage(text: string, status: number): string {
  if (status === 401) return 'Session expired. Please sign in again.'
  try {
    const json = JSON.parse(text)
    if (json.error && typeof json.error === 'object') return json.error.message ?? text
    return json.error ?? json.message ?? text
  } catch {
    return text || `HTTP ${status}`
  }
}

function bridgeErrorMessage(payload: BridgeResponse): string {
  if (payload.status === 401) return 'Session expired. Please sign in again.'
  if (payload.data && typeof payload.data === 'object') {
    const data = payload.data as { error?: string | { message?: string }; message?: string }
    if (data.error && typeof data.error === 'object') return data.error.message ?? payload.text ?? `HTTP ${payload.status}`
    if (data.error) return data.error
    if (data.message) return data.message
  }
  return payload.text || `HTTP ${payload.status}`
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  if (window.nexus?.http) {
    const res = await window.nexus.http.request({
      path,
      method: opts.method ?? 'GET',
      body: opts.body
    })
    if (!res.ok) {
      if (res.status === 401) useAuthStore.getState().logout()
      throw new ApiError(res.status, bridgeErrorMessage(res))
    }
    return res.data as T
  }

  const token = useAuthStore.getState().token
  const res = await fetch(`${SESHAT_BASE}${path}`, {
    method: opts.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    if (res.status === 401) useAuthStore.getState().logout()
    throw new ApiError(res.status, extractErrorMessage(text, res.status))
  }

  if (res.status === 204) return undefined as T
  return res.json()
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>(path, { signal }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  delete: <T>(path: string, body?: unknown) => request<T>(path, { method: 'DELETE', body })
}
