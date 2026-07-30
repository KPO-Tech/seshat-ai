import { useAuthStore } from '@/stores/auth'

export const NEXUS_BASE = 'http://127.0.0.1:8090/api/v1'

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
  if (status === 401) return 'Session expirée. Reconnectez-vous.'
  try {
    const json = JSON.parse(text)
    return json.error ?? json.message ?? text
  } catch {
    return text || `HTTP ${status}`
  }
}

function bridgeErrorMessage(payload: BridgeResponse): string {
  if (payload.status === 401) return 'Session expirée. Reconnectez-vous.'
  if (payload.data && typeof payload.data === 'object') {
    const data = payload.data as { error?: string; message?: string }
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
      body: opts.body,
    })
    if (!res.ok) {
      if (res.status === 401) {
        useAuthStore.getState().logout()
      }
      throw new ApiError(res.status, bridgeErrorMessage(res))
    }
    return res.data as T
  }

  const token = useAuthStore.getState().token
  const res = await fetch(`${NEXUS_BASE}${path}`, {
    method: opts.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    if (res.status === 401) {
      useAuthStore.getState().logout()
    }
    throw new ApiError(res.status, extractErrorMessage(text, res.status))
  }

  if (res.status === 204) return undefined as T
  return res.json()
}

async function serializeFormData(formData: FormData) {
  const fields: Array<{ name: string; value: string }> = []
  const files: Array<{ name: string; filename: string; mimeType?: string; data: ArrayBuffer }> = []

  for (const [name, value] of formData.entries()) {
    if (typeof value === 'string') {
      fields.push({ name, value })
      continue
    }
    files.push({
      name,
      filename: 'name' in value && typeof value.name === 'string' ? value.name : 'upload.bin',
      mimeType: value.type,
      data: await value.arrayBuffer(),
    })
  }

  return { fields, files }
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>(path, { signal }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  delete: <T>(path: string, body?: unknown) => request<T>(path, { method: 'DELETE', body }),
  upload: async <T>(path: string, formData: FormData): Promise<T> => {
    if (window.nexus?.http) {
      const payload = await serializeFormData(formData)
      const res = await window.nexus.http.upload({ path, ...payload })
      if (!res.ok) {
        if (res.status === 401) {
          useAuthStore.getState().logout()
        }
        throw new ApiError(res.status, bridgeErrorMessage(res))
      }
      return res.data as T
    }

    const token = useAuthStore.getState().token
    const res = await fetch(`${NEXUS_BASE}${path}`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    })
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      throw new ApiError(res.status, extractErrorMessage(text, res.status))
    }
    if (res.status === 204) return undefined as T
    return res.json()
  },
  // Fetches a binary resource (e.g. an uploaded file's original bytes) as a
  // data: URL, for rehydrating attachment previews whose original blob:/data:
  // URL (created client-side at attach time) no longer exists - e.g. after an
  // app restart, when only the server-persisted file bytes survive.
  getFileDataURL: async (path: string): Promise<string> => {
    if (window.nexus?.http) {
      const res = await window.nexus.http.fileContent(path)
      if (!res.ok || !res.dataUrl) {
        throw new ApiError(res.status, res.error || `HTTP ${res.status}`)
      }
      return res.dataUrl
    }

    const token = useAuthStore.getState().token
    const res = await fetch(`${NEXUS_BASE}${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      throw new ApiError(res.status, extractErrorMessage(text, res.status))
    }
    const blob = await res.blob()
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(blob)
    })
  },
}
