import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { RAGSearchResult } from '@/api/types'
import { useSessionStore } from '@/stores/session'

type Theme = 'light' | 'dark'
export type RightPanelKind = 'markdown' | 'subagent' | 'browser' | 'agent' | 'knowledge' | 'plan'
export type UIPermissionMode = 'onRequest' | 'auto' | 'bypass'

export type RightPanelFields = {
  kind: RightPanelKind
  title: string
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

// `width` is not a per-panel property — it belongs to the column a panel
// lives in. It's kept here only as an optional hint, used solely when this
// panel ends up creating a brand-new column.
export type RightPanelPayload = Partial<RightPanelFields> & { kind: RightPanelKind; title: string; width?: number }

// A single open panel. `id` is a stable identity key (not random) so
// re-opening "the same" panel (e.g. Agent Monitor for a session that's
// already open) updates it in place instead of pushing a duplicate.
export type RightPanelInstance = RightPanelFields & { id: string; openedAt: number }

export function buildRightPanelId(panel: { kind: RightPanelKind; sessionId?: string; planId?: string; subagentToolUseId?: string }): string {
  return `${panel.kind}:${panel.sessionId ?? ''}:${panel.planId ?? panel.subagentToolUseId ?? ''}`
}

// A column of 1-2 vertically-stacked panels. Never stored empty — a column
// is dropped from the array the instant its last panel closes, which is
// what makes an emptied column disappear rather than leave a gap.
export type RightPanelColumn = {
  id: string
  panels: RightPanelInstance[]
  width: number
  split: number
}

export function flattenRightPanels(columns: RightPanelColumn[]): RightPanelInstance[] {
  return columns.flatMap((c) => c.panels)
}

// Panels that must never be silently evicted/merged away: a streaming
// Agent Monitor (losing visibility into an active turn would be worse than
// losing a read-only panel).
function isRightPanelPinned(p: RightPanelInstance): boolean {
  return p.kind === 'agent' && !!p.sessionId && useSessionStore.getState().isSessionStreaming(p.sessionId)
}

const RIGHT_PANEL_STACK_LIMIT = 2
const RIGHT_PANEL_COLUMN_LIMIT = 2
// A lone open column can go up to 720px; once a 2nd column opens, both
// clamp into this tighter range so the chat pane never gets crushed.
const RIGHT_PANEL_WIDTH_SOLO = { min: 320, max: 720 }
const RIGHT_PANEL_WIDTH_SHARED = { min: 280, max: 480 }
// A newly-opened column's default width is this fraction of the window,
// not a flat pixel value — so a panel opened on a small laptop window
// doesn't start out crushing the chat pane, and one opened on an ultrawide
// doesn't start out looking lost. Existing columns are rescaled by the same
// idea (proportionally, not to this exact ratio) whenever the window
// itself resizes, see setWindowWidth.
const RIGHT_PANEL_WIDTH_RATIO = 0.28
// Below this window width, only 1 column (max 2 panels) is allowed — the
// 2-column grid is reserved for genuinely large/desktop monitors so the
// chat pane is never squeezed on a smaller laptop screen.
const RIGHT_PANEL_COLUMN_BREAKPOINT = 1600

type UIState = {
  theme: Theme
  sidebarCollapsed: boolean
  rightColumns: RightPanelColumn[]
  maximizedPanelId: string | null
  windowWidth: number
  permissionMode: UIPermissionMode
  toolExpansion: Record<string, boolean>
  thinkingExpansion: Record<string, boolean>
  toolGroupExpansion: Record<string, boolean>
  // Signatures (see lib/permissionSignature.ts) the user has marked "always
  // allow" from a PermissionCard — future matching tool.permission_required
  // events are auto-approved without ever showing the card again. Persisted
  // (not session-scoped) since "always" is what the user asked for.
  rememberedApprovals: Record<string, boolean>
  toggleSidebar: () => void
  setSidebarCollapsed: (v: boolean) => void
  setWindowWidth: (width: number) => void
  openRightPanel: (panel: RightPanelPayload) => void
  closeRightPanel: (id: string) => void
  closeAllRightPanels: () => void
  closeRightPanelsForSession: (sessionId: string) => void
  setRightPanelWidth: (columnId: string, width: number) => void
  setRightPanelSplit: (columnId: string, ratio: number) => void
  toggleMaximizePanel: (id: string) => void
  setTheme: (t: Theme) => void
  toggleTheme: () => void
  applyTheme: () => void
  togglePermissionMode: () => void
  setPermissionMode: (mode: UIPermissionMode) => void
  setToolExpansion: (toolUseId: string, expanded: boolean) => void
  setThinkingExpansion: (thinkingId: string, expanded: boolean) => void
  setToolGroupExpansion: (groupId: string, expanded: boolean) => void
  rememberApproval: (signature: string) => void
  forgetApproval: (signature: string) => void
}

export const useUIStore = create<UIState>()(
  persist(
    (set, get) => ({
      theme: 'dark',
      sidebarCollapsed: false,
      rightColumns: [],
      maximizedPanelId: null,
      windowWidth: typeof window !== 'undefined' ? window.innerWidth : RIGHT_PANEL_COLUMN_BREAKPOINT,
      // "onRequest" ("Ask First") is retired from the UI toggle — default to
      // "auto" ("Smart"). See ChatInput.tsx's PERMISSION_CYCLE comment.
      permissionMode: 'auto',
      toolExpansion: {},
      thinkingExpansion: {},
      toolGroupExpansion: {},
      rememberedApprovals: {},

      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),

      setWindowWidth: (width) =>
        set((s) => {
          // Keeps each open column at roughly the same proportion of the
          // window it already had, instead of a fixed pixel width that
          // would start crushing the chat pane as the window shrinks (or
          // look lost as it grows) — re-clamped to whichever range applies
          // for the current column count either way.
          const ratio = width / s.windowWidth
          const rescale = (columns: RightPanelColumn[]) => {
            if (!Number.isFinite(ratio) || ratio === 1) return columns
            const range = columns.length >= RIGHT_PANEL_COLUMN_LIMIT ? RIGHT_PANEL_WIDTH_SHARED : RIGHT_PANEL_WIDTH_SOLO
            return columns.map((c) => ({
              ...c,
              width: Math.round(Math.max(range.min, Math.min(c.width * ratio, range.max))),
            }))
          }

          if (width >= RIGHT_PANEL_COLUMN_BREAKPOINT || s.rightColumns.length <= 1) {
            return { windowWidth: width, rightColumns: rescale(s.rightColumns) }
          }
          // Window dropped below the breakpoint with 2 columns open — merge
          // everything into a single column, evicting down to 2 panels with
          // the same pin-aware rule used everywhere else, so the user always
          // lands in a valid single-column state automatically.
          const pool = flattenRightPanels(s.rightColumns).sort((a, b) => a.openedAt - b.openedAt)
          const isPinned = isRightPanelPinned
          while (pool.length > RIGHT_PANEL_STACK_LIMIT) {
            const victimIndex = pool.findIndex((p) => !isPinned(p))
            pool.splice(victimIndex === -1 ? 0 : victimIndex, 1)
          }
          const survivorIds = new Set(pool.map((p) => p.id))
          const mergedColumn: RightPanelColumn = {
            id: s.rightColumns[0].id,
            panels: pool,
            width: Math.max(RIGHT_PANEL_WIDTH_SOLO.min, Math.min(s.rightColumns[0].width, RIGHT_PANEL_WIDTH_SOLO.max)),
            split: s.rightColumns[0].split,
          }
          return {
            windowWidth: width,
            rightColumns: rescale([mergedColumn]),
            maximizedPanelId: s.maximizedPanelId && survivorIds.has(s.maximizedPanelId) ? s.maximizedPanelId : null,
          }
        }),

      openRightPanel: (panel) =>
        set((s) => {
          const id = buildRightPanelId(panel)

          // Auto-opened Agent Monitor tracks "the conversation you're
          // currently viewing" — without this, navigating between
          // conversations silently accumulates monitor panels (each
          // conversation's mount effect opens its own, nothing ever closes
          // the previous one) that all look identical since none show which
          // session they belong to. A monitor for a session that's actively
          // streaming stays put (isRightPanelPinned) so switching away from
          // a running turn doesn't lose visibility into it.
          let rightColumns = s.rightColumns
          if (panel.kind === 'agent' && panel.sessionId) {
            rightColumns = rightColumns
              .map((c) => ({
                ...c,
                panels: c.panels.filter(
                  (p) => !(p.kind === 'agent' && p.sessionId !== panel.sessionId && !isRightPanelPinned(p))
                ),
              }))
              .filter((c) => c.panels.length > 0)
          }

          // Dedup — identity match updates in place wherever it currently
          // lives, without moving it or touching its column's width/split.
          for (let ci = 0; ci < rightColumns.length; ci++) {
            const pi = rightColumns[ci].panels.findIndex((p) => p.id === id)
            if (pi === -1) continue
            const nextColumns = [...rightColumns]
            const nextPanels = [...nextColumns[ci].panels]
            nextPanels[pi] = { ...nextPanels[pi], ...panel, id }
            nextColumns[ci] = { ...nextColumns[ci], panels: nextPanels }
            return { rightColumns: nextColumns }
          }

          const instance: RightPanelInstance = { ...panel, id, openedAt: Date.now() }

          // First column, left-to-right, with room.
          const roomIndex = rightColumns.findIndex((c) => c.panels.length < RIGHT_PANEL_STACK_LIMIT)
          if (roomIndex !== -1) {
            const nextColumns = [...rightColumns]
            nextColumns[roomIndex] = { ...nextColumns[roomIndex], panels: [...nextColumns[roomIndex].panels, instance] }
            return { rightColumns: nextColumns }
          }

          // No column has room — open a new one, if under the column cap.
          // The cap itself is only 2 on wide-enough windows; smaller windows
          // stay single-column so the chat pane is never squeezed.
          const columnLimit = s.windowWidth >= RIGHT_PANEL_COLUMN_BREAKPOINT ? RIGHT_PANEL_COLUMN_LIMIT : 1
          if (rightColumns.length < columnLimit) {
            const defaultWidth = Math.round(
              Math.max(RIGHT_PANEL_WIDTH_SOLO.min, Math.min(s.windowWidth * RIGHT_PANEL_WIDTH_RATIO, RIGHT_PANEL_WIDTH_SOLO.max))
            )
            const column: RightPanelColumn = {
              id: crypto.randomUUID(),
              panels: [instance],
              width: panel.width ?? defaultWidth,
              split: 0.5,
            }
            const opensSecondColumn = rightColumns.length + 1 >= RIGHT_PANEL_COLUMN_LIMIT
            // A 2nd column just opened — re-clamp every column into the
            // tighter shared range so two columns can never crush the chat.
            const nextColumns = opensSecondColumn
              ? [...rightColumns, column].map((c) => ({
                  ...c,
                  width: Math.max(RIGHT_PANEL_WIDTH_SHARED.min, Math.min(c.width, RIGHT_PANEL_WIDTH_SHARED.max)),
                }))
              : [...rightColumns, column]
            return { rightColumns: nextColumns }
          }

          // All slots (2 columns x 2 panels) are full — evict from the
          // whole pool, not a specific column: every column is equally full
          // at this point, so any freed slot anywhere is valid room.
          // Evict the oldest panel that isn't a pinned Agent Monitor (its
          // session actively streaming a turn); if all of them are pinned,
          // the oldest yields anyway — same tie-break spirit as the
          // 2-panel case, generalized to the full pool.
          const isPinned = isRightPanelPinned
          const pool: { ci: number; pi: number; panel: RightPanelInstance }[] = []
          rightColumns.forEach((c, ci) => c.panels.forEach((p, pi) => pool.push({ ci, pi, panel: p })))
          pool.sort((a, b) => a.panel.openedAt - b.panel.openedAt)
          const victim = pool.find((loc) => !isPinned(loc.panel)) ?? pool[0]

          const nextColumns = rightColumns.map((c, ci) => {
            if (ci !== victim.ci) return c
            const nextPanels = [...c.panels]
            nextPanels[victim.pi] = instance
            return { ...c, panels: nextPanels }
          })
          return { rightColumns: nextColumns }
        }),

      closeRightPanel: (id) =>
        set((s) => {
          const rightColumns = s.rightColumns
            .map((c) => ({ ...c, panels: c.panels.filter((p) => p.id !== id) }))
            .filter((c) => c.panels.length > 0)
          return { rightColumns, maximizedPanelId: s.maximizedPanelId === id ? null : s.maximizedPanelId }
        }),

      closeAllRightPanels: () => set({ rightColumns: [], maximizedPanelId: null }),

      closeRightPanelsForSession: (sessionId) =>
        set((s) => {
          const removedIds = new Set(flattenRightPanels(s.rightColumns).filter((p) => p.sessionId === sessionId).map((p) => p.id))
          const rightColumns = s.rightColumns
            .map((c) => ({ ...c, panels: c.panels.filter((p) => p.sessionId !== sessionId) }))
            .filter((c) => c.panels.length > 0)
          return {
            rightColumns,
            maximizedPanelId: s.maximizedPanelId && removedIds.has(s.maximizedPanelId) ? null : s.maximizedPanelId,
          }
        }),

      setRightPanelWidth: (columnId, width) =>
        set((s) => {
          const range = s.rightColumns.length >= RIGHT_PANEL_COLUMN_LIMIT ? RIGHT_PANEL_WIDTH_SHARED : RIGHT_PANEL_WIDTH_SOLO
          return {
            rightColumns: s.rightColumns.map((c) =>
              c.id === columnId ? { ...c, width: Math.max(range.min, Math.min(width, range.max)) } : c
            ),
          }
        }),

      setRightPanelSplit: (columnId, ratio) =>
        set((s) => ({
          rightColumns: s.rightColumns.map((c) =>
            c.id === columnId ? { ...c, split: Math.max(0.2, Math.min(ratio, 0.8)) } : c
          ),
        })),

      toggleMaximizePanel: (id) =>
        set((s) => ({ maximizedPanelId: s.maximizedPanelId === id ? null : id })),

      setTheme: (t) => {
        set({ theme: t })
        document.documentElement.setAttribute('data-theme', t)
        document.documentElement.setAttribute('data-color-scheme', 'default')
      },

      toggleTheme: () => get().setTheme(get().theme === 'dark' ? 'light' : 'dark'),

      // Two-mode cycle only — "onRequest" ("Ask First") is retired, see
      // ChatInput.tsx's PERMISSION_CYCLE comment.
      togglePermissionMode: () =>
        set((s) => ({
          permissionMode: s.permissionMode === 'bypass' ? 'auto' : 'bypass',
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

      setToolGroupExpansion: (groupId, expanded) =>
        set((s) => ({
          toolGroupExpansion: {
            ...s.toolGroupExpansion,
            [groupId]: expanded,
          },
        })),

      rememberApproval: (signature) =>
        set((s) => ({
          rememberedApprovals: { ...s.rememberedApprovals, [signature]: true },
        })),

      forgetApproval: (signature) =>
        set((s) => {
          const next = { ...s.rememberedApprovals }
          delete next[signature]
          return { rememberedApprovals: next }
        }),

      applyTheme: () => {
        const { theme } = get()
        document.documentElement.setAttribute('data-theme', theme)
        document.documentElement.setAttribute('data-color-scheme', 'default')
      },
    }),
    {
      name: 'seshat-ui-prefs',
      partialize: (s) => ({
        theme: s.theme,
        sidebarCollapsed: s.sidebarCollapsed,
        permissionMode: s.permissionMode,
        toolExpansion: s.toolExpansion,
        thinkingExpansion: s.thinkingExpansion,
        toolGroupExpansion: s.toolGroupExpansion,
        rememberedApprovals: s.rememberedApprovals,
      }),
    }
  )
)
