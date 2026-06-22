interface Window {
  nexus: {
    getVersion: () => Promise<string>
    openPath: (p: string) => Promise<void>
    showFile: (p: string) => Promise<void>
    openExternal: (url: string) => Promise<void>
    selectFile: (opts?: Electron.OpenDialogOptions) => Promise<Electron.OpenDialogReturnValue>
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
      upload: (payload: {
        path: string
        fields?: Array<{ name: string; value: string }>
        files?: Array<{ name: string; filename: string; mimeType?: string; data: ArrayBuffer }>
      }) => Promise<{ ok: boolean; status: number; data?: unknown; text?: string }>
      startStream: (payload: { path: string; method?: string; body?: unknown }) => Promise<{ streamId: string }>
      cancelStream: (streamId: string) => Promise<void>
      onStreamEvent: (streamId: string, listener: (event: { name: string; data: Record<string, unknown> }) => void) => () => void
    }
  }
}
