import { BrowserWindow, WebContentsView, shell, type IpcMain, type IpcMainInvokeEvent } from 'electron'
import { assertTrustedSender } from './trusted-sender'

type BrowserPanelBounds = {
  x: number
  y: number
  width: number
  height: number
}

type BrowserPanelTab = {
  id: string
  label: string
  url: string
  status: 'loading' | 'ready'
  canGoBack: boolean
  canGoForward: boolean
}

type BrowserPanelState = {
  activeTabId: string | null
  tabs: BrowserPanelTab[]
}

type BrowserContext = {
  tabs: BrowserTab[]
  activeTabId: string | null
}

type BrowserTab = {
  id: string
  view: WebContentsView
}

type BrowserPanelOptions = {
  getWindow: () => BrowserWindow | null
  remoteDebugPort: number
}

const BROWSER_SESSION_PARTITION = 'persist:seshat-browser'
const DEFAULT_CONTEXT_ID = 'chat'
const DEFAULT_URL = 'about:blank'
const HOME_URL = 'https://www.google.com/'
const TARGET_RESOLVE_TIMEOUT_MS = 2500
const TARGET_RESOLVE_INTERVAL_MS = 80

export function createBrowserPanel({ getWindow, remoteDebugPort }: BrowserPanelOptions) {
  let tabCounter = 0
  let currentContextId: string | null = null
  let visible = false
  let lastBounds: BrowserPanelBounds | null = null
  const contexts = new Map<string, BrowserContext>()

  function window() {
    const win = getWindow()
    return win && !win.isDestroyed() ? win : null
  }

  function send(channel: string, payload?: unknown) {
    const win = window()
    if (!win || win.webContents.isDestroyed()) return
    win.webContents.send(channel, payload)
  }

  function context(id: string) {
    let ctx = contexts.get(id)
    if (!ctx) {
      ctx = { tabs: [], activeTabId: null }
      contexts.set(id, ctx)
    }
    return ctx
  }

  function activeTab(ctx: BrowserContext) {
    if (!ctx.activeTabId) return undefined
    return ctx.tabs.find((tab) => tab.id === ctx.activeTabId && !tab.view.webContents.isDestroyed())
  }

  function normalizeContextId(value?: string) {
    const id = typeof value === 'string' ? value.trim() : ''
    return id || DEFAULT_CONTEXT_ID
  }

  function normalizeBounds(bounds: BrowserPanelBounds): BrowserPanelBounds {
    return {
      x: Math.max(0, Math.round(Number(bounds.x) || 0)),
      y: Math.max(0, Math.round(Number(bounds.y) || 0)),
      width: Math.max(1, Math.round(Number(bounds.width) || 1)),
      height: Math.max(1, Math.round(Number(bounds.height) || 1))
    }
  }

  function normalizeUrl(input?: string, fallback = DEFAULT_URL) {
    const raw = typeof input === 'string' && input.trim() ? input.trim() : fallback
    if (!raw || raw === 'about:blank') return 'about:blank'
    if (/^https?:\/\//i.test(raw)) return raw
    const hostLike = !/\s/.test(raw) && (/\.[a-z]{2,}$/i.test(raw) || /^localhost(:\d+)?$/i.test(raw))
    return hostLike ? `https://${raw}` : `https://www.google.com/search?q=${encodeURIComponent(raw)}`
  }

  function serializeTab(tab: BrowserTab): BrowserPanelTab {
    const contents = tab.view.webContents
    const url = contents.getURL()
    return {
      id: tab.id,
      label: contents.getTitle() || (url === 'about:blank' ? 'New tab' : url),
      url,
      status: contents.isLoading() ? 'loading' : 'ready',
      canGoBack: contents.canGoBack(),
      canGoForward: contents.canGoForward()
    }
  }

  function state(contextId: string): BrowserPanelState {
    const ctx = context(contextId)
    return {
      activeTabId: ctx.activeTabId,
      tabs: ctx.tabs.filter((tab) => !tab.view.webContents.isDestroyed()).map(serializeTab)
    }
  }

  function broadcastState(contextId: string) {
    send('browser-panel:state', { contextId, state: state(contextId) })
  }

  function detach(tab?: BrowserTab) {
    const win = window()
    if (!win || !tab || tab.view.webContents.isDestroyed()) return
    try {
      win.contentView.removeChildView(tab.view)
    } catch {
      return
    }
  }

  function detachCurrent() {
    if (!currentContextId) return
    detach(activeTab(context(currentContextId)))
  }

  function attachActive() {
    const win = window()
    if (!win || !currentContextId || !visible || !lastBounds) return
    const tab = activeTab(context(currentContextId))
    if (!tab) return
    try {
      win.contentView.addChildView(tab.view)
      tab.view.setBounds(normalizeBounds(lastBounds))
      tab.view.webContents.focus()
    } catch {
      return
    }
  }

  function foreground(contextId: string) {
    if (currentContextId === contextId) return
    detachCurrent()
    currentContextId = contextId
  }

  function wireTab(contextId: string, tab: BrowserTab) {
    const contents = tab.view.webContents
    contents.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//i.test(url)) {
        createTab(contextId, url)
      } else {
        void shell.openExternal(url).catch(() => undefined)
      }
      return { action: 'deny' }
    })
    const onChange = () => broadcastState(contextId)
    contents.on('did-start-loading', onChange)
    contents.on('did-stop-loading', onChange)
    contents.on('did-navigate', onChange)
    contents.on('did-navigate-in-page', onChange)
    contents.on('page-title-updated', onChange)
    contents.on('destroyed', onChange)
  }

  function createTab(contextId: string, rawUrl?: string) {
    const ctx = context(contextId)
    tabCounter += 1
    const tab: BrowserTab = {
      id: `tab_${Date.now().toString(36)}_${tabCounter.toString(36)}`,
      view: new WebContentsView({
        webPreferences: {
          partition: BROWSER_SESSION_PARTITION,
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true
        }
      })
    }
    wireTab(contextId, tab)
    ctx.tabs.push(tab)
    ctx.activeTabId = tab.id
    foreground(contextId)
    attachActive()
    void tab.view.webContents.loadURL(normalizeUrl(rawUrl)).catch(() => undefined)
    broadcastState(contextId)
    return tab
  }

  function markerUrl(tabId: string) {
    const marker = `seshat-browser-tab:${tabId}`
    const html = `<!doctype html><title>${marker}</title><meta name="seshat-browser-tab" content="${tabId}"><body>${marker}</body>`
    return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`
  }

  async function listTargets(): Promise<Array<{ id?: string; type?: string; url?: string }>> {
    if (!remoteDebugPort || remoteDebugPort <= 0) return []
    const response = await fetch(`http://127.0.0.1:${remoteDebugPort}/json/list`, { signal: AbortSignal.timeout(1000) })
    if (!response.ok) return []
    const targets = await response.json()
    return Array.isArray(targets) ? targets : []
  }

  async function resolveTargetId(tabId: string) {
    const marker = encodeURIComponent(`seshat-browser-tab:${tabId}`)
    const deadline = Date.now() + TARGET_RESOLVE_TIMEOUT_MS
    while (Date.now() < deadline) {
      const target = (await listTargets()).find((item) => (
        item.type === 'page' &&
        typeof item.id === 'string' &&
        typeof item.url === 'string' &&
        item.url.includes(marker)
      ))
      if (target?.id) return target.id
      await new Promise((resolve) => setTimeout(resolve, TARGET_RESOLVE_INTERVAL_MS))
    }
    throw new Error('Could not resolve browser target.')
  }

  async function openUrl(rawUrl?: string, sessionId?: string) {
    const contextId = sessionId ? `session:${sessionId}` : DEFAULT_CONTEXT_ID
    visible = true
    foreground(contextId)
    const ctx = context(contextId)
    let tab = activeTab(ctx)
    if (!tab) tab = createTab(contextId, DEFAULT_URL)
    attachActive()
    await tab.view.webContents.loadURL(markerUrl(tab.id))
    const targetId = await resolveTargetId(tab.id)
    const url = normalizeUrl(rawUrl, HOME_URL)
    await tab.view.webContents.loadURL(url)
    send('browser-panel:opened', { contextId, state: state(contextId) })
    broadcastState(contextId)
    return {
      provider: 'builtin',
      browser_url: `http://127.0.0.1:${remoteDebugPort}`,
      target_id: targetId,
      tab_id: tab.id,
      url
    }
  }

  function trusted<T>(event: IpcMainInvokeEvent, fn: () => T): T {
    assertTrustedSender(event)
    return fn()
  }

  return {
    registerIpc(ipcMain: IpcMain) {
      ipcMain.handle('browser-panel:show', (event, contextId: string, bounds?: BrowserPanelBounds) => trusted(event, () => {
        const id = normalizeContextId(contextId)
        if (bounds) lastBounds = normalizeBounds(bounds)
        visible = true
        foreground(id)
        const ctx = context(id)
        if (ctx.tabs.length === 0) createTab(id, HOME_URL)
        attachActive()
        send('browser-panel:opened', { contextId: id, state: state(id) })
        broadcastState(id)
        return state(id)
      }))
      ipcMain.handle('browser-panel:hide', (event, contextId: string) => trusted(event, () => {
        const id = normalizeContextId(contextId)
        visible = false
        if (currentContextId === id) detachCurrent()
        send('browser-panel:closed', { contextId: id, state: state(id) })
        return state(id)
      }))
      ipcMain.handle('browser-panel:bounds', (event, contextId: string, bounds: BrowserPanelBounds) => trusted(event, () => {
        const id = normalizeContextId(contextId)
        lastBounds = normalizeBounds(bounds)
        if (visible && currentContextId === id) activeTab(context(id))?.view.setBounds(lastBounds)
        return state(id)
      }))
      ipcMain.handle('browser-panel:state', (event, contextId: string) => trusted(event, () => state(normalizeContextId(contextId))))
      ipcMain.handle('browser-panel:open-url', (event, url?: string, sessionId?: string) => trusted(event, () => openUrl(url, sessionId)))
      ipcMain.handle('browser-panel:navigate', (event, contextId: string, url?: string) => trusted(event, async () => {
        const id = normalizeContextId(contextId)
        const ctx = context(id)
        const tab = activeTab(ctx) ?? createTab(id, DEFAULT_URL)
        await tab.view.webContents.loadURL(normalizeUrl(url, HOME_URL)).catch(() => undefined)
        broadcastState(id)
        return state(id)
      }))
      ipcMain.handle('browser-panel:back', (event, contextId: string) => trusted(event, () => {
        const tab = activeTab(context(normalizeContextId(contextId)))
        if (tab?.view.webContents.canGoBack()) tab.view.webContents.goBack()
        return state(normalizeContextId(contextId))
      }))
      ipcMain.handle('browser-panel:forward', (event, contextId: string) => trusted(event, () => {
        const tab = activeTab(context(normalizeContextId(contextId)))
        if (tab?.view.webContents.canGoForward()) tab.view.webContents.goForward()
        return state(normalizeContextId(contextId))
      }))
      ipcMain.handle('browser-panel:reload', (event, contextId: string) => trusted(event, () => {
        activeTab(context(normalizeContextId(contextId)))?.view.webContents.reload()
        return state(normalizeContextId(contextId))
      }))
      ipcMain.handle('browser-panel:new-tab', (event, contextId: string, url?: string) => trusted(event, () => {
        const id = normalizeContextId(contextId)
        visible = true
        createTab(id, url || HOME_URL)
        send('browser-panel:opened', { contextId: id, state: state(id) })
        return state(id)
      }))
      ipcMain.handle('browser-panel:switch-tab', (event, contextId: string, tabId: string) => trusted(event, () => {
        const id = normalizeContextId(contextId)
        const ctx = context(id)
        const tab = ctx.tabs.find((item) => item.id === tabId && !item.view.webContents.isDestroyed())
        if (tab) {
          ctx.activeTabId = tab.id
          foreground(id)
          attachActive()
          broadcastState(id)
        }
        return state(id)
      }))
    },
    destroy() {
      visible = false
      for (const ctx of contexts.values()) {
        for (const tab of ctx.tabs) {
          detach(tab)
          if (!tab.view.webContents.isDestroyed()) tab.view.webContents.close()
        }
      }
      contexts.clear()
    }
  }
}
