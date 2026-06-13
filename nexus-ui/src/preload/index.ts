import { contextBridge, ipcRenderer } from 'electron'

const nexusBridge = {
  getVersion: () => ipcRenderer.invoke('app:version'),
  openPath: (p: string) => ipcRenderer.invoke('system:open-path', p),
  showFile: (p: string) => ipcRenderer.invoke('system:show-file', p),
  openExternal: (url: string) => ipcRenderer.invoke('system:open-external', url),
  selectFile: (opts?: Electron.OpenDialogOptions) => ipcRenderer.invoke('system:select-file', opts),
  dialog: {
    openDirectory: (): Promise<Electron.OpenDialogReturnValue> => ipcRenderer.invoke('dialog:openDirectory'),
  },
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
  },
  secureStore: {
    set: (key: string, value: string): Promise<void> => ipcRenderer.invoke('secure-store:set', key, value),
    get: (key: string): Promise<string | null> => ipcRenderer.invoke('secure-store:get', key),
    delete: (key: string): Promise<void> => ipcRenderer.invoke('secure-store:delete', key),
  },
  auth: {
    login: (credentials: { email: string; password: string }) => ipcRenderer.invoke('auth:login', credentials),
    register: (payload: { name: string; email: string; password: string }) => ipcRenderer.invoke('auth:register', payload),
    logout: () => ipcRenderer.invoke('auth:logout'),
    restoreSession: () => ipcRenderer.invoke('auth:restore-session'),
    clearSession: () => ipcRenderer.invoke('auth:clear-session'),
    updateUser: (user: { id: string; email: string; display_name: string; status: string }) => ipcRenderer.invoke('auth:update-user', user),
  },
  http: {
    request: (payload: { path: string; method?: string; body?: unknown }) => ipcRenderer.invoke('http:request', payload),
    upload: (payload: {
      path: string
      fields?: Array<{ name: string; value: string }>
      files?: Array<{ name: string; filename: string; mimeType?: string; data: ArrayBuffer }>
    }) => ipcRenderer.invoke('http:upload', payload),
    startStream: (payload: { path: string; method?: string; body?: unknown }) => ipcRenderer.invoke('http:stream:start', payload),
    cancelStream: (streamId: string) => ipcRenderer.invoke('http:stream:cancel', streamId),
    onStreamEvent: (streamId: string, listener: (event: { name: string; data: Record<string, unknown> }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: { streamId: string; name: string; data: Record<string, unknown> }) => {
        if (payload.streamId !== streamId) return
        listener({ name: payload.name, data: payload.data })
      }
      ipcRenderer.on('http:stream:event', handler)
      return () => ipcRenderer.removeListener('http:stream:event', handler)
    },
  },
}

contextBridge.exposeInMainWorld('nexus', nexusBridge)

export type NexusBridge = typeof nexusBridge
