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
      terminalRelay?: {
        connect: (sessionId: string) => Promise<{ ok: boolean; connected: boolean }>
        disconnect: (sessionId: string) => Promise<void>
        status: (sessionId: string) => Promise<{ connected: boolean }>
        onEvent: (sessionId: string, listener: (event: TerminalRelayEvent) => void) => () => void
      }
      browser?: {
        show: (contextId: string, bounds?: BrowserPanelBounds) => Promise<BrowserPanelState>
        hide: (contextId: string) => Promise<BrowserPanelState>
        openUrl: (url: string, sessionId?: string) => Promise<BrowserOpenResult>
        adoptPage: (contextId: string, page: BrowserAgentPage) => Promise<BrowserPanelState>
        navigate: (contextId: string, url: string) => Promise<BrowserPanelState>
        back: (contextId: string) => Promise<BrowserPanelState>
        forward: (contextId: string) => Promise<BrowserPanelState>
        reload: (contextId: string) => Promise<BrowserPanelState>
        setBounds: (contextId: string, bounds: BrowserPanelBounds) => Promise<BrowserPanelState>
        getState: (contextId: string) => Promise<BrowserPanelState>
        newTab: (contextId: string, url?: string) => Promise<BrowserPanelState>
        switchTab: (contextId: string, tabId: string) => Promise<BrowserPanelState>
        closeTab: (contextId: string, tabId: string) => Promise<BrowserPanelState>
        destroyContext: (contextId: string) => Promise<void>
        onStateChange: (contextId: string, listener: (state: BrowserPanelState) => void) => () => void
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

type TerminalRelayEvent = {
  sessionId: string
  type: 'connected' | 'disconnected' | 'command_start' | 'data' | 'command_end' | 'error' | string
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

type BrowserAgentPage = {
  pageId?: string
  targetId?: string
  url?: string
  title?: string
}
