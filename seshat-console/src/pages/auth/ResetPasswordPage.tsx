import { Button, Form, Input, Result, Typography, message } from 'antd'
import { LockOutlined } from '@ant-design/icons'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useResetPassword } from '@/api/auth'
import { getErrorMessage } from '@/api/errors'
import { AuthLayout } from '@/layout/AuthLayout'
import { palette } from '@/theme/tokens'

interface ResetPasswordFormValues {
  new_password: string
  confirm_password: string
}

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const resetPassword = useResetPassword()
  const navigate = useNavigate()

  if (!token) {
    return (
      <AuthLayout title="Invalid reset link" subtitle="This link is missing its reset token.">
        <Result status="error" title="Missing token" extra={<Link to="/forgot-password">Request a new link</Link>} />
      </AuthLayout>
    )
  }

  const onFinish = (values: ResetPasswordFormValues) => {
    resetPassword.mutate(
      { token, new_password: values.new_password },
      {
        onSuccess: () => {
          message.success('Password reset — sign in with your new password')
          navigate('/login', { replace: true })
        },
        onError: (error) => message.error(getErrorMessage(error)),
      },
    )
  }

  return (
    <AuthLayout title="Choose a new password" subtitle="This will sign you out everywhere else too.">
      <Typography.Title level={4} style={{ marginTop: 0, marginBottom: 24 }}>
        Reset password
      </Typography.Title>
      <Form<ResetPasswordFormValues> layout="vertical" onFinish={onFinish} disabled={resetPassword.isPending}>
        <Form.Item
          name="new_password"
          label="New password"
          rules={[{ required: true, min: 8, message: 'At least 8 characters' }]}
        >
          <Input.Password
            prefix={<LockOutlined style={{ color: palette.inkTertiary }} />}
            autoFocus
            autoComplete="new-password"
            size="large"
          />
        </Form.Item>
        <Form.Item
          name="confirm_password"
          label="Confirm new password"
          dependencies={['new_password']}
          rules={[
            { required: true, message: 'Confirm your new password' },
            ({ getFieldValue }) => ({
              validator(_, value) {
                if (!value || getFieldValue('new_password') === value) return Promise.resolve()
                return Promise.reject(new Error('Passwords do not match'))
              },
            }),
          ]}
        >
          <Input.Password autoComplete="new-password" size="large" />
        </Form.Item>
        <Form.Item style={{ marginBottom: 16 }}>
          <Button type="primary" htmlType="submit" block size="large" loading={resetPassword.isPending}>
            Reset password
          </Button>
        </Form.Item>
      </Form>
      <Typography.Text type="secondary">
        <Link to="/login">Back to login</Link>
      </Typography.Text>
    </AuthLayout>
  )
}
