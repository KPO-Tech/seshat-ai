import { useEffect, useState } from 'react'

export type BrowserPanelTab = {
  id: string
  label: string
  url: string
  status: 'loading' | 'ready'
  canGoBack: boolean
  canGoForward: boolean
}

export type BrowserPanelState = {
  activeTabId: string | null
  tabs: BrowserPanelTab[]
}

// Shared read model for a browser context's tab list - lets the panel
// header (tab strip) and the viewport (address bar, back/forward) stay in
// sync without one owning the other's state. The viewport still owns the
// show()/hide()/bounds lifecycle; this just mirrors what the main process
// broadcasts for that context.
export function useBrowserPanelState(contextId: string) {
  const browserApi = window.nexus?.browser
  const [state, setState] = useState<BrowserPanelState | null>(null)

  useEffect(() => {
    if (!browserApi) return
    void browserApi.getState(contextId).then(setState).catch(() => undefined)
    return browserApi.onStateChange(contextId, setState)
  }, [browserApi, contextId])

  return [state, setState] as const
}
