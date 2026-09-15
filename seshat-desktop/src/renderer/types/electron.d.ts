export {}

declare global {
  interface Window {
    seshatDesktop?: {
      version: string
    }
    nexus?: {
      auth: {
        login: (credentials: { email: string; password: string }) => Promise<{ user: AuthUser; roles: string[]; isAuthenticated: boolean }>
        register: (payload: { name: string; email: string; password: string }) => Promise<{ user: AuthUser; roles: string[]; isAuthenticated: boolean }>
        logout: () => Promise<void>
        restoreSession: () => Promise<{ user: AuthUser; roles: string[]; isAuthenticated: boolean } | null>
        clearSession: () => Promise<void>
      }
      window: {
        minimize: () => Promise<void>
        maximize: () => Promise<void>
        close: () => Promise<void>
      }
      secureStore: {
        set: (key: string, value: string) => Promise<void>
        get: (key: string) => Promise<string | null>
        delete: (key: string) => Promise<void>
      }
      envVars: {
        catalog: () => Promise<Array<{
          key: string
          label: string
          description: string
          group: string
          groupLabel: string
          helpUrl?: string
          hidden?: boolean
        }>>
        status: () => Promise<Record<string, boolean>>
        set: (key: string, value: string) => Promise<void>
        delete: (key: string) => Promise<void>
        restartBackend: () => Promise<{ ok: boolean; error?: string }>
      }
      http: {
        request: (payload: { path: string; method?: string; body?: unknown }) => Promise<{
          ok: boolean
          status: number
          data?: unknown
          text?: string
        }>
        startStream: (payload: { path: string; method?: string; body?: unknown }) => Promise<{
          streamId?: string
          error?: string
          retryable?: boolean
          unauthorized?: boolean
        }>
        cancelStream: (streamId: string) => Promise<void>
        onStreamEvent: (
          streamId: string,
          listener: (event: { name: string; data: Record<string, unknown> }) => void
        ) => () => void
      }
      openExternal: (url: string) => Promise<void>
    }
  }
}

type AuthUser = {
  id: string
  email: string
  display_name: string
  status: string
}
