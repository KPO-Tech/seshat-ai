interface Window {
  nexus: {
    getVersion: () => Promise<string>
    openPath: (p: string) => Promise<void>
    showFile: (p: string) => Promise<void>
    readFileDataURL: (p: string) => Promise<string>
    openExternal: (url: string) => Promise<void>
    selectFile: (opts?: Electron.OpenDialogOptions) => Promise<Electron.OpenDialogReturnValue>
    saveFile: (defaultName: string, content: string) => Promise<{ canceled: boolean; filePath?: string }>
    dialog: {
      openDirectory: () => Promise<Electron.OpenDialogReturnValue>
    }
    window: {
      minimize: () => Promise<void>
      maximize: () => Promise<void>
      close: () => Promise<void>
      isMaximized: () => Promise<boolean>
    }
    secureStore: {
      set: (key: string, value: string) => Promise<void>
      get: (key: string) => Promise<string | null>
      delete: (key: string) => Promise<void>
    }
    auth?: {
      login: (credentials: { email: string; password: string }) => Promise<{ user: { id: string; email: string; display_name: string; status: string }; roles: string[]; isAuthenticated: boolean }>
      register: (payload: { name: string; email: string; password: string }) => Promise<{ user: { id: string; email: string; display_name: string; status: string }; roles: string[]; isAuthenticated: boolean }>
      logout: () => Promise<void>
      restoreSession: () => Promise<{ user: { id: string; email: string; display_name: string; status: string }; roles: string[]; isAuthenticated: boolean } | null>
      clearSession: () => Promise<void>
      updateUser: (user: { id: string; email: string; display_name: string; status: string }) => Promise<{ user: { id: string; email: string; display_name: string; status: string }; roles: string[]; isAuthenticated: boolean } | null>
    }
    http?: {
      request: (payload: { path: string; method?: string; body?: unknown }) => Promise<{ ok: boolean; status: number; data?: unknown; text?: string }>
      fileContent: (path: string) => Promise<{ ok: boolean; status: number; dataUrl?: string; error?: string }>
      backendOrigin: () => Promise<string>
      upload: (payload: {
        path: string
        fields?: Array<{ name: string; value: string }>
        files?: Array<{ name: string; filename: string; mimeType?: string; data: ArrayBuffer }>
      }) => Promise<{ ok: boolean; status: number; data?: unknown; text?: string }>
      startStream: (payload: { path: string; method?: string; body?: unknown }) => Promise<{ streamId: string } | { error: string; retryable: boolean; unauthorized?: boolean }>
      cancelStream: (streamId: string) => Promise<void>
      onStreamEvent: (streamId: string, listener: (event: { name: string; data: Record<string, unknown> }) => void) => () => void
    }
    whisper?: {
      status: () => Promise<{ supported: boolean; running: boolean; port?: number; activeModelId: string; downloadedModelIds: string[] }>
      models: () => Promise<Array<{ id: string; filename: string; label: string; approxSizeBytes: number; description: string }>>
      downloadDefaults: () => Promise<{ supported: boolean; running: boolean; port?: number; activeModelId: string; downloadedModelIds: string[] }>
      downloadModel: (modelId: string) => Promise<{ supported: boolean; running: boolean; port?: number; activeModelId: string; downloadedModelIds: string[] }>
      activateModel: (modelId: string) => Promise<{ supported: boolean; running: boolean; port?: number; activeModelId: string; downloadedModelIds: string[] }>
      deleteModel: (modelId: string) => Promise<{ supported: boolean; running: boolean; port?: number; activeModelId: string; downloadedModelIds: string[] }>
      enable: () => Promise<{ supported: boolean; running: boolean; port?: number; activeModelId: string; downloadedModelIds: string[] }>
      disable: () => Promise<{ supported: boolean; running: boolean; port?: number; activeModelId: string; downloadedModelIds: string[] }>
      onProgress: (listener: (progress: { phase: 'binary' | 'model'; modelId?: string; receivedBytes: number; totalBytes: number }) => void) => () => void
    }
    updates?: {
      checkNow: () => Promise<{ ok: boolean; error?: string }>
      quitAndInstall: () => Promise<void>
      onAvailable: (listener: (payload: { version: string }) => void) => () => void
      onNotAvailable: (listener: () => void) => () => void
      onDownloaded: (listener: (payload: { version: string }) => void) => () => void
      onError: (listener: (payload: { message: string }) => void) => () => void
    }
  }
}
