import { Button, Form, Input, message, Typography } from 'antd'
import { MailOutlined, LockOutlined } from '@ant-design/icons'
import { Navigate, useNavigate } from 'react-router-dom'
import { useLogin } from '@/api/auth'
import { useAuthStore } from '@/store/auth'
import { getErrorMessage } from '@/api/errors'
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

  if (token) return <Navigate to="/platform/overview" replace />

  const onFinish = (values: LoginFormValues) => {
    login.mutate(values, {
      onSuccess: () => navigate('/platform/overview', { replace: true }),
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
        <Form.Item name="password" label="Password" rules={[{ required: true, message: 'Enter your password' }]}>
          <Input.Password
            prefix={<LockOutlined style={{ color: palette.inkTertiary }} />}
            autoComplete="current-password"
            size="large"
          />
        </Form.Item>
        <Form.Item style={{ marginBottom: 0 }}>
          <Button type="primary" htmlType="submit" block size="large" loading={login.isPending}>
            Log in
          </Button>
        </Form.Item>
      </Form>
    </AuthLayout>
  )
}
