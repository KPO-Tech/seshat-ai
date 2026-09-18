import { create } from 'zustand'

// Mirrors seshat-ui's right-panel system (stores/ui.ts) at the granularity
// it's actually reachable at today (RIGHT_PANEL_STACK_LIMIT=1,
// RIGHT_PANEL_WIDE_COLUMN_LIMIT=1 there) - single panel, opening a new one
// replaces whatever was open, resize width only, no persistence.
// Terminal was dropped from the panel - the live relay behind it wasn't
// usable yet. Browser-only for now; re-add the union member if/when it is.
export type RightPanelKind = 'browser'

export type RightPanel = {
  kind: RightPanelKind
  sessionId: string
  width: number
}

export const DEFAULT_WIDTH = 420
// Raised from 320 - that let the dynamic max-width clamp (and manual
// dragging) squeeze the panel down to a width too narrow to actually read a
// page/document in, which happened often enough to be annoying. Shared by
// every panel kind (browser today, document readers later).
export const MIN_WIDTH = 420
// The chat column (message list + ChatInput) must never be squeezed below
// this - ChatInput's toolbar has no room to reflow, so anything less makes
// it overlap itself. RightPanelHost clamps the panel's max width to
// (available width - CHAT_MIN_WIDTH) so the two can never fight over space.
export const CHAT_MIN_WIDTH = 480
// Absolute last-resort ceiling - the real max in practice is dynamic
// (available app width minus the chat column's own minimum), computed by
// the caller and passed as `maxWidth`. This just guards against a runaway
// value if a caller ever forgets to pass one.
const ABSOLUTE_MAX_WIDTH = 1200

function clampWidth(width: number, maxWidth = ABSOLUTE_MAX_WIDTH) {
  return Math.min(Math.max(maxWidth, MIN_WIDTH), Math.max(MIN_WIDTH, width))
}

type RightPanelState = {
  panel: RightPanel | null
  openPanel: (kind: RightPanelKind, sessionId: string) => void
  closePanel: () => void
  setWidth: (width: number, maxWidth?: number) => void
}

export const useRightPanelStore = create<RightPanelState>()((set, get) => ({
  panel: null,
  openPanel: (kind, sessionId) => {
    const current = get().panel
    if (current && current.kind === kind && current.sessionId === sessionId) return
    set({ panel: { kind, sessionId, width: current?.width ?? DEFAULT_WIDTH } })
  },
  closePanel: () => set({ panel: null }),
  setWidth: (width, maxWidth) => set((state) => state.panel ? { panel: { ...state.panel, width: clampWidth(width, maxWidth) } } : state)
}))
