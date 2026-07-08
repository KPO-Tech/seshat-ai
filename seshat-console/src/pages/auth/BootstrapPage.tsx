import { Button, Card, Form, Input, message } from 'antd'
import { useNavigate } from 'react-router-dom'
import { useBootstrapPlatform } from '@/api/auth'
import { getErrorMessage } from '@/api/errors'

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
      <Card title="Set up Seshat" style={{ width: 420 }}>
        <Form<BootstrapFormValues>
          layout="vertical"
          onFinish={onFinish}
          disabled={bootstrap.isPending}
        >
          <Form.Item
            name="display_name"
            label="Your name"
            rules={[{ required: true, message: 'Enter your name' }]}
          >
            <Input autoFocus />
          </Form.Item>
          <Form.Item
            name="email"
            label="Email"
            rules={[{ required: true, type: 'email', message: 'Enter a valid email' }]}
          >
            <Input autoComplete="email" />
          </Form.Item>
          <Form.Item
            name="password"
            label="Password"
            rules={[{ required: true, min: 8, message: 'At least 8 characters' }]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Form.Item
            name="organization_name"
            label="Organization name"
            rules={[{ required: true, message: 'Enter an organization name' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="organization_slug"
            label="Organization slug"
            rules={[{ required: true, message: 'Enter a URL-safe slug' }]}
          >
            <Input placeholder="seshat" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block loading={bootstrap.isPending}>
              Create platform admin
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  )
}
