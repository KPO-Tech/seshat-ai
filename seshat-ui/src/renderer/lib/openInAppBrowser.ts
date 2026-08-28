import { useUIStore } from '@/stores/ui'

// Routes an http(s) link click to the app's own embedded browser panel
// (RightPanelHost.tsx's BrowserPanel, backed by main/browser-panel.ts's
// WebContentsView) instead of the OS's default browser. Used by chat
// message markdown links and tool-result citation links - anywhere a user
// clicks a link the agent produced, they land in the built-in browser
// rather than getting bounced out of the app.
//
// openRightPanel alone only reliably navigates when it causes BrowserPanel
// to newly mount (its own mount effect calls browserApi.show + navigate) -
// if the panel is already open, that effect won't re-run for the new URL,
// so navigate() is also called directly here to cover both cases.
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
  useUIStore.getState().openRightPanel({ kind: 'browser', title: 'Browser', browserUrl: url, sessionId })
  void window.nexus.browser.navigate(contextId, url).catch(() => {
    // Panel will still be open; the user can retry via its own address bar.
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
