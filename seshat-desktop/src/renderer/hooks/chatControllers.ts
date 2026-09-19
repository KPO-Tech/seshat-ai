// Shared across every useChat(sessionId) instance (Conversation.tsx,
// PlanEditorPanel.tsx, workspace/index.tsx, and any future caller) — a plain
// module singleton rather than per-hook refs, so that whichever component
// started a turn's fetch/AbortController, any OTHER instance's stopMessage()
// for the same sessionId can still reach it. Before this, each useChat call
// had its own Map/Set, so a turn started by PlanEditorPanel's sendMessage
// could not be locally aborted by Conversation.tsx's stopMessage — the
// backend interrupt still fired (it's keyed by sessionId, not by connection),
// but the stream then surfaced to PlanEditorPanel's own hook as a generic
// SSE error instead of a clean user-initiated stop, because ITS
// stopRequested flag was never set.
const activeControllers = new Map<string, AbortController>()
const stopRequested = new Set<string>()

export function registerController(sessionId: string, controller: AbortController) {
  activeControllers.set(sessionId, controller)
}

export function clearController(sessionId: string) {
  activeControllers.delete(sessionId)
}

export function abortController(sessionId: string) {
  activeControllers.get(sessionId)?.abort()
}

export function markStopRequested(sessionId: string) {
  stopRequested.add(sessionId)
}

export function clearStopRequested(sessionId: string) {
  stopRequested.delete(sessionId)
}

export function isStopRequested(sessionId: string): boolean {
  return stopRequested.has(sessionId)
}
