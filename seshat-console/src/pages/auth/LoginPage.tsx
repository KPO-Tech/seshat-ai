import { Button, Form, Input, message, Typography } from 'antd'
import { MailOutlined, LockOutlined } from '@ant-design/icons'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router'
import { useLogin, useBootstrapStatus } from '@/api/auth'
import { useAuthStore } from '@/store/auth'
import { getErrorMessage } from '@/api/errors'
import { resolveLandingPath } from '@/lib/landingRoute'
import { AuthLayout } from '@/layout/AuthLayout'
import { palette } from '@/theme/tokens'

interface LoginFormValues {
  email: string
  password: string
}

export function LoginPage() {
  const token = useAuthStore((s) => s.token)
  const login = useLogin()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  // Carries the caller through to e.g. /accept-invitation?token=... after
  // auth - set by AcceptInvitationPage when the invitee isn't logged in yet.
  const next = searchParams.get('next')
  // A fresh seshat-server has no platform admin yet — send visitors to the
  // one-time setup screen instead of a login form nobody can pass.
  const bootstrapStatus = useBootstrapStatus()

  if (token) return <Navigate to={next || '/'} replace />
  if (bootstrapStatus.isSuccess && bootstrapStatus.data?.initialized === false) {
    return <Navigate to="/bootstrap" replace />
  }

  const onFinish = (values: LoginFormValues) => {
    login.mutate(values, {
      onSuccess: (data) => {
        if (data.user) navigate(next || resolveLandingPath(data.user, data.organizations ?? []), { replace: true })
      },
      onError: (error) => message.error(getErrorMessage(error)),
    })
  }

  return (
    <AuthLayout
      title="Sign in to your control plane"
      subtitle="Manage organizations, applications, identity and automation for your Seshat deployment."
    >
      <Typography.Title level={4} style={{ marginTop: 0, marginBottom: 24 }}>
        Log in
      </Typography.Title>
      <Form<LoginFormValues> layout="vertical" onFinish={onFinish} disabled={login.isPending}>
        <Form.Item
          name="email"
          label="Email"
          rules={[{ required: true, type: 'email', message: 'Enter a valid email' }]}
        >
          <Input
            prefix={<MailOutlined style={{ color: palette.inkTertiary }} />}
            autoFocus
            autoComplete="email"
            size="large"
          />
        </Form.Item>
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
          />
        </Form.Item>
        <Form.Item style={{ marginBottom: 16 }}>
          <Button type="primary" htmlType="submit" block size="large" loading={login.isPending}>
            Log in
          </Button>
        </Form.Item>
      </Form>
      <Typography.Text type="secondary" style={{ display: 'block' }}>
        No account yet? <Link to={next ? `/register?next=${encodeURIComponent(next)}` : '/register'}>Sign up</Link>
      </Typography.Text>
      <Typography.Text type="secondary">
        Starting a new company? <Link to="/create-organization">Create an organization</Link>
      </Typography.Text>
    </AuthLayout>
  )
}
