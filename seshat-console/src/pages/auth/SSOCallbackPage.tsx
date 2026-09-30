import { useEffect } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router'
import { Spin, Typography } from 'antd'
import { Link } from 'react-router'
import { useAuthStore } from '@/store/auth'
import { AuthLayout } from '@/layout/AuthLayout'

// SSOCallbackPage — the redirect_uri BeginOIDCLogin/BeginSAMLLogin send the
// browser to once an SSO login succeeds (see
// docs/helps/audit-2026-08-29-openwork-den-comparison.md § 9bis). Only
// ever receives a raw token via ?token=, never user/organizations/
// memberships - ProtectedRoute's own /auth/me hydration (already run
// unconditionally whenever a token exists) fills those in next, exactly
// like a page refresh after a normal password login already relies on.
export function SSOCallbackPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get('token')
  const error = searchParams.get('error')
  const setToken = useAuthStore((s) => s.setToken)
  const existingToken = useAuthStore((s) => s.token)

  useEffect(() => {
    if (token) {
      setToken(token)
      navigate('/', { replace: true })
    }
  }, [token, setToken, navigate])

  if (existingToken && !error) return <Navigate to="/" replace />

  if (error) {
    return (
      <AuthLayout title="Sign-in failed" subtitle="Something went wrong completing your SSO sign-in.">
        <Typography.Paragraph type="danger">{error}</Typography.Paragraph>
        <Link to="/login">Back to sign in</Link>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Signing you in…" subtitle="Completing your SSO sign-in.">
      <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0' }}>
        <Spin size="large" />
      </div>
    </AuthLayout>
  )
}
