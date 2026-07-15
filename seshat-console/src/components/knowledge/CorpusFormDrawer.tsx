import { useEffect } from 'react'
import { Button, Drawer, Form, Input, Select } from 'antd'
import type { Corpus, CorpusFolder, CorpusInput } from '@/api/knowledge'

// Shared between CorporaPage ("New corpus", no folder preselected),
// FolderDetailPage ("New corpus" inside this folder), and CorpusDetailPage
// ("Edit" an existing corpus - name/description/folder, the caller decides
// whether to call create or update based on whether corpus is set).
export function CorpusFormDrawer({
  corpus = null,
  open,
  onClose,
  onSubmit,
  submitting,
  folders,
  defaultFolderId,
}: {
  corpus?: Corpus | null
  open: boolean
  onClose: () => void
  onSubmit: (values: Omit<CorpusInput, 'organization_id'>) => void
  submitting: boolean
  folders: CorpusFolder[]
  defaultFolderId?: string
}) {
  const [form] = Form.useForm<CorpusInput>()

  useEffect(() => {
    if (open) {
      form.setFieldsValue({
        name: corpus?.name ?? '',
        description: corpus?.description ?? '',
        folder_id: corpus?.folder_id ?? defaultFolderId ?? '',
      })
    }
  }, [open, form, corpus, defaultFolderId])

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
        <Form.Item name="folder_id" label="Folder" extra="Optional - leave unset to keep this corpus unfiled.">
          <Select
            allowClear
            placeholder="No folder"
            options={folders.map((folder) => ({ value: folder.id, label: `${folder.icon} ${folder.name}` }))}
          />
        </Form.Item>
      </Form>
    </Drawer>
  )
}
