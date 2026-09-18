import { beforeEach, describe, expect, it } from 'vitest'
import { useRightPanelStore } from './rightPanel'

describe('useRightPanelStore', () => {
  beforeEach(() => {
    useRightPanelStore.setState({ panel: null })
  })

  it('opens a panel', () => {
    useRightPanelStore.getState().openPanel('browser', 's1')
    expect(useRightPanelStore.getState().panel).toMatchObject({ kind: 'browser', sessionId: 's1' })
  })

  it('replaces the open panel for a different session, keeping the current width', () => {
    useRightPanelStore.getState().openPanel('browser', 's1')
    useRightPanelStore.getState().setWidth(500)
    useRightPanelStore.getState().openPanel('browser', 's2')
    expect(useRightPanelStore.getState().panel).toMatchObject({ kind: 'browser', sessionId: 's2', width: 500 })
  })

  it('is a no-op when opening the exact same panel that is already open', () => {
    useRightPanelStore.getState().openPanel('browser', 's1')
    const before = useRightPanelStore.getState().panel
    useRightPanelStore.getState().openPanel('browser', 's1')
    expect(useRightPanelStore.getState().panel).toBe(before)
  })

  it('closes the panel', () => {
    useRightPanelStore.getState().openPanel('browser', 's1')
    useRightPanelStore.getState().closePanel()
    expect(useRightPanelStore.getState().panel).toBeNull()
  })

  it('clamps width to the min bound and the absolute ceiling when no dynamic max is given', () => {
    useRightPanelStore.getState().openPanel('browser', 's1')
    useRightPanelStore.getState().setWidth(50)
    expect(useRightPanelStore.getState().panel?.width).toBe(420)
    useRightPanelStore.getState().setWidth(5000)
    expect(useRightPanelStore.getState().panel?.width).toBe(1200)
  })

  it('clamps width to a caller-supplied dynamic max (e.g. available app width)', () => {
    useRightPanelStore.getState().openPanel('browser', 's1')
    useRightPanelStore.getState().setWidth(900, 600)
    expect(useRightPanelStore.getState().panel?.width).toBe(600)
    useRightPanelStore.getState().setWidth(100, 600)
    expect(useRightPanelStore.getState().panel?.width).toBe(420)
  })
})
