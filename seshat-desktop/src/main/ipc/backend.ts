import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import { randomUUID } from 'crypto'
import { deleteSecret, getSecret, setSecret } from './secure-store'
import { assertTrustedSender } from './trusted-sender'
import { normalizeFileContentPath, normalizeSessionUploadPath } from './validation'

type AuthUser = {
  id: string
  email: string
  display_name: string
  status: string
}

type StoredSession = {
  token: string
  user: AuthUser
  roles: string[]
}

type RequestPayload = {
  path: string
  method?: string
  body?: unknown
}

type StreamStartPayload = {
  path: string
  method?: string
  body?: unknown
}

type UploadFilePayload = {
  path: string
  filename: string
  contentType?: string
  data: ArrayBuffer
}

const BACKEND_ORIGIN = process.env.SESHAT_BACKEND_ORIGIN || 'http://127.0.0.1:8090'
const AUTH_SESSION_KEY = 'seshat-desktop-auth-session'
const STREAM_EVENT_CHANNEL = 'http:stream:event'

let cachedSession: StoredSession | null = null
const activeStreams = new Map<string, { controller: AbortController; webContentsId: number }>()

function buildBackendURL(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`
  return `${BACKEND_ORIGIN}/api/v1${normalized}`
}

function sessionView(session: StoredSession | null) {
  if (!session) return null
  return {
    user: session.user,
    roles: session.roles,
    isAuthenticated: true
  }
}

async function parseResponse(res: Response) {
  const text = await res.text().catch(() => '')
  const contentType = res.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) {
    return { ok: res.ok, status: res.status, text }
  }

  try {
    return {
      ok: res.ok,
      status: res.status,
      data: text ? JSON.parse(text) : undefined,
      text
    }
  } catch {
    return { ok: res.ok, status: res.status, text }
  }
}

function extractErrorMessage(payload: { status: number; data?: unknown; text?: string }): string {
  if (payload.data && typeof payload.data === 'object') {
    const data = payload.data as { error?: string | { message?: string }; message?: string }
    if (data.error && typeof data.error === 'object') return data.error.message ?? payload.text ?? `HTTP ${payload.status}`
    if (typeof data.error === 'string' && data.error.trim()) return data.error
    if (typeof data.message === 'string' && data.message.trim()) return data.message
  }
  return payload.text || `HTTP ${payload.status}`
}

async function loadSession(): Promise<StoredSession | null> {
  if (cachedSession) return cachedSession
  const raw = await getSecret(AUTH_SESSION_KEY)
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as StoredSession
    if (!parsed?.token || !parsed?.user) return null
    cachedSession = parsed
    return parsed
  } catch {
    return null
  }
}

async function saveSession(session: StoredSession): Promise<void> {
  cachedSession = session
  await setSecret(AUTH_SESSION_KEY, JSON.stringify(session))
}

async function clearSession(): Promise<void> {
  cachedSession = null
  await deleteSecret(AUTH_SESSION_KEY)
}

async function performJSONRequest(path: string, method: string, body: unknown, token?: string) {
  const url = buildBackendURL(path)
  const headers: Record<string, string> = {
    Accept: 'application/json'
  }
  let requestBody: string | undefined
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    requestBody = JSON.stringify(body)
  }
  if (token) headers.Authorization = `Bearer ${token}`

  let res: Response
  try {
    res = await fetch(url, {
      method,
      headers,
      body: requestBody
    })
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'request failed'
    return {
      ok: false,
      status: 0,
      text: `Cannot reach the local Seshat backend at ${BACKEND_ORIGIN}. ${detail}`
    }
  }

  const payload = await parseResponse(res)
  if (res.status === 401) await clearSession()
  return payload
}

async function performFileUpload(payload: UploadFilePayload, token?: string) {
  const path = normalizeSessionUploadPath(payload.path)
  const filename = payload.filename.trim()
  if (!filename || filename.length > 512) throw new Error('Invalid filename')
  if (!(payload.data instanceof ArrayBuffer) || payload.data.byteLength === 0) throw new Error('File is empty')

  const body = new FormData()
  body.append('file', new Blob([payload.data], { type: payload.contentType || 'application/octet-stream' }), filename)
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`

  try {
    const res = await fetch(buildBackendURL(path), { method: 'POST', headers, body })
    const parsed = await parseResponse(res)
    if (res.status === 401) await clearSession()
    return parsed
  } catch (err) {
    return { ok: false, status: 0, text: err instanceof Error ? err.message : 'Upload failed' }
  }
}

async function performFileDownload(path: string, token?: string) {
  const headers: Record<string, string> = {}
  if (token) headers.Authorization = `Bearer ${token}`
  try {
    const res = await fetch(buildBackendURL(normalizeFileContentPath(path)), { headers })
    if (!res.ok) {
      const parsed = await parseResponse(res)
      if (res.status === 401) await clearSession()
      return parsed
    }
    const data = Buffer.from(await res.arrayBuffer()).toString('base64')
    return {
      ok: true,
      status: res.status,
      data: {
        dataBase64: data,
        contentType: res.headers.get('content-type') || 'application/octet-stream'
      }
    }
  } catch (err) {
    return { ok: false, status: 0, text: err instanceof Error ? err.message : 'Download failed' }
  }
}

