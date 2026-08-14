import { type ReactNode, useEffect, useState } from 'react'
import { Navigate } from 'react-router'
import { LoadingOne } from '@icon-park/react'
import { api, ApiError } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import { useInactivityTimeout } from '@/hooks/useInactivityTimeout'

type Status = 'checking' | 'ok' | 'invalid'

export function AuthGuard({ children }: { children: ReactNode }) {
  const { isAuthenticated, token, logout, setSession } = useAuthStore()
  const bridgeManaged = typeof window !== 'undefined' && !!window.nexus?.auth
  const [status, setStatus] = useState<Status>(bridgeManaged || isAuthenticated ? 'checking' : 'invalid')

  useInactivityTimeout()

  useEffect(() => {
    let cancelled = false

    async function validate() {
      if (window.nexus?.auth) {
        const restored = await window.nexus.auth.restoreSession().catch(() => null)
        if (!restored) {
          logout()
          if (!cancelled) setStatus('invalid')
          return
        }
        setSession(restored)
      } else if (!isAuthenticated || !token) {
        setStatus('invalid')
        return
      }

      try {
        await api.get('/auth/me')
        if (!cancelled) setStatus('ok')
      } catch (error) {
        if (cancelled) return
        if (!(error instanceof ApiError)) {
          // No HTTP response reached us at all (network drop, backend not up
          // yet) — not an auth decision either way. Stay optimistic rather
          // than bouncing the user to /login over a transient connectivity
          // blip to the local backend.
          setStatus('ok')
          return
        }
        if (error.status === 401) {
          // The backend explicitly said the session is invalid/expired.
          logout()
          setStatus('invalid')
          return
        }
        if (error.status >= 500) {
          // The backend is up but erroring server-side — not a statement
          // about this session's validity, so don't treat it as one.
          setStatus('ok')
          return
        }
        // Any other real HTTP response (403, 404, ...) is unexpected for
        // this endpoint and — unlike a network failure or a 5xx — is an
        // actual answer from the backend. Don't fail open on it.
        setStatus('invalid')
      }
    }

    void validate()
    return () => { cancelled = true }
  // Run once per mount — intentionally not re-running on token change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // AuthGuard mounts once for the whole authenticated route subtree (see
  // router/index.tsx — it wraps <Shell/>, which never remounts on
  // navigation), so the one-time validate() above only ever runs at app
  // start. Every logout() call after that — the inactivity timeout, a 401
  // from api/client.ts, a mid-stream 401 in useChat.ts — clears
  // isAuthenticated in the store but was never actually reflected here:
  // status stayed 'ok' forever once set, so the UI kept rendering the app
  // on a session the backend/store had already invalidated instead of
  // bouncing to /login like every one of those call sites' comments assumed.
  useEffect(() => {
    if (status === 'ok' && !isAuthenticated) {
      setStatus('invalid')
    }
  }, [isAuthenticated, status])

  if (status === 'checking') {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        color: 'var(--color-text-muted)',
      }}>
        <LoadingOne size={23} className="spin" />
      </div>
    )
  }
  if (status === 'invalid') return <Navigate to="/login" replace />
  return <>{children}</>
}
