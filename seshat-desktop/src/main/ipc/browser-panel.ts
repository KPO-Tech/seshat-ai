import { BrowserWindow, WebContentsView, shell, webContents, type IpcMain, type IpcMainInvokeEvent } from 'electron'
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
  pageId?: string
  targetId?: string
}

type BrowserAgentPage = {
  pageId?: string
  targetId?: string
  url?: string
  title?: string
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
      const bounds = normalizeBounds(lastBounds)
      tab.view.setBounds(bounds)
      tab.view.webContents.focus()
      // Windows/Chromium sometimes fails to recomposite the whole window
      // (renders solid black) right after a native child view is attached,
      // until something forces a repaint. Nudging the bounds on the next
      // tick reliably kicks the compositor - this is a known Electron/DWM
      // interaction, not a sizing bug (bounds above are already correct).
      setImmediate(() => {
        if (tab.view.webContents.isDestroyed()) return
        tab.view.setBounds({ ...bounds, height: Math.max(1, bounds.height - 1) })
        tab.view.setBounds(bounds)
      })
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
    // The panel is a fixed viewport with no chrome for a page's own
    // scrollbar to sit next to - hide it per-page so the embedded view
    // reads as part of our UI rather than a bare browser window. Injected
    // on both events since dom-ready can fire before a page's own CSS
    // would otherwise win the cascade on some sites (e.g. Google's SPA
    // shell re-renders after dom-ready).
    const hideScrollbars = () => {
      void contents.insertCSS(`
        html, body { scrollbar-width: none !important; -ms-overflow-style: none !important; }
        ::-webkit-scrollbar { width: 0 !important; height: 0 !important; display: none !important; }
      `).catch(() => undefined)
    }
    contents.on('dom-ready', hideScrollbars)
    contents.on('did-finish-load', hideScrollbars)
    const onChange = () => broadcastState(contextId)
    contents.on('did-start-loading', onChange)
    contents.on('did-stop-loading', onChange)
    contents.on('did-navigate', onChange)
    contents.on('did-navigate-in-page', onChange)
    contents.on('page-title-updated', onChange)
    contents.once('destroyed', () => {
      const ctx = contexts.get(contextId)
      if (!ctx) return
      const index = ctx.tabs.findIndex((item) => item.id === tab.id)
      if (index >= 0) ctx.tabs.splice(index, 1)
      if (ctx.activeTabId === tab.id) {
        const next = ctx.tabs[Math.min(index, ctx.tabs.length - 1)]
        ctx.activeTabId = next?.id ?? null
        if (next && currentContextId === contextId && visible) attachActive()
      }
      broadcastState(contextId)
    })
  }

  function createTab(contextId: string, rawUrl?: string) {
    const ctx = context(contextId)
    const previous = activeTab(ctx)
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
    detach(previous)
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

  async function listTargets(): Promise<Array<{ id?: string; type?: string; url?: string; title?: string }>> {
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

  function targetIdForTab(tab: BrowserTab) {
    if (tab.targetId) return tab.targetId
    if (tab.view.webContents.isDestroyed()) return ''
    return tab.view.webContents.getOrCreateDevToolsTargetId()
  }

  async function resolveAgentTarget(page: BrowserAgentPage) {
    const requestedTargetId = typeof page.targetId === 'string' ? page.targetId.trim() : ''
    if (requestedTargetId) return requestedTargetId

    const requestedUrl = typeof page.url === 'string' ? page.url.trim() : ''
    if (!requestedUrl) return ''
    const adopted = new Set([...contexts.values()].flatMap((ctx) => ctx.tabs.map(targetIdForTab)).filter(Boolean))
    const targets = await listTargets()
    const candidates = targets.filter((target) => (
      target.type === 'page' &&
      typeof target.id === 'string' &&
      !adopted.has(target.id) &&
      target.url === requestedUrl
    ))
    const requestedTitle = typeof page.title === 'string' ? page.title.trim() : ''
    return candidates.find((target) => requestedTitle && target.title === requestedTitle)?.id ?? candidates[0]?.id ?? ''
  }

  function activateTab(contextId: string, tab: BrowserTab) {
    const ctx = context(contextId)
    const previous = activeTab(ctx)
    if (previous?.id !== tab.id) detach(previous)
    ctx.activeTabId = tab.id
    foreground(contextId)
    attachActive()
  }

  async function adoptAgentPage(contextId: string, page: BrowserAgentPage) {
    const id = normalizeContextId(contextId)
    const ctx = context(id)
    const existingByPage = page.pageId ? ctx.tabs.find((tab) => tab.pageId === page.pageId) : undefined
    if (existingByPage) {
      activateTab(id, existingByPage)
      return state(id)
    }

    const targetId = await resolveAgentTarget(page)
    if (!targetId) return state(id)
    const existingByTarget = ctx.tabs.find((tab) => targetIdForTab(tab) === targetId)
    if (existingByTarget) {
      existingByTarget.pageId = page.pageId || existingByTarget.pageId
      activateTab(id, existingByTarget)
      return state(id)
    }

    const contents = webContents.fromDevToolsTargetId(targetId)
    if (!contents || contents.isDestroyed()) return state(id)
    tabCounter += 1
    const tab: BrowserTab = {
      id: `agent_${Date.now().toString(36)}_${tabCounter.toString(36)}`,
      view: new WebContentsView({ webContents: contents }),
      pageId: page.pageId,
      targetId
    }
    wireTab(id, tab)

    const placeholder = activeTab(ctx)
    if (placeholder && ctx.tabs.length === 1 && !placeholder.targetId) {
      detach(placeholder)
      ctx.tabs = []
      if (!placeholder.view.webContents.isDestroyed()) placeholder.view.webContents.close()
    }
    ctx.tabs.push(tab)
    visible = true
    activateTab(id, tab)
    broadcastState(id)
    return state(id)
  }

  function closeTab(contextId: string, tabId: string) {
    const id = normalizeContextId(contextId)
    const ctx = context(id)
    const index = ctx.tabs.findIndex((tab) => tab.id === tabId)
    if (index < 0) return state(id)
    const [tab] = ctx.tabs.splice(index, 1)
    detach(tab)
    if (!tab.view.webContents.isDestroyed()) tab.view.webContents.close()
    const next = ctx.tabs[Math.min(index, ctx.tabs.length - 1)]
    ctx.activeTabId = next?.id ?? null
    if (next) activateTab(id, next)
    broadcastState(id)
    return state(id)
  }

  function destroyContext(contextId: string) {
    const id = normalizeContextId(contextId)
    const ctx = contexts.get(id)
    if (!ctx) return
    contexts.delete(id)
    for (const tab of ctx.tabs) {
      detach(tab)
      if (!tab.view.webContents.isDestroyed()) tab.view.webContents.close()
    }
    if (currentContextId === id) {
      currentContextId = null
      visible = false
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
      ipcMain.handle('browser-panel:adopt-page', (event, contextId: string, page: BrowserAgentPage) => trusted(event, () => adoptAgentPage(contextId, page)))
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
          activateTab(id, tab)
          broadcastState(id)
        }
        return state(id)
      }))
      ipcMain.handle('browser-panel:close-tab', (event, contextId: string, tabId: string) => trusted(event, () => closeTab(contextId, tabId)))
      ipcMain.handle('browser-panel:destroy-context', (event, contextId: string) => trusted(event, () => destroyContext(contextId)))
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
