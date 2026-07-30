import { type ReactNode, useEffect, useState } from 'react'
import { Navigate } from 'react-router'
import { LoadingOne } from '@icon-park/react'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/auth'

type Status = 'checking' | 'ok' | 'invalid'

export function AuthGuard({ children }: { children: ReactNode }) {
  const { isAuthenticated, token, logout, setSession } = useAuthStore()
  const bridgeManaged = typeof window !== 'undefined' && !!window.nexus?.auth
  const [status, setStatus] = useState<Status>(bridgeManaged || isAuthenticated ? 'checking' : 'invalid')

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
        const statusCode = (error as { status?: number })?.status
        if (statusCode === 401) {
          logout()
          setStatus('invalid')
          return
        }
        setStatus('ok')
      }
    }

    void validate()
    return () => { cancelled = true }
  // Run once per mount — intentionally not re-running on token change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
