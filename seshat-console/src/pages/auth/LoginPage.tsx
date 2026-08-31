import { useState } from 'react'
import { Button, Divider, Form, Input, message, Typography } from 'antd'
import { MailOutlined, LockOutlined, ArrowLeftOutlined } from '@ant-design/icons'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router'
import { useLogin, useBootstrapStatus } from '@/api/auth'
import { useSSOLookup, ssoStartPath, type SSOProviderMatch } from '@/api/sso'
import { useAuthStore } from '@/store/auth'
import { getErrorMessage } from '@/api/errors'
import { resolveLandingPath } from '@/lib/landingRoute'
import { AuthLayout } from '@/layout/AuthLayout'
import { palette } from '@/theme/tokens'

interface PasswordFormValues {
  password: string
}

// LoginPage — a two-step, "email first" flow (see
// docs/helps/audit-2026-08-29-openwork-den-comparison.md § 9bis, decided
// with the user over an org-slug-in-URL alternative): step 1 asks only for
// an email and checks it against configured SSO providers' domains; step 2
// shows a "Continue with {IdP}" button when one matches, alongside the
// password field either way - an org isn't forced onto SSO-only just
// because a provider happens to match its domain.
export function LoginPage() {
  const token = useAuthStore((s) => s.token)
  const login = useLogin()
  const ssoLookup = useSSOLookup()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  // Carries the caller through to e.g. /accept-invitation?token=... after
  // auth - set by AcceptInvitationPage when the invitee isn't logged in yet.
  const next = searchParams.get('next')
  // A fresh seshat-server has no platform admin yet — send visitors to the
  // one-time setup screen instead of a login form nobody can pass.
  const bootstrapStatus = useBootstrapStatus()

  const [email, setEmail] = useState('')
  const [ssoMatch, setSSOMatch] = useState<SSOProviderMatch | null>(null)
  const [step, setStep] = useState<'email' | 'password'>('email')

  if (token) return <Navigate to={next || '/'} replace />
  if (bootstrapStatus.isSuccess && bootstrapStatus.data?.initialized === false) {
    return <Navigate to="/bootstrap" replace />
  }

  function handleEmailSubmit(values: { email: string }) {
    setEmail(values.email)
    ssoLookup.mutate(values.email, {
      onSuccess: (match) => {
        setSSOMatch(match)
        setStep('password')
      },
      onError: () => {
        // Discovery is best-effort - if it fails, fall through to the
        // normal password step rather than blocking sign-in entirely.
        setSSOMatch(null)
        setStep('password')
      },
    })
  }

  function handlePasswordSubmit(values: PasswordFormValues) {
    login.mutate(
      { email, password: values.password },
      {
        onSuccess: (data) => {
          if (data.user) navigate(next || resolveLandingPath(data.user, data.organizations ?? []), { replace: true })
        },
        onError: (error) => message.error(getErrorMessage(error)),
      },
    )
  }

  function handleContinueWithSSO() {
    if (!ssoMatch) return
    const redirectURI = `${window.location.origin}/auth/sso-callback`
    window.location.href = ssoStartPath(ssoMatch, redirectURI)
  }

  return (
    <AuthLayout
      title="Sign in to your control plane"
      subtitle="Manage organizations, applications, identity and automation for your Seshat deployment."
    >
      <Typography.Title level={4} style={{ marginTop: 0, marginBottom: 24 }}>
        Log in
      </Typography.Title>

      {step === 'email' ? (
        <Form layout="vertical" onFinish={handleEmailSubmit} disabled={ssoLookup.isPending}>
          <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email', message: 'Enter a valid email' }]}>
            <Input
              prefix={<MailOutlined style={{ color: palette.inkTertiary }} />}
              autoFocus
              autoComplete="email"
              size="large"
            />
          </Form.Item>
          <Form.Item style={{ marginBottom: 16 }}>
            <Button type="primary" htmlType="submit" block size="large" loading={ssoLookup.isPending}>
              Continue
            </Button>
          </Form.Item>
        </Form>
      ) : (
        <>
          <Button
            type="text"
            size="small"
            icon={<ArrowLeftOutlined />}
            style={{ paddingLeft: 0, marginBottom: 12, color: palette.inkTertiary }}
            onClick={() => setStep('email')}
          >
            {email}
          </Button>

          {ssoMatch && (
            <>
              <Button block size="large" onClick={handleContinueWithSSO} style={{ marginBottom: 16 }}>
                Continue with {ssoMatch.name}
              </Button>
              <Divider plain style={{ margin: '0 0 16px', fontSize: 12, color: palette.inkTertiary }}>
                or sign in with password
              </Divider>
            </>
          )}

          <Form<PasswordFormValues> layout="vertical" onFinish={handlePasswordSubmit} disabled={login.isPending}>
            <Form.Item
              name="password"
              label="Password"
              rules={[{ required: true, message: 'Enter your password' }]}
              extra={
                <Link to="/forgot-password" style={{ fontSize: 12 }}>
                  Forgot password?
                </Link>
              }
            >
              <Input.Password
                prefix={<LockOutlined style={{ color: palette.inkTertiary }} />}
                autoComplete="current-password"
                size="large"
                autoFocus
              />
            </Form.Item>
            <Form.Item style={{ marginBottom: 16 }}>
              <Button type="primary" htmlType="submit" block size="large" loading={login.isPending}>
                Log in
              </Button>
            </Form.Item>
          </Form>
        </>
      )}

      <Typography.Text type="secondary" style={{ display: 'block' }}>
        No account yet? <Link to={next ? `/register?next=${encodeURIComponent(next)}` : '/register'}>Sign up</Link>
      </Typography.Text>
      <Typography.Text type="secondary">
        Starting a new company? <Link to="/create-organization">Create an organization</Link>
      </Typography.Text>
    </AuthLayout>
  )
}
