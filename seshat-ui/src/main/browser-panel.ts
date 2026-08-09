import { WebContentsView, shell, type BrowserWindow, type IpcMain, type IpcMainInvokeEvent } from 'electron'
import { assertTrustedSender } from './ipc/trusted-sender'

const BROWSER_SESSION_PARTITION = 'persist:seshat-browser'
const BROWSER_DEFAULT_URL = 'about:blank'
const BROWSER_HOME_URL = 'https://www.google.com/'
const TARGET_RESOLVE_TIMEOUT_MS = 2500
const TARGET_RESOLVE_INTERVAL_MS = 80

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

type BrowserPanelOptions = {
  getWindow: () => BrowserWindow | null
  remoteDebugPort: number
}

type BrowserTab = {
  id: string
  view: WebContentsView
}

function normalizeBrowserUrl(input?: string, fallback = BROWSER_DEFAULT_URL): string {
  const raw = typeof input === 'string' && input.trim() ? input.trim() : fallback
  if (!raw || raw === 'about:blank') return 'about:blank'
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
}

function normalizeBounds(bounds: BrowserPanelBounds): BrowserPanelBounds {
  return {
    x: Math.max(0, Math.round(Number(bounds.x) || 0)),
    y: Math.max(0, Math.round(Number(bounds.y) || 0)),
    width: Math.max(1, Math.round(Number(bounds.width) || 1)),
    height: Math.max(1, Math.round(Number(bounds.height) || 1)),
  }
}

