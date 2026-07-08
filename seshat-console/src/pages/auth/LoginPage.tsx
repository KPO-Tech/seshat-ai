import { Button, Card, Form, Input, message } from 'antd'
import { Navigate, useNavigate } from 'react-router-dom'
import { useLogin } from '@/api/auth'
import { useAuthStore } from '@/store/auth'
import { getErrorMessage } from '@/api/errors'

interface LoginFormValues {
  email: string
  password: string
}

export function LoginPage() {
  const token = useAuthStore((s) => s.token)
  const login = useLogin()
  const navigate = useNavigate()

  if (token) return <Navigate to="/organizations" replace />

  const onFinish = (values: LoginFormValues) => {
    login.mutate(values, {
      onSuccess: () => navigate('/organizations', { replace: true }),
      onError: (error) => message.error(getErrorMessage(error)),
    })
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f5f6f4',
      }}
    >
      <Card title="Seshat Console" style={{ width: 360 }}>
        <Form<LoginFormValues> layout="vertical" onFinish={onFinish} disabled={login.isPending}>
          <Form.Item
            name="email"
            label="Email"
            rules={[{ required: true, type: 'email', message: 'Enter a valid email' }]}
          >
            <Input autoFocus autoComplete="email" />
          </Form.Item>
          <Form.Item
            name="password"
            label="Password"
            rules={[{ required: true, message: 'Enter your password' }]}
          >
            <Input.Password autoComplete="current-password" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block loading={login.isPending}>
              Log in
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  )
}
