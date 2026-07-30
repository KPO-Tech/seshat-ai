import { useState } from 'react'
import { Alert, Button, Form, Input, message, Typography } from 'antd'
import { UserOutlined, MailOutlined, LockOutlined, ApartmentOutlined, LinkOutlined } from '@ant-design/icons'
import { Link, useNavigate } from 'react-router'
import { api } from '@/api/client'
import { useRegister } from '@/api/auth'
import { useCreateOrganization } from '@/api/organizations'
import { useAuthStore } from '@/store/auth'
import { getErrorMessage } from '@/api/errors'
import { AuthLayout } from '@/layout/AuthLayout'
import { palette } from '@/theme/tokens'

interface CreateOrganizationFormValues {
  display_name: string
  email: string
  password: string
  organization_name: string
  organization_slug: string
}

/**
 * Public self-serve entry point: one form creates the account and its
 * organization together, but under the hood these are two existing calls
 * (register, then create-organization), not one new backend endpoint. The
 * account already exists and is logged in by the time step 2 runs, so a
 * failure there switches to a narrower retry view instead of restarting —
 * re-submitting the full form would now fail with "email already exists".
 */
export function CreateOrganizationPage() {
  const register = useRegister()
  const createOrg = useCreateOrganization()
  const navigate = useNavigate()
  const [pendingOrg, setPendingOrg] = useState<{ name: string; slug: string } | null>(null)
  const [orgError, setOrgError] = useState<string | null>(null)

  const submitOrganization = (name: string, slug: string) => {
    createOrg.mutate(
      { name, slug },
      {
        onSuccess: async (org) => {
          // The session set by register() still has empty organizations/
          // memberships - refresh it here before navigating, otherwise
          // RequireOrganizationManager would (correctly, from its own point
          // of view) block the founder from the org they just created.
          const { data } = await api.GET('/api/v1/auth/me')
          if (data?.user) {
            useAuthStore.getState().setSession({
              token: useAuthStore.getState().token!,
              user: data.user,
              organizations: data.organizations ?? [],
              memberships: data.memberships ?? [],
            })
          }
          navigate(org?.id ? `/orgs/${org.id}/overview` : '/workspace', { replace: true })
        },
        onError: (error) => {
          setPendingOrg({ name, slug })
          setOrgError(getErrorMessage(error))
        },
      },
    )
  }

  const onFinish = (values: CreateOrganizationFormValues) => {
    register.mutate(
      { email: values.email, password: values.password, display_name: values.display_name },
      {
        onSuccess: () => submitOrganization(values.organization_name, values.organization_slug),
        onError: (error) => message.error(getErrorMessage(error)),
      },
    )
  }

  if (pendingOrg) {
    return (
      <AuthLayout
        title="Almost there"
        subtitle="Your account was created and you're signed in — we just couldn't create your organization yet."
      >
        <Alert type="error" showIcon message={orgError} style={{ marginBottom: 24 }} />
        <Button
          type="primary"
          block
          size="large"
          loading={createOrg.isPending}
          onClick={() => submitOrganization(pendingOrg.name, pendingOrg.slug)}
        >
          Retry creating &quot;{pendingOrg.name}&quot;
        </Button>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="Create your organization"
      subtitle="Start your own Seshat organization — you'll be its owner, with full control over its members and settings."
    >
      <Typography.Title level={4} style={{ marginTop: 0, marginBottom: 24 }}>
        Create an organization
      </Typography.Title>
      <Form<CreateOrganizationFormValues>
        layout="vertical"
        onFinish={onFinish}
        disabled={register.isPending || createOrg.isPending}
      >
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
        <Form.Item style={{ marginBottom: 16 }}>
          <Button
            type="primary"
            htmlType="submit"
            block
            size="large"
            loading={register.isPending || createOrg.isPending}
          >
            Create organization
          </Button>
        </Form.Item>
      </Form>
      <Typography.Text type="secondary">
        Joining an existing organization? <Link to="/login">Log in</Link> instead.
      </Typography.Text>
    </AuthLayout>
  )
}
