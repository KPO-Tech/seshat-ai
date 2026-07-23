// Remembers which session_id belongs to which organization so a page
// refresh can reattach to the same conversation instead of starting a
// fresh one - one id per organization, since the composer is scoped to
// whichever organization is currently selected.
const KEY_PREFIX = 'workspace-chat-session:'

export function getStoredSessionId(organizationId: string): string | null {
  try {
    return localStorage.getItem(KEY_PREFIX + organizationId)
  } catch {
    return null
  }
}

export function setStoredSessionId(organizationId: string, sessionId: string): void {
  try {
    localStorage.setItem(KEY_PREFIX + organizationId, sessionId)
  } catch {
    // Storage unavailable (private browsing, quota) - persistence across a
    // refresh just won't work this session, nothing to recover from here.
  }
}

export function clearStoredSessionId(organizationId: string): void {
  try {
    localStorage.removeItem(KEY_PREFIX + organizationId)
  } catch {
    // See setStoredSessionId.
  }
}
