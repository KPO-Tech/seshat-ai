import { useEffect, useRef } from 'react'
import { useAuthStore } from '@/stores/auth'

// Was 30 minutes when this was first added (2026-08-06 security audit) —
// far too aggressive for a local single-user desktop app and just meant
// getting bounced to /login mid-work any time the window sat idle for a
// coffee break. Widened to 2 days per product decision (2026-08-13): still
// signs out a genuinely abandoned/long-unused install, without punishing
// normal usage patterns.
const DEFAULT_TIMEOUT_MS = 2 * 24 * 60 * 60 * 1000 // 2 days

const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart', 'scroll'] as const

// A desktop session otherwise stays authenticated indefinitely once logged
// in — nothing else in the app ever calls logout() on its own. Attaching
// this while authenticated (see AuthGuard) means a workstation left
// unlocked for `timeoutMs` with no mouse/keyboard/scroll activity signs the
// user out locally, same as any session-based desktop app.
//
// Deliberately lightweight: no React state, so mousemove doesn't trigger a
// re-render on every pixel — just a ref-held timer reset on each event.
export function useInactivityTimeout(timeoutMs: number = DEFAULT_TIMEOUT_MS) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!isAuthenticated) return

    const resetTimer = () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        useAuthStore.getState().logout()
      }, timeoutMs)
    }

    resetTimer()
    for (const eventName of ACTIVITY_EVENTS) {
      window.addEventListener(eventName, resetTimer, { passive: true })
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      for (const eventName of ACTIVITY_EVENTS) {
        window.removeEventListener(eventName, resetTimer)
      }
    }
  }, [isAuthenticated, timeoutMs])
}
