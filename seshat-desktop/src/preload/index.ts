import { contextBridge, ipcRenderer } from 'electron'

const desktop = {
  version: appVersion()
}

const nexus = {
  auth: {
    login: (credentials: { email: string; password: string }) => ipcRenderer.invoke('auth:login', credentials),
    register: (payload: { name: string; email: string; password: string }) => ipcRenderer.invoke('auth:register', payload),
    logout: () => ipcRenderer.invoke('auth:logout'),
    restoreSession: () => ipcRenderer.invoke('auth:restore-session'),
    clearSession: () => ipcRenderer.invoke('auth:clear-session')
  },
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close')
  },
  secureStore: {
    set: (key: string, value: string): Promise<void> => ipcRenderer.invoke('secure-store:set', key, value),
    get: (key: string): Promise<string | null> => ipcRenderer.invoke('secure-store:get', key),
    delete: (key: string): Promise<void> => ipcRenderer.invoke('secure-store:delete', key)
  },
  envVars: {
    catalog: () => ipcRenderer.invoke('env-vars:catalog'),
    status: () => ipcRenderer.invoke('env-vars:status'),
    set: (key: string, value: string): Promise<void> => ipcRenderer.invoke('env-vars:set', key, value),
    delete: (key: string): Promise<void> => ipcRenderer.invoke('env-vars:delete', key),
    restartBackend: (): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke('env-vars:restart-backend')
  },
  http: {
    request: (payload: { path: string; method?: string; body?: unknown }) => ipcRenderer.invoke('http:request', payload),
    startStream: (payload: { path: string; method?: string; body?: unknown }) => ipcRenderer.invoke('http:stream:start', payload),
    cancelStream: (streamId: string) => ipcRenderer.invoke('http:stream:cancel', streamId),
    onStreamEvent: (streamId: string, listener: (event: { name: string; data: Record<string, unknown> }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: { streamId: string; name: string; data: Record<string, unknown> }) => {
        if (payload.streamId !== streamId) return
        listener({ name: payload.name, data: payload.data })
      }
      ipcRenderer.on('http:stream:event', handler)
      return () => ipcRenderer.removeListener('http:stream:event', handler)
    }
  },
  terminalRelay: {
    connect: (sessionId: string): Promise<{ ok: boolean; connected: boolean }> => ipcRenderer.invoke('terminal-relay:connect', sessionId),
    disconnect: (sessionId: string): Promise<void> => ipcRenderer.invoke('terminal-relay:disconnect', sessionId),
    status: (sessionId: string): Promise<{ connected: boolean }> => ipcRenderer.invoke('terminal-relay:status', sessionId),
    onEvent: (sessionId: string, listener: (event: TerminalRelayEvent) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: TerminalRelayEvent) => {
        if (payload.sessionId !== sessionId) return
        listener(payload)
      }
      ipcRenderer.on('terminal-relay:event', handler)
      return () => ipcRenderer.removeListener('terminal-relay:event', handler)
    }
  },
  browser: {
    show: (contextId: string, bounds?: BrowserPanelBounds): Promise<BrowserPanelState> => ipcRenderer.invoke('browser-panel:show', contextId, bounds),
    hide: (contextId: string): Promise<BrowserPanelState> => ipcRenderer.invoke('browser-panel:hide', contextId),
    openUrl: (url: string, sessionId?: string): Promise<BrowserOpenResult> => ipcRenderer.invoke('browser-panel:open-url', url, sessionId),
    navigate: (contextId: string, url: string): Promise<BrowserPanelState> => ipcRenderer.invoke('browser-panel:navigate', contextId, url),
    back: (contextId: string): Promise<BrowserPanelState> => ipcRenderer.invoke('browser-panel:back', contextId),
    forward: (contextId: string): Promise<BrowserPanelState> => ipcRenderer.invoke('browser-panel:forward', contextId),
    reload: (contextId: string): Promise<BrowserPanelState> => ipcRenderer.invoke('browser-panel:reload', contextId),
    setBounds: (contextId: string, bounds: BrowserPanelBounds): Promise<BrowserPanelState> => ipcRenderer.invoke('browser-panel:bounds', contextId, bounds),
    getState: (contextId: string): Promise<BrowserPanelState> => ipcRenderer.invoke('browser-panel:state', contextId),
    newTab: (contextId: string, url?: string): Promise<BrowserPanelState> => ipcRenderer.invoke('browser-panel:new-tab', contextId, url),
    switchTab: (contextId: string, tabId: string): Promise<BrowserPanelState> => ipcRenderer.invoke('browser-panel:switch-tab', contextId, tabId),
    onStateChange: (contextId: string, listener: (state: BrowserPanelState) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: { contextId: string; state: BrowserPanelState }) => {
        if (payload.contextId !== contextId) return
        listener(payload.state)
      }
      ipcRenderer.on('browser-panel:state', handler)
      return () => ipcRenderer.removeListener('browser-panel:state', handler)
    }
  },
  openExternal: (url: string) => ipcRenderer.invoke('system:open-external', url)
}

type TerminalRelayEvent = {
  sessionId: string
  type: string
  commandId?: string
  command?: string
  cwd?: string
  stream?: 'stdout' | 'stderr'
  data?: string
  message?: string
  exitCode?: number
  durationMs?: number
}

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

type BrowserOpenResult = {
  provider: string
  browser_url: string
  target_id: string
  tab_id: string
  url: string
}

function appVersion(): string {
  return process.env.npm_package_version ?? '0.1.0'
}

contextBridge.exposeInMainWorld('seshatDesktop', desktop)
contextBridge.exposeInMainWorld('nexus', nexus)

export type NexusBridge = typeof nexus
