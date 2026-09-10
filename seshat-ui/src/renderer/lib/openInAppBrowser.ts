import { useUIStore } from '@/stores/ui'

// Routes an http(s) link click to the app's own embedded browser panel
// (RightPanelHost.tsx's BrowserPanel, backed by main/browser-panel.ts's
// WebContentsView) instead of the OS's default browser. Used by chat
// message markdown links and tool-result citation links - anywhere a user
// clicks a link the agent produced, they land in the built-in browser
// rather than getting bounced out of the app.
//
// openRightPanel only makes the panel visible. The actual browser action is
// handled through the Electron bridge so repeated link clicks behave like a
// normal browser: first click uses the empty/current tab, later clicks open
// a new tab instead of overwriting what the user is already reading.
//
// sessionId scopes the browser tab/history to the conversation the link was
// clicked from (matching RightPanelHost's `session:<id>` contextId), so
// links clicked in different conversations don't share tabs. Falls back to
// the shared 'chat' context when no sessionId is available (e.g. Knowledge
// base previews, Skills Creator - contexts with no conversation of their
// own).
export function openInAppBrowser(url: string, sessionId?: string): void {
  if (typeof window === 'undefined' || !window.nexus?.browser) {
    // Web build / no Electron bridge - fall back to a normal external tab.
    window.open(url, '_blank', 'noopener,noreferrer')
    return
  }
  const contextId = sessionId ? `session:${sessionId}` : 'chat'
  useUIStore.getState().openRightPanel({ kind: 'browser', title: 'Browser', sessionId })
  void window.nexus.browser.getState(contextId).then((state) => {
    const hasUserTab = state.tabs.some((tab) => tab.url && tab.url !== 'about:blank' && tab.url !== 'https://www.google.com/')
    if (hasUserTab) return window.nexus.browser!.newTab(contextId, url)
    return window.nexus.browser!.navigate(contextId, url)
  }).catch(() => {
    void window.nexus?.browser?.newTab(contextId, url).catch(() => undefined)
  })
}

// Only intercept plain left-clicks for plain http(s) links - never hijack a
// modifier-clicked link (new tab/window/download intent) or a non-web
// scheme (mailto:, file:, etc.), which should keep their native behavior.
export function shouldOpenInAppBrowser(event: React.MouseEvent, href: string | undefined): href is string {
  if (!href || !/^https?:\/\//i.test(href)) return false
  if (event.defaultPrevented || event.button !== 0) return false
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false
  return true
}
