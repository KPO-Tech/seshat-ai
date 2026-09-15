import type { IpcMain } from 'electron'
import { deleteSecret, getSecret, setSecret } from './secure-store'
import { assertTrustedSender } from './trusted-sender'

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

const BACKEND_ORIGIN = process.env.SESHAT_BACKEND_ORIGIN || 'http://127.0.0.1:8090'
const AUTH_SESSION_KEY = 'seshat-desktop-auth-session'

let cachedSession: StoredSession | null = null

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
}
