import { create } from 'zustand'

// Must match the `w-[236px]` on AppShell's <aside> - kept here too since
// RightPanelHost needs it for the "is the window tight enough to matter"
// threshold check, without importing a component for one number.
export const SIDEBAR_WIDTH = 236

type SidebarState = {
  // The user's own preference - pushes layout when true, hidden when false.
  open: boolean
  // True only when `open` was flipped to false by autoCollapse() (not by
  // the user clicking the toggle) - this is what makes the toggle button
  // open an overlay instead of pushing layout, and what tells autoRestore()
  // it's safe to bring the sidebar back on its own.
  autoCollapsed: boolean
  // A temporary flyout shown over the chat while auto-collapsed, so the
  // user can glance at the sidebar without giving back the space a
  // browser/document panel needed.
  overlayOpen: boolean
  toggle: () => void
  closeOverlay: () => void
  autoCollapse: () => void
  autoRestore: () => void
}

export const useSidebarStore = create<SidebarState>()((set, get) => ({
  open: true,
  autoCollapsed: false,
  overlayOpen: false,
  toggle: () => {
    const { open, overlayOpen, autoCollapsed } = get()
    if (overlayOpen) {
      set({ overlayOpen: false })
      return
    }
    if (open) {
      set({ open: false, autoCollapsed: false })
      return
    }
    if (autoCollapsed) {
      set({ overlayOpen: true })
      return
    }
    set({ open: true })
  },
  closeOverlay: () => set({ overlayOpen: false }),
  autoCollapse: () => {
    if (get().open) set({ open: false, autoCollapsed: true })
  },
  autoRestore: () => {
    if (get().autoCollapsed) set({ open: true, autoCollapsed: false, overlayOpen: false })
  }
}))
