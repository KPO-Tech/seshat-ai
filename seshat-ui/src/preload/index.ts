import { contextBridge, ipcRenderer } from 'electron'

type WhisperStatus = {
  supported: boolean
  running: boolean
  port?: number
  activeModelId: string
  downloadedModelIds: string[]
}

type WhisperModelInfo = {
  id: string
  filename: string
  label: string
  approxSizeBytes: number
  description: string
}

type WhisperProgress = {
  phase: 'binary' | 'model'
  modelId?: string
  receivedBytes: number
  totalBytes: number
}

const nexusBridge = {
  getVersion: () => ipcRenderer.invoke('app:version'),
  openPath: (p: string) => ipcRenderer.invoke('system:open-path', p),
  showFile: (p: string) => ipcRenderer.invoke('system:show-file', p),
  readFileDataURL: (p: string): Promise<string> => ipcRenderer.invoke('system:read-file-data-url', p),
  openExternal: (url: string) => ipcRenderer.invoke('system:open-external', url),
  selectFile: (opts?: Electron.OpenDialogOptions) => ipcRenderer.invoke('system:select-file', opts),
  saveFile: (defaultName: string, content: string): Promise<{ canceled: boolean; filePath?: string }> =>
    ipcRenderer.invoke('system:save-file', defaultName, content),
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
    fileContent: (path: string) => ipcRenderer.invoke('http:file-content', path),
    backendOrigin: () => ipcRenderer.invoke('http:backend-origin') as Promise<string>,
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
  whisper: {
    status: (): Promise<WhisperStatus> => ipcRenderer.invoke('whisper:status'),
    models: (): Promise<WhisperModelInfo[]> => ipcRenderer.invoke('whisper:models'),
    downloadDefaults: (): Promise<WhisperStatus> => ipcRenderer.invoke('whisper:download-defaults'),
    downloadModel: (modelId: string): Promise<WhisperStatus> => ipcRenderer.invoke('whisper:download-model', modelId),
    activateModel: (modelId: string): Promise<WhisperStatus> => ipcRenderer.invoke('whisper:activate-model', modelId),
    deleteModel: (modelId: string): Promise<WhisperStatus> => ipcRenderer.invoke('whisper:delete-model', modelId),
    enable: (): Promise<WhisperStatus> => ipcRenderer.invoke('whisper:enable'),
    disable: (): Promise<WhisperStatus> => ipcRenderer.invoke('whisper:disable'),
    onProgress: (listener: (progress: WhisperProgress) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, progress: WhisperProgress) => listener(progress)
      ipcRenderer.on('whisper:progress', handler)
      return () => ipcRenderer.removeListener('whisper:progress', handler)
    },
  },
  updates: {
    checkNow: (): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke('updates:check-now'),
    quitAndInstall: () => ipcRenderer.invoke('updates:quit-and-install'),
    onAvailable: (listener: (payload: { version: string }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: { version: string }) => listener(payload)
      ipcRenderer.on('updates:available', handler)
      return () => ipcRenderer.removeListener('updates:available', handler)
    },
    onNotAvailable: (listener: () => void) => {
      const handler = () => listener()
      ipcRenderer.on('updates:not-available', handler)
      return () => ipcRenderer.removeListener('updates:not-available', handler)
    },
    onDownloaded: (listener: (payload: { version: string }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: { version: string }) => listener(payload)
      ipcRenderer.on('updates:downloaded', handler)
      return () => ipcRenderer.removeListener('updates:downloaded', handler)
    },
    onError: (listener: (payload: { message: string }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: { message: string }) => listener(payload)
      ipcRenderer.on('updates:error', handler)
      return () => ipcRenderer.removeListener('updates:error', handler)
    },
  },
}

contextBridge.exposeInMainWorld('nexus', nexusBridge)

export type NexusBridge = typeof nexusBridge
