import { useEffect } from 'react'
import { Button, Drawer, Form, Input } from 'antd'
import type { Corpus, CorpusInput } from '@/api/knowledge'

// Shared between CorporaPage ("New corpus") and CorpusDetailPage ("Edit"
// an existing corpus - the caller decides whether to call create or
// update based on whether corpus is set).
export function CorpusFormDrawer({
  corpus = null,
  open,
  onClose,
  onSubmit,
  submitting,
}: {
  corpus?: Corpus | null
  open: boolean
  onClose: () => void
  onSubmit: (values: Omit<CorpusInput, 'organization_id'>) => void
  submitting: boolean
}) {
  const [form] = Form.useForm<CorpusInput>()

  useEffect(() => {
    if (open) {
      form.setFieldsValue({
        name: corpus?.name ?? '',
        description: corpus?.description ?? '',
      })
    }
  }, [open, form, corpus])

  return (
    <Drawer
      title={corpus ? `Edit ${corpus.name}` : 'New corpus'}
      open={open}
      onClose={onClose}
      destroyOnHidden
      extra={
        <Button type="primary" loading={submitting} onClick={() => form.submit()}>
          Save
        </Button>
      }
    >
      <Form<CorpusInput> form={form} layout="vertical" onFinish={onSubmit}>
        <Form.Item name="name" label="Name" rules={[{ required: true, message: 'Required' }]}>
          <Input placeholder="Supplier Policies" />
        </Form.Item>
        <Form.Item name="description" label="Description">
          <Input.TextArea rows={3} placeholder="What this corpus is for" />
        </Form.Item>
      </Form>
    </Drawer>
  )
}
