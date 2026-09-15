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
      http: {
        request: (payload: { path: string; method?: string; body?: unknown }) => Promise<{
          ok: boolean
          status: number
          data?: unknown
          text?: string
        }>
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
