import { Button, Form, Input, message, Spin, Typography } from 'antd'
import { UserOutlined, MailOutlined, LockOutlined, ApartmentOutlined, LinkOutlined } from '@ant-design/icons'
import { Navigate, useNavigate } from 'react-router'
import { useBootstrap, useBootstrapStatus } from '@/api/auth'
import { useAuthStore } from '@/store/auth'
import { getErrorMessage } from '@/api/errors'
import { resolveLandingPath } from '@/lib/landingRoute'
import { AuthLayout } from '@/layout/AuthLayout'
import { palette } from '@/theme/tokens'

interface BootstrapFormValues {
  display_name: string
  email: string
  password: string
  organization_name: string
  organization_slug: string
}

/**
 * One-time setup screen for a fresh seshat-server (no platform admin yet):
 * creates the first platform admin and their organization together via
 * POST /auth/bootstrap. Documented in README.md but never actually built —
 * see the 2026-08-06 audit. Reachable directly at /bootstrap, and LoginPage
 * redirects here automatically once it knows the platform isn't initialized.
 */
export function BootstrapPage() {
  const token = useAuthStore((s) => s.token)
  const status = useBootstrapStatus()
  const bootstrap = useBootstrap()
  const navigate = useNavigate()

  if (token) return <Navigate to="/" replace />

  // Once a platform admin already exists, bootstrapping is a dead end —
  // the server will reject it, so don't even show the form.
  if (status.isSuccess && status.data?.initialized) {
    return <Navigate to="/login" replace />
  }

  const onFinish = (values: BootstrapFormValues) => {
    bootstrap.mutate(values, {
      onSuccess: (data) => {
        if (data.user) navigate(resolveLandingPath(data.user, data.organizations ?? []), { replace: true })
      },
      onError: (error) => message.error(getErrorMessage(error)),
    })
  }

  return (
    <AuthLayout
      title="Set up your platform"
      subtitle="No platform admin exists yet on this server. Create the first one, along with your organization."
    >
      {status.isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0' }}>
          <Spin />
        </div>
      ) : (
        <>
          <Typography.Title level={4} style={{ marginTop: 0, marginBottom: 24 }}>
            Platform setup
          </Typography.Title>
          <Form<BootstrapFormValues> layout="vertical" onFinish={onFinish} disabled={bootstrap.isPending}>
            <Form.Item name="display_name" label="Your name" rules={[{ required: true, message: 'Enter your name' }]}>
              <Input prefix={<UserOutlined style={{ color: palette.inkTertiary }} />} autoFocus size="large" />
            </Form.Item>
            <Form.Item
              name="email"
              label="Email"
              rules={[{ required: true, type: 'email', message: 'Enter a valid email' }]}
            >
              <Input prefix={<MailOutlined style={{ color: palette.inkTertiary }} />} autoComplete="email" size="large" />
            </Form.Item>
            <Form.Item
              name="password"
              label="Password"
              rules={[{ required: true, min: 8, message: 'At least 8 characters' }]}
            >
              <Input.Password
                prefix={<LockOutlined style={{ color: palette.inkTertiary }} />}
                autoComplete="new-password"
                size="large"
              />
            </Form.Item>
            <Form.Item
              name="organization_name"
              label="Organization name"
              rules={[{ required: true, message: 'Enter an organization name' }]}
            >
              <Input prefix={<ApartmentOutlined style={{ color: palette.inkTertiary }} />} size="large" />
            </Form.Item>
            <Form.Item
              name="organization_slug"
              label="Organization slug"
              rules={[{ required: true, message: 'Enter a URL-safe slug' }]}
            >
              <Input
                prefix={<LinkOutlined style={{ color: palette.inkTertiary }} />}
                placeholder="seshat"
                size="large"
              />
            </Form.Item>
            <Form.Item style={{ marginBottom: 0 }}>
              <Button type="primary" htmlType="submit" block size="large" loading={bootstrap.isPending}>
                Set up platform
              </Button>
            </Form.Item>
          </Form>
        </>
      )}
    </AuthLayout>
  )
}
