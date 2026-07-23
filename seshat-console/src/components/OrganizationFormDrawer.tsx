import { useEffect, useState } from 'react'
import { Button, Drawer, Form, Input } from 'antd'
import type { Organization, OrganizationInput } from '@/api/organizations'

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function OrganizationFormDrawer({
  organization,
  open,
  onClose,
  onSubmit,
  submitting,
}: {
  organization: Organization | null
  open: boolean
  onClose: () => void
  onSubmit: (values: OrganizationInput) => void
  submitting: boolean
}) {
  const [form] = Form.useForm<OrganizationInput>()
  const [slugTouched, setSlugTouched] = useState(false)

  useEffect(() => {
    if (open) {
      form.setFieldsValue(organization ?? { name: '', slug: '' })
      setSlugTouched(Boolean(organization?.slug))
    }
  }, [open, organization, form])

  return (
    <Drawer
      title={organization ? `Edit ${organization.name}` : 'New organization'}
      open={open}
      onClose={onClose}
      destroyOnHidden
      size={720}
      extra={
        <Button type="primary" loading={submitting} onClick={() => form.submit()}>
          Save
        </Button>
      }
    >
      <Form<OrganizationInput>
        form={form}
        layout="vertical"
        onValuesChange={(changedValues) => {
          if (organization || slugTouched) return
          if (typeof changedValues.name === 'string') {
            form.setFieldValue('slug', slugify(changedValues.name))
          }
        }}
        onFinish={onSubmit}
      >
        <Form.Item name="name" label="Name" rules={[{ required: true, message: 'Required' }]}>
          <Input placeholder="Acme" />
        </Form.Item>
        <Form.Item
          name="slug"
          label="Slug"
          rules={[{ required: true, pattern: /^[a-z0-9-]+$/, message: 'Lowercase letters, digits, hyphens' }]}
          extra="Used in URLs and internal routing."
        >
          <Input placeholder="acme" onChange={() => setSlugTouched(true)} />
        </Form.Item>
        <Form.Item name="description" label="Description">
          <Input.TextArea rows={3} placeholder="What this organization is for." />
        </Form.Item>
        <Form.Item name="website_url" label="Website">
          <Input placeholder="https://example.com" />
        </Form.Item>
        <Form.Item name="support_email" label="Support email" rules={[{ type: 'email' }]}>
          <Input placeholder="support@example.com" />
        </Form.Item>
        <Form.Item
          name="domain"
          label="Email domain"
          extra="Optional. Anyone signing up with an email on this domain auto-joins as a pending member (see Team & Access)."
        >
          <Input placeholder="acmecorp.com" />
        </Form.Item>
      </Form>
    </Drawer>
  )
}
