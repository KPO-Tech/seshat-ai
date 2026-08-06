import { useEffect, useRef } from 'react'
import { useAuthStore } from '@/stores/auth'

const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000 // 30 minutes

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
