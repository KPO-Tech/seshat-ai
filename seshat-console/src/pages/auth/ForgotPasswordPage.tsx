import { useState } from 'react'
import { Button, Form, Input, Result, Typography } from 'antd'
import { MailOutlined } from '@ant-design/icons'
import { Link } from 'react-router'
import { useForgotPassword } from '@/api/auth'
import { AuthLayout } from '@/layout/AuthLayout'
import { palette } from '@/theme/tokens'

interface ForgotPasswordFormValues {
  email: string
}

/**
 * Always shows the same generic "check your email" success state
 * regardless of what the API actually did — the backend already doesn't
 * reveal whether the email matched an account (see ForgotPassword's doc
 * comment), and showing a different UI state here would undo that.
 */
export function ForgotPasswordPage() {
  const forgotPassword = useForgotPassword()
  const [submitted, setSubmitted] = useState(false)

  const onFinish = (values: ForgotPasswordFormValues) => {
    forgotPassword.mutate(values.email, {
      onSuccess: () => setSubmitted(true),
      onError: () => setSubmitted(true),
    })
  }

  if (submitted) {
    return (
      <AuthLayout title="Check your email" subtitle="If that address is registered, a reset link is on its way.">
        <Result
          status="success"
          title="Check your email"
          subTitle="If that address is registered, we've sent a link to reset your password. It expires in 1 hour."
          extra={<Link to="/login">Back to login</Link>}
        />
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Reset your password" subtitle="Enter your email and we'll send you a reset link.">
      <Typography.Title level={4} style={{ marginTop: 0, marginBottom: 24 }}>
        Forgot password
      </Typography.Title>
      <Form<ForgotPasswordFormValues> layout="vertical" onFinish={onFinish} disabled={forgotPassword.isPending}>
        <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email', message: 'Enter a valid email' }]}>
          <Input prefix={<MailOutlined style={{ color: palette.inkTertiary }} />} autoFocus autoComplete="email" size="large" />
        </Form.Item>
        <Form.Item style={{ marginBottom: 16 }}>
          <Button type="primary" htmlType="submit" block size="large" loading={forgotPassword.isPending}>
            Send reset link
          </Button>
        </Form.Item>
      </Form>
      <Typography.Text type="secondary">
        <Link to="/login">Back to login</Link>
      </Typography.Text>
    </AuthLayout>
  )
}
