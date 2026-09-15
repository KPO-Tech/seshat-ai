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
  openExternal: (url: string) => ipcRenderer.invoke('system:open-external', url)
}

function appVersion(): string {
  return process.env.npm_package_version ?? '0.1.0'
}

contextBridge.exposeInMainWorld('seshatDesktop', desktop)
contextBridge.exposeInMainWorld('nexus', nexus)

export type NexusBridge = typeof nexus
