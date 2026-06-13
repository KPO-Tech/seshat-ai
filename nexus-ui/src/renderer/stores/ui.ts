import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { RAGSearchResult } from '@/api/types'

type Theme = 'light' | 'dark'
export type RightPanelKind = 'pdf' | 'markdown' | 'subagents' | 'subagent' | 'browser' | 'custom' | 'agent' | 'knowledge' | 'plan'
export type UIPermissionMode = 'onRequest' | 'auto' | 'bypass'

export type RightPanelState = {
  open: boolean
  kind: RightPanelKind | null
  title: string
  width: number
  sourceLabel?: string
  markdown?: string
  documentPath?: string
  browserUrl?: string
  agentNames?: string[]
  knowledgeResults?: RAGSearchResult[]
  note?: string
  sessionId?: string
  subagentToolUseId?: string
  planId?: string
}

type UIState = {
  theme: Theme
  sidebarCollapsed: boolean
  rightPanel: RightPanelState
  permissionMode: UIPermissionMode
  toolExpansion: Record<string, boolean>
  thinkingExpansion: Record<string, boolean>
  toggleSidebar: () => void
  setSidebarCollapsed: (v: boolean) => void
  openRightPanel: (panel: Partial<RightPanelState> & { kind: RightPanelKind; title: string }) => void
  closeRightPanel: () => void
  setRightPanelWidth: (width: number) => void
  setTheme: (t: Theme) => void
  toggleTheme: () => void
  applyTheme: () => void
  togglePermissionMode: () => void
  setPermissionMode: (mode: UIPermissionMode) => void
  setToolExpansion: (toolUseId: string, expanded: boolean) => void
  setThinkingExpansion: (thinkingId: string, expanded: boolean) => void
}

const DEFAULT_RIGHT_PANEL: RightPanelState = {
  open: false,
  kind: null,
  title: '',
  width: 420,
}

export const useUIStore = create<UIState>()(
  persist(
    (set, get) => ({
      theme: 'dark',
      sidebarCollapsed: false,
      rightPanel: DEFAULT_RIGHT_PANEL,
      permissionMode: 'onRequest',
      toolExpansion: {},
      thinkingExpansion: {},

      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
      openRightPanel: (panel) =>
        set({
          rightPanel: {
            ...DEFAULT_RIGHT_PANEL,
            ...panel,
            open: true,
          },
        }),
      closeRightPanel: () => set({ rightPanel: DEFAULT_RIGHT_PANEL }),
      setRightPanelWidth: (width) =>
        set((s) => ({
          rightPanel: {
            ...s.rightPanel,
            width: Math.max(320, Math.min(width, 720)),
          },
        })),

      setTheme: (t) => {
        set({ theme: t })
        document.documentElement.setAttribute('data-theme', t)
        document.documentElement.setAttribute('data-color-scheme', 'default')
      },

      toggleTheme: () => get().setTheme(get().theme === 'dark' ? 'light' : 'dark'),

      togglePermissionMode: () =>
        set((s) => ({
          permissionMode:
            s.permissionMode === 'onRequest'
              ? 'auto'
              : s.permissionMode === 'auto'
                ? 'bypass'
                : 'onRequest',
        })),

      setPermissionMode: (mode) => set({ permissionMode: mode }),

      setToolExpansion: (toolUseId, expanded) =>
        set((s) => ({
          toolExpansion: {
            ...s.toolExpansion,
            [toolUseId]: expanded,
          },
        })),

      setThinkingExpansion: (thinkingId, expanded) =>
        set((s) => ({
          thinkingExpansion: {
            ...s.thinkingExpansion,
            [thinkingId]: expanded,
          },
        })),

      applyTheme: () => {
        const { theme } = get()
        document.documentElement.setAttribute('data-theme', theme)
        document.documentElement.setAttribute('data-color-scheme', 'default')
      },
    }),
    {
      name: 'nexus-ui-prefs',
      partialize: (s) => ({
        theme: s.theme,
        sidebarCollapsed: s.sidebarCollapsed,
        permissionMode: s.permissionMode,
        toolExpansion: s.toolExpansion,
        thinkingExpansion: s.thinkingExpansion,
      }),
    }
  )
)
