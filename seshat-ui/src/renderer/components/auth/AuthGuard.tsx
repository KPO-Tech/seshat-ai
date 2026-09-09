import { type ReactNode, useEffect, useState } from 'react'
import { Navigate } from 'react-router'
import { LoadingOne } from '@icon-park/react'
import { api, ApiError } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import { useOrganizationStore } from '@/stores/organization'
import { useInactivityTimeout } from '@/hooks/useInactivityTimeout'
import type { Organization } from '@/api/types'

type Status = 'checking' | 'ok' | 'invalid'

export function AuthGuard({ children }: { children: ReactNode }) {
  const { isAuthenticated, token, logout, setSession } = useAuthStore()
  const bridgeManaged = typeof window !== 'undefined' && !!window.nexus?.auth
  const [status, setStatus] = useState<Status>(bridgeManaged || isAuthenticated ? 'checking' : 'invalid')

  useInactivityTimeout()

  useEffect(() => {
    let cancelled = false

    // /auth/me is also the one place useOrganizationStore's "current
    // organization" gets (re)populated (see that store's own doc comment
    // for why there's no switcher yet). A network error or 5xx here stays
    // "optimistic" (status 'ok', not bounced to /login) since it isn't a
    // statement about session validity - a transient blip while the local
    // backend is still starting up shouldn't log the user out. But nothing
    // ever retried after that single attempt: a user who lands here during
    // exactly that startup window got stuck with an empty organization
    // store for the rest of the session, with every org-scoped feature
    // (Variables, Automation's Overview/job list) hanging forever on empty
    // organizationId and no way to recover short of restarting the app.
    // fetchMe retries a handful of times with backoff specifically for
    // those two transient cases; a real answer (401, or any other 4xx)
    // still resolves immediately, same as before.
    async function fetchMe(attempt: number): Promise<void> {
      try {
        const me = await api.get<{ organizations?: Organization[] }>('/auth/me')
        if (!cancelled) {
          useOrganizationStore.getState().setOrganizations(me.organizations ?? [])
          setStatus('ok')
        }
      } catch (error) {
        if (cancelled) return
        if (error instanceof ApiError) {
          if (error.status === 401) {
            // The backend explicitly said the session is invalid/expired.
            logout()
            setStatus('invalid')
            return
          }
          if (error.status < 500) {
            // Any other real HTTP response (403, 404, ...) is unexpected
            // for this endpoint and — unlike a network failure or a 5xx —
            // is an actual answer from the backend. Don't fail open on it.
            setStatus('invalid')
            return
          }
        }
        // Network failure (no ApiError at all) or a 5xx: retry with
        // backoff a few times before settling. Still fails open to 'ok'
        // once attempts run out, preserving the original "don't bounce to
        // /login over local-backend startup timing" behavior - the goal
        // here is only to stop giving up after a single try during that
        // same startup window.
        setStatus('ok')
        if (attempt >= 5) return
        setTimeout(() => { if (!cancelled) void fetchMe(attempt + 1) }, Math.min(1000 * 2 ** attempt, 15000))
      }
    }

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
      await fetchMe(0)
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
