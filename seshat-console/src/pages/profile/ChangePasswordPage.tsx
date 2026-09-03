import { Button, Card, Form, Input, message } from 'antd'
import { LockOutlined } from '@ant-design/icons'
import { useChangePassword } from '@/api/auth'
import { getErrorMessage } from '@/api/errors'
import { PageHeader } from '@/components/PageHeader'
import { palette } from '@/theme/tokens'

interface ChangePasswordFormValues {
  current_password: string
  new_password: string
  confirm_password: string
}

/**
 * Self-service password rotation - reachable by anyone (not admin-gated,
 * same trust tier as MyProfilePage.tsx), most useful for accounts an admin
 * created directly with an initial password (see the console's Users page)
 * who need to set their own afterward.
 */
export function ChangePasswordPage() {
  const [form] = Form.useForm<ChangePasswordFormValues>()
  const changePassword = useChangePassword()

  const onFinish = (values: ChangePasswordFormValues) => {
    changePassword.mutate(
      { current_password: values.current_password, new_password: values.new_password },
      {
        onSuccess: () => {
          message.success('Password updated')
          form.resetFields()
        },
        onError: (error) => message.error(getErrorMessage(error)),
      },
    )
  }

  return (
    <div>
      <PageHeader />
      <Card style={{ maxWidth: 480 }}>
        <Form<ChangePasswordFormValues>
          form={form}
          layout="vertical"
          onFinish={onFinish}
          disabled={changePassword.isPending}
        >
          <Form.Item
            name="current_password"
            label="Current password"
            rules={[{ required: true, message: 'Enter your current password' }]}
          >
            <Input.Password
              prefix={<LockOutlined style={{ color: palette.inkTertiary }} />}
              autoComplete="current-password"
              size="large"
            />
          </Form.Item>
          <Form.Item
            name="new_password"
            label="New password"
            rules={[{ required: true, min: 8, message: 'At least 8 characters' }]}
          >
            <Input.Password
              prefix={<LockOutlined style={{ color: palette.inkTertiary }} />}
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
            <Input.Password
              prefix={<LockOutlined style={{ color: palette.inkTertiary }} />}
              autoComplete="new-password"
              size="large"
            />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Button type="primary" htmlType="submit" size="large" loading={changePassword.isPending}>
              Update password
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  )
}
