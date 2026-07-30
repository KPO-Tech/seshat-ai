import { Button, Form, Input, message, Typography } from 'antd'
import { MailOutlined, LockOutlined, UserOutlined } from '@ant-design/icons'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router'
import { useRegister } from '@/api/auth'
import { useAuthStore } from '@/store/auth'
import { getErrorMessage } from '@/api/errors'
import { resolveLandingPath } from '@/lib/landingRoute'
import { AuthLayout } from '@/layout/AuthLayout'
import { palette } from '@/theme/tokens'

interface RegisterFormValues {
  email: string
  password: string
  display_name: string
}

export function RegisterPage() {
  const token = useAuthStore((s) => s.token)
  const register = useRegister()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const next = searchParams.get('next')

  if (token) return <Navigate to={next || '/'} replace />

  const onFinish = (values: RegisterFormValues) => {
    register.mutate(values, {
      onSuccess: (data) => {
        if (data.user) navigate(next || resolveLandingPath(data.user, data.organizations ?? []), { replace: true })
      },
      onError: (error) => message.error(getErrorMessage(error)),
    })
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="If your work email matches an organization already on this platform, you'll join it automatically."
    >
      <Typography.Title level={4} style={{ marginTop: 0, marginBottom: 24 }}>
        Sign up
      </Typography.Title>
      <Form<RegisterFormValues> layout="vertical" onFinish={onFinish} disabled={register.isPending}>
        <Form.Item
          name="display_name"
          label="Full name"
          rules={[{ required: true, message: 'Enter your name' }]}
        >
          <Input prefix={<UserOutlined style={{ color: palette.inkTertiary }} />} autoFocus autoComplete="name" size="large" />
        </Form.Item>
        <Form.Item
          name="email"
          label="Work email"
          rules={[{ required: true, type: 'email', message: 'Enter a valid email' }]}
        >
          <Input prefix={<MailOutlined style={{ color: palette.inkTertiary }} />} autoComplete="email" size="large" />
        </Form.Item>
        <Form.Item
          name="password"
          label="Password"
          rules={[{ required: true, message: 'Choose a password' }]}
        >
          <Input.Password
            prefix={<LockOutlined style={{ color: palette.inkTertiary }} />}
            autoComplete="new-password"
            size="large"
          />
        </Form.Item>
        <Form.Item style={{ marginBottom: 16 }}>
          <Button type="primary" htmlType="submit" block size="large" loading={register.isPending}>
            Create account
          </Button>
        </Form.Item>
      </Form>
      <Typography.Text type="secondary">
        Already have an account? <Link to={next ? `/login?next=${encodeURIComponent(next)}` : '/login'}>Log in</Link>
      </Typography.Text>
    </AuthLayout>
  )
}
