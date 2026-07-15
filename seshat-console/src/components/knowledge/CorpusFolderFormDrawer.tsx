import { useEffect } from 'react'
import { Button, Drawer, Form, Input } from 'antd'
import type { CorpusFolder, CorpusFolderInput } from '@/api/knowledge'

// Shared between CorporaPage ("New folder") and FolderDetailPage ("Rename
// folder") - create and edit are the same form, just with/without existing
// values pre-filled.
export function CorpusFolderFormDrawer({
  folder,
  open,
  onClose,
  onSubmit,
  submitting,
}: {
  folder: CorpusFolder | null
  open: boolean
  onClose: () => void
  onSubmit: (values: Omit<CorpusFolderInput, 'organization_id'>) => void
  submitting: boolean
}) {
  const [form] = Form.useForm<CorpusFolderInput>()

  useEffect(() => {
    if (open) {
      form.setFieldsValue({
        name: folder?.name ?? '',
        description: folder?.description ?? '',
        icon: folder?.icon ?? '📁',
      })
    }
  }, [open, folder, form])

  return (
    <Drawer
      title={folder ? `Edit ${folder.name}` : 'New folder'}
      open={open}
      onClose={onClose}
      destroyOnHidden
      extra={
        <Button type="primary" loading={submitting} onClick={() => form.submit()}>
          Save
        </Button>
      }
    >
      <Form<CorpusFolderInput> form={form} layout="vertical" onFinish={onSubmit}>
        <Form.Item name="name" label="Name" rules={[{ required: true, message: 'Required' }]}>
          <Input placeholder="Legal & Compliance" />
        </Form.Item>
        <Form.Item name="description" label="Description">
          <Input.TextArea rows={3} placeholder="What kind of corpora go in this folder" />
        </Form.Item>
        <Form.Item name="icon" label="Icon" extra="A single emoji shown on the folder card.">
          <Input placeholder="📁" maxLength={4} style={{ width: 100 }} />
        </Form.Item>
      </Form>
    </Drawer>
  )
}
