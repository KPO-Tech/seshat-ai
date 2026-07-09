import { Spin } from 'antd'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useBootstrapStatus } from '@/api/auth'

/**
 * Wraps the whole app: if the platform has never been bootstrapped, every
 * route redirects to /bootstrap. Once it has, /bootstrap redirects away —
 * bootstrapping is a one-time action (the server itself rejects a second
 * call with 409, this just avoids showing the form for no reason).
 */
export function BootstrapGate() {
  const location = useLocation()
  const { data, isLoading } = useBootstrapStatus()

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <Spin size="large" />
      </div>
    )
  }

  const initialized = data?.initialized ?? true
  if (!initialized && location.pathname !== '/bootstrap') {
    return <Navigate to="/bootstrap" replace />
  }
  if (initialized && location.pathname === '/bootstrap') {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}
