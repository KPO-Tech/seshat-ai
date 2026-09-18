import { beforeEach, describe, expect, it } from 'vitest'
import { useSidebarStore } from './sidebar'

describe('useSidebarStore', () => {
  beforeEach(() => {
    useSidebarStore.setState({ open: true, autoCollapsed: false, overlayOpen: false })
  })

  it('toggle closes an open sidebar as a manual close (not auto-collapsed)', () => {
    useSidebarStore.getState().toggle()
    expect(useSidebarStore.getState()).toMatchObject({ open: false, autoCollapsed: false })
  })

  it('toggle reopens a manually-closed sidebar normally', () => {
    useSidebarStore.getState().toggle()
    useSidebarStore.getState().toggle()
    expect(useSidebarStore.getState()).toMatchObject({ open: true, overlayOpen: false })
  })

  it('autoCollapse only takes effect while open, and flags it as automatic', () => {
    useSidebarStore.getState().autoCollapse()
    expect(useSidebarStore.getState()).toMatchObject({ open: false, autoCollapsed: true })

    useSidebarStore.setState({ open: false, autoCollapsed: false })
    useSidebarStore.getState().autoCollapse()
    expect(useSidebarStore.getState()).toMatchObject({ open: false, autoCollapsed: false })
  })

  it('toggling while auto-collapsed opens an overlay instead of pushing layout', () => {
    useSidebarStore.getState().autoCollapse()
    useSidebarStore.getState().toggle()
    expect(useSidebarStore.getState()).toMatchObject({ open: false, autoCollapsed: true, overlayOpen: true })
  })

  it('toggling again while the overlay is open closes just the overlay', () => {
    useSidebarStore.getState().autoCollapse()
    useSidebarStore.getState().toggle()
    useSidebarStore.getState().toggle()
    expect(useSidebarStore.getState()).toMatchObject({ open: false, autoCollapsed: true, overlayOpen: false })
  })

  it('closeOverlay dismisses the overlay without restoring the sidebar', () => {
    useSidebarStore.getState().autoCollapse()
    useSidebarStore.getState().toggle()
    useSidebarStore.getState().closeOverlay()
    expect(useSidebarStore.getState()).toMatchObject({ open: false, autoCollapsed: true, overlayOpen: false })
  })

  it('autoRestore only takes effect when auto-collapsed, and clears the overlay too', () => {
    useSidebarStore.getState().autoRestore()
    expect(useSidebarStore.getState()).toMatchObject({ open: true, autoCollapsed: false })

    useSidebarStore.getState().autoCollapse()
    useSidebarStore.getState().toggle()
    useSidebarStore.getState().autoRestore()
    expect(useSidebarStore.getState()).toMatchObject({ open: true, autoCollapsed: false, overlayOpen: false })
  })

  it('autoRestore leaves a manually-closed sidebar alone', () => {
    useSidebarStore.getState().toggle()
    useSidebarStore.getState().autoRestore()
    expect(useSidebarStore.getState()).toMatchObject({ open: false, autoCollapsed: false })
  })
})
