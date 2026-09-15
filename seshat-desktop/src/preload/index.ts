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
  http: {
    request: (payload: { path: string; method?: string; body?: unknown }) => ipcRenderer.invoke('http:request', payload)
  },
  openExternal: (url: string) => ipcRenderer.invoke('system:open-external', url)
}

function appVersion(): string {
  return process.env.npm_package_version ?? '0.1.0'
}

contextBridge.exposeInMainWorld('seshatDesktop', desktop)
contextBridge.exposeInMainWorld('nexus', nexus)

export type NexusBridge = typeof nexus