function targetMarkerUrl(tabId: string): string {
  const marker = `seshat-browser-tab:${tabId}`
  const html = `<!doctype html><title>${marker}</title><meta name="seshat-browser-tab" content="${tabId}"><body>${marker}</body>`
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`
}

export function createBrowserPanel({ getWindow, remoteDebugPort }: BrowserPanelOptions) {
  let tabCounter = 0
  let activeTab: BrowserTab | null = null
  let visible = false
  let lastBounds: BrowserPanelBounds | null = null

  function cdpBrowserUrl(): string {
    return `http://127.0.0.1:${remoteDebugPort}`
  }

  function window(): BrowserWindow | null {
    const win = getWindow()
    return win && !win.isDestroyed() ? win : null
  }

  function send(channel: string, payload?: unknown) {
    const win = window()
    if (!win || win.webContents.isDestroyed()) return
    win.webContents.send(channel, payload)
  }

  function serializeTab(tab: BrowserTab | null): BrowserPanelTab[] {
    if (!tab || tab.view.webContents.isDestroyed()) return []
    const webContents = tab.view.webContents
    const url = webContents.getURL()
    return [{
      id: tab.id,
      label: webContents.getTitle() || (url === 'about:blank' ? 'New tab' : url),
      url,
      status: webContents.isLoading() ? 'loading' : 'ready',
      canGoBack: webContents.canGoBack(),
      canGoForward: webContents.canGoForward(),
    }]
  }

  function state(): BrowserPanelState {
    return {
      activeTabId: activeTab?.id ?? null,
      tabs: serializeTab(activeTab),
    }
  }

  function broadcastState() {
    send('seshat:browser:state', state())
  }

  function attachActiveView() {
    const win = window()
    if (!win || !activeTab || !visible || !lastBounds) return
    try {
      win.contentView.addChildView(activeTab.view)
      activeTab.view.setBounds(normalizeBounds(lastBounds))
      activeTab.view.webContents.focus()
    } catch (error) {
      console.warn('[browser] failed to attach view', error)
    }
  }

  function createTab(rawUrl?: string): BrowserTab {
    const existing = activeTab
    if (existing && !existing.view.webContents.isDestroyed()) {
      void existing.view.webContents.loadURL(normalizeBrowserUrl(rawUrl)).catch((error) => {
        console.warn('[browser] navigation failed', error)
      })
      return existing
    }

    tabCounter += 1
    const tab: BrowserTab = {
      id: `tab_${Date.now().toString(36)}_${tabCounter.toString(36)}`,
      view: new WebContentsView({
        webPreferences: {
          partition: BROWSER_SESSION_PARTITION,
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
        },
      }),
    }

    const webContents = tab.view.webContents
    webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//i.test(url)) {
        void webContents.loadURL(url).catch(() => undefined)
      } else {
        void shell.openExternal(url).catch(() => undefined)
      }
      return { action: 'deny' }
    })
    webContents.on('did-start-loading', broadcastState)
    webContents.on('did-stop-loading', broadcastState)
    webContents.on('did-navigate', broadcastState)
    webContents.on('did-navigate-in-page', broadcastState)
    webContents.on('page-title-updated', broadcastState)
    webContents.on('destroyed', broadcastState)

    activeTab = tab
    void webContents.loadURL(normalizeBrowserUrl(rawUrl)).catch((error) => {
      console.warn('[browser] initial navigation failed', error)
    })
    attachActiveView()
    broadcastState()
    return tab
  }

  async function listCdpTargets(): Promise<Array<{ id?: string; type?: string; url?: string }>> {
    if (!remoteDebugPort || remoteDebugPort <= 0) return []
    const response = await fetch(`${cdpBrowserUrl()}/json/list`, { signal: AbortSignal.timeout(1000) })
    if (!response.ok) throw new Error(`CDP target list failed: HTTP ${response.status}`)
    const targets = await response.json()
    return Array.isArray(targets) ? targets : []
  }

  async function resolveCdpTargetId(tabId: string): Promise<string> {
    const marker = encodeURIComponent(`seshat-browser-tab:${tabId}`)
    const deadline = Date.now() + TARGET_RESOLVE_TIMEOUT_MS
    while (Date.now() < deadline) {
      const targets = await listCdpTargets().catch(() => [])
      const target = targets.find((candidate) => (
        candidate.type === 'page' &&
        typeof candidate.id === 'string' &&
        typeof candidate.url === 'string' &&
        candidate.url.includes(marker)
      ))
      if (target?.id) return target.id
      await new Promise((resolve) => setTimeout(resolve, TARGET_RESOLVE_INTERVAL_MS))
    }
    throw new Error('Could not resolve built-in browser CDP target.')
  }

  async function openUrlForAutomation(rawUrl?: string, provider = 'auto') {
    const requestedProvider = String(provider || 'auto').trim().toLowerCase()
    if (requestedProvider !== 'auto' && requestedProvider !== 'builtin') {
      throw new Error(`Browser provider is not available yet: ${requestedProvider}`)
    }
    const tab = createTab('about:blank')
    visible = true
    attachActiveView()
    await tab.view.webContents.loadURL(targetMarkerUrl(tab.id))
    const targetId = await resolveCdpTargetId(tab.id)
    const url = normalizeBrowserUrl(rawUrl)
    await tab.view.webContents.loadURL(url)
    send('seshat:browser:panel-opened', state())
    return {
      provider: 'builtin',
      browser_url: cdpBrowserUrl(),
      target_id: targetId,
      tab_id: tab.id,
      url,
    }
  }

  function detachView() {
    const win = window()
    if (!win || !activeTab || activeTab.view.webContents.isDestroyed()) return
    try {
      win.contentView.removeChildView(activeTab.view)
    } catch {
      // Already detached.
    }
  }

  function trusted<T>(event: IpcMainInvokeEvent, fn: () => T): T {
    assertTrustedSender(event)
    return fn()
  }

  return {
    registerIpc(ipcMain: IpcMain) {
      ipcMain.handle('seshat:browser:show', (event, bounds?: BrowserPanelBounds) => trusted(event, () => {
        if (bounds) lastBounds = normalizeBounds(bounds)
        visible = true
        createTab(BROWSER_HOME_URL)
        attachActiveView()
        send('seshat:browser:panel-opened', state())
        broadcastState()
        return state()
      }))
      ipcMain.handle('seshat:browser:hide', (event) => trusted(event, () => {
        visible = false
        detachView()
        send('seshat:browser:panel-closed', state())
        return state()
      }))
      ipcMain.handle('seshat:browser:bounds', (event, bounds: BrowserPanelBounds) => trusted(event, () => {
        lastBounds = normalizeBounds(bounds)
        if (visible && activeTab && !activeTab.view.webContents.isDestroyed()) {
          activeTab.view.setBounds(lastBounds)
        }
        return state()
      }))
      ipcMain.handle('seshat:browser:state', (event) => trusted(event, () => state()))
      ipcMain.handle('seshat:browser:openUrl', (event, url?: string, provider?: string) => trusted(event, () => openUrlForAutomation(url, provider)))
      ipcMain.handle('seshat:browser:navigate', (event, url?: string) => trusted(event, async () => {
        const tab = createTab()
        await tab.view.webContents.loadURL(normalizeBrowserUrl(url))
        broadcastState()
        return state()
      }))
      ipcMain.handle('seshat:browser:back', (event) => trusted(event, () => {
        const webContents = activeTab?.view.webContents
        if (webContents?.canGoBack()) webContents.goBack()
        return state()
      }))
      ipcMain.handle('seshat:browser:forward', (event) => trusted(event, () => {
        const webContents = activeTab?.view.webContents
        if (webContents?.canGoForward()) webContents.goForward()
        return state()
      }))
      ipcMain.handle('seshat:browser:reload', (event) => trusted(event, () => {
        activeTab?.view.webContents.reload()
        return state()
      }))
      ipcMain.handle('seshat:browser:destroy', (event) => trusted(event, () => {
        visible = false
        detachView()
        if (activeTab && !activeTab.view.webContents.isDestroyed()) activeTab.view.webContents.close()
        activeTab = null
        broadcastState()
        return state()
      }))
    },
    destroy() {
      visible = false
      detachView()
      if (activeTab && !activeTab.view.webContents.isDestroyed()) activeTab.view.webContents.close()
      activeTab = null
    },
  }
}
