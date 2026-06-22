import { useEffect, useRef, useCallback } from 'react'

const INACTIVITY_MS = 30 * 60 * 1000 // 30 minutes
const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'] as const

export function useInactivityTimeout(onTimeout: () => void) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const onTimeoutRef = useRef(onTimeout)
  onTimeoutRef.current = onTimeout

  const reset = useCallback(() => {
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => onTimeoutRef.current(), INACTIVITY_MS)
  }, [])

  useEffect(() => {
    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, reset, { passive: true }))
    reset()
    return () => {
      clearTimeout(timerRef.current)
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, reset))
    }
  }, [reset])
}
