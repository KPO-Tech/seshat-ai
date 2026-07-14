import { Button, Form, Input, message, Typography } from 'antd'
import { useNavigate } from 'react-router-dom'
import { useBootstrapPlatform } from '@/api/auth'
import { getErrorMessage } from '@/api/errors'
import { AuthLayout } from '@/layout/AuthLayout'

interface BootstrapFormValues {
  email: string
  password: string
  display_name: string
  organization_name: string
  organization_slug: string
}

export function BootstrapPage() {
  const bootstrap = useBootstrapPlatform()
  const navigate = useNavigate()

  const onFinish = (values: BootstrapFormValues) => {
    bootstrap.mutate(values, {
      onSuccess: () => navigate('/platform/overview', { replace: true }),
      onError: (error) => message.error(getErrorMessage(error)),
    })
  }

  return (
    <AuthLayout
      title="Set up your Seshat control plane"
      subtitle="This creates the first platform admin and organization. It is a one-time step and the server refuses to run it twice."
    >
      <Typography.Title level={4} style={{ marginTop: 0, marginBottom: 24 }}>
        Create platform admin
      </Typography.Title>
      <Form<BootstrapFormValues> layout="vertical" onFinish={onFinish} disabled={bootstrap.isPending}>
        <Form.Item name="display_name" label="Your name" rules={[{ required: true, message: 'Enter your name' }]}>
          <Input autoFocus size="large" />
        </Form.Item>
        <Form.Item
          name="email"
          label="Email"
          rules={[{ required: true, type: 'email', message: 'Enter a valid email' }]}
        >
          <Input autoComplete="email" size="large" />
        </Form.Item>
        <Form.Item
          name="password"
          label="Password"
          rules={[{ required: true, min: 8, message: 'At least 8 characters' }]}
        >
          <Input.Password autoComplete="new-password" size="large" />
        </Form.Item>
        <Form.Item
          name="organization_name"
          label="Organization name"
          rules={[{ required: true, message: 'Enter an organization name' }]}
        >
          <Input size="large" />
        </Form.Item>
        <Form.Item
          name="organization_slug"
          label="Organization slug"
          rules={[{ required: true, message: 'Enter a URL-safe slug' }]}
        >
          <Input placeholder="seshat" size="large" />
        </Form.Item>
        <Form.Item style={{ marginBottom: 0 }}>
          <Button type="primary" htmlType="submit" block size="large" loading={bootstrap.isPending}>
            Create platform admin
          </Button>
        </Form.Item>
      </Form>
    </AuthLayout>
  )
}
