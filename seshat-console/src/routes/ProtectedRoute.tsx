import { useEffect } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { Spin } from 'antd'
import { useAuthStore } from '@/store/auth'
import { useCurrentPrincipal } from '@/api/auth'

/**
 * Guards the authenticated part of the app. The auth store only persists the
 * bearer token (localStorage) - user/org/membership data is refetched via
 * /auth/me on every fresh page load, since that's the one call that always
 * reflects the server's current view of the session.
 */
export function ProtectedRoute() {
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const setSession = useAuthStore((s) => s.setSession)
  const { data, isLoading, isError } = useCurrentPrincipal(Boolean(token) && !user)

  useEffect(() => {
    if (data?.user && data.session?.token === undefined) {
      // /auth/me never echoes the raw token - keep the one already in the
      // store, just refresh the profile/org data around it.
      setSession({
        token: useAuthStore.getState().token!,
        user: data.user,
        organizations: data.organizations ?? [],
        memberships: data.memberships ?? [],
      })
    }
  }, [data, setSession])

  if (!token) return <Navigate to="/login" replace />
  if (!user && isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <Spin size="large" />
      </div>
    )
  }
  if (!user && isError) return <Navigate to="/login" replace />

  return <Outlet />
}