async function startStream(event: IpcMainInvokeEvent, payload: StreamStartPayload, token?: string) {
  const controller = new AbortController()
  const headers: Record<string, string> = {
    Accept: 'text/event-stream',
    'Content-Type': 'application/json'
  }
  if (token) headers.Authorization = `Bearer ${token}`

  let res: Response
  try {
    res = await fetch(buildBackendURL(payload.path), {
      method: payload.method || 'POST',
      headers,
      body: JSON.stringify(payload.body ?? {}),
      signal: controller.signal
    })
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'stream request failed'
    return {
      error: `Cannot reach the local Seshat backend at ${BACKEND_ORIGIN}. ${detail}`,
      retryable: true
    }
  }

  if (!res.ok) {
    const parsed = await parseResponse(res)
    if (res.status === 401) await clearSession()
    return {
      error: extractErrorMessage(parsed),
      retryable: false,
      unauthorized: res.status === 401
    }
  }

  const reader = res.body?.getReader()
  if (!reader) {
    return { error: 'No response body', retryable: false }
  }

  const streamId = randomUUID()
  activeStreams.set(streamId, { controller, webContentsId: event.sender.id })

  void (async () => {
    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { value, done } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const frames = buffer.split(/\n\n/)
        buffer = frames.pop() ?? ''

        for (const frame of frames) {
          const parsed = parseSSEFrame(frame)
          if (!parsed || event.sender.isDestroyed()) continue
          event.sender.send(STREAM_EVENT_CHANNEL, {
            streamId,
            name: parsed.name,
            data: parsed.data
          })
        }
      }

      if (buffer.trim()) {
        const parsed = parseSSEFrame(buffer)
        if (parsed && !event.sender.isDestroyed()) {
          event.sender.send(STREAM_EVENT_CHANNEL, {
            streamId,
            name: parsed.name,
            data: parsed.data
          })
        }
      }
    } catch (err) {
      if (!controller.signal.aborted && !event.sender.isDestroyed()) {
        event.sender.send(STREAM_EVENT_CHANNEL, {
          streamId,
          name: 'error',
          data: { error: err instanceof Error ? err.message : 'Streaming failed' }
        })
      }
    } finally {
      activeStreams.delete(streamId)
      try {
        reader.releaseLock()
      } catch {
        // noop
      }
    }
  })()

  return { streamId }
}

function parseSSEFrame(frame: string): { name: string; data: Record<string, unknown> } | null {
  const lines = frame.split(/\r?\n/)
  let name = 'message'
  const data: string[] = []

  for (const line of lines) {
    if (line.startsWith(':')) continue
    if (line.startsWith('event:')) name = line.slice(6).trim()
    if (line.startsWith('data:')) data.push(line.slice(5).trimStart())
  }

  if (data.length === 0) return null
  try {
    return { name, data: JSON.parse(data.join('\n')) as Record<string, unknown> }
  } catch {
    return { name, data: { message: data.join('\n') } }
  }
}

export function registerBackendHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('auth:login', async (event, credentials: { email: string; password: string }) => {
    assertTrustedSender(event)
    const payload = await performJSONRequest('/auth/login', 'POST', credentials)
    if (!payload.ok) throw new Error(extractErrorMessage(payload))

    const data = payload.data as { token: string; user: AuthUser; roles?: string[] }
    await saveSession({ token: data.token, user: data.user, roles: data.roles ?? [] })
    return sessionView(cachedSession)
  })

  ipcMain.handle('auth:register', async (event, registration: { name: string; email: string; password: string }) => {
    assertTrustedSender(event)
    const payload = await performJSONRequest('/auth/register', 'POST', registration)
    if (!payload.ok) throw new Error(extractErrorMessage(payload))

    const data = payload.data as { token: string; user: AuthUser; roles?: string[] }
    await saveSession({ token: data.token, user: data.user, roles: data.roles ?? [] })
    return sessionView(cachedSession)
  })

  ipcMain.handle('auth:logout', async (event) => {
    assertTrustedSender(event)
    const session = await loadSession()
    try {
      if (session?.token) await performJSONRequest('/auth/logout', 'POST', undefined, session.token)
    } finally {
      await clearSession()
    }
  })

  ipcMain.handle('auth:restore-session', async (event) => {
    assertTrustedSender(event)
    return sessionView(await loadSession())
  })

  ipcMain.handle('auth:clear-session', async (event) => {
    assertTrustedSender(event)
    await clearSession()
  })

  ipcMain.handle('http:request', async (event, payload: RequestPayload) => {
    assertTrustedSender(event)
    const session = await loadSession()
    return performJSONRequest(payload.path, payload.method || 'GET', payload.body, session?.token)
  })

  ipcMain.handle('http:upload-file', async (event, payload: UploadFilePayload) => {
    assertTrustedSender(event)
    const session = await loadSession()
    return performFileUpload(payload, session?.token)
  })

  ipcMain.handle('http:download-file', async (event, path: string) => {
    assertTrustedSender(event)
    const session = await loadSession()
    return performFileDownload(path, session?.token)
  })

  ipcMain.handle('http:stream:start', async (event, payload: StreamStartPayload) => {
    assertTrustedSender(event)
    const session = await loadSession()
    return startStream(event, payload, session?.token)
  })

  ipcMain.handle('http:stream:cancel', async (event, streamId: string) => {
    assertTrustedSender(event)
    const active = activeStreams.get(streamId)
    if (!active || active.webContentsId !== event.sender.id) return
    active.controller.abort()
    activeStreams.delete(streamId)
  })
}
