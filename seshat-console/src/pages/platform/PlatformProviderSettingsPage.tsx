import { useEffect, useState } from 'react'
import { Alert, Button, Drawer, Empty, Form, Input, message, Popconfirm, Space, Tag, Typography } from 'antd'
import type { TableProps } from 'antd'
import { PlusOutlined, DeleteOutlined, EditOutlined, CloudServerOutlined } from '@ant-design/icons'
import { usePlatformProviderSettingsList,
  useCreatePlatformProviderSetting,
  useUpdatePlatformProviderSetting,
  useDeletePlatformProviderSetting,
  type PlatformProviderSetting,
  type PlatformProviderSettingInput, } from '@/api/platformProviderSettings'
import { getErrorMessage } from '@/api/errors'
import { PageHeader } from '@/components/PageHeader'
import { ConsoleTable } from '@/components/ConsoleTable'
import { palette, monoStack } from '@/theme/tokens'
import { presentText } from '@/lib/present'

export function PlatformProviderSettingsPage() { const [editing, setEditing] = useState<PlatformProviderSetting | 'new' | null>(null)
  const { data, isLoading } = usePlatformProviderSettingsList()
  const createSetting = useCreatePlatformProviderSetting()
  const updateSetting = useUpdatePlatformProviderSetting()
  const deleteSetting = useDeletePlatformProviderSetting()

  const columns: TableProps<PlatformProviderSetting>['columns'] = [
    { title: 'Provider',
      dataIndex: 'provider',
      key: 'provider',
      render: (provider: string) => (
        <Tag color="default" style={{ fontFamily: monoStack, margin: 0 }}>
          {provider}
        </Tag>
      ), },
    { title: 'Default model', dataIndex: 'default_model', key: 'default_model' },
    { title: 'Base URL', dataIndex: 'base_url', key: 'base_url', render: (v) => presentText(v, 'Provider default') },
    { title: '',
      key: 'actions',
      width: 96,
      render: (_, record) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => setEditing(record)} aria-label={`Edit ${record.provider}`} />
          <Popconfirm
            title={`Remove the platform default for ${record.provider}?`}
            description="Organizations relying on this fallback will start failing cloud runs for this provider until they configure their own key."
            onConfirm={() =>
              deleteSetting.mutate(record.id!, { onError: (error) => message.error(getErrorMessage(error)) }) }
          >
            <Button size="small" danger icon={<DeleteOutlined />} aria-label={`Delete ${record.provider}`} />
          </Popconfirm>
        </Space>
      ), },
  ]

  return (
    <div>
      <PageHeader
        title="Default Providers"
        description="Shared LLM credentials used when an organization has not configured its own provider yet."
        actions={ <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing('new')}>
            New default provider
          </Button> }
      />

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        title="How this fits together"
        description="An organization's own provider setting always wins. If it has none, cloud jobs fall back to the default configured here."
      />

      <ConsoleTable<PlatformProviderSetting>
        rowKey="id"
        columns={columns}
        dataSource={data ?? []}
        loading={isLoading}
        pagination={false}
        locale={{ emptyText: (
            <Empty
              image={<CloudServerOutlined style={{ fontSize: 32, color: palette.inkTertiary }} />}
              description="No platform default providers configured yet"
              style={{ padding: '32px 0' }}
            />
          ), }}
      />

      <PlatformProviderSettingFormDrawer
        setting={editing === 'new' ? null : editing}
        open={editing !== null}
        onClose={() => setEditing(null)}
        onSubmit={(values) => { if (editing === 'new') { createSetting.mutate(values, { onSuccess: () => setEditing(null),
              onError: (error) => message.error(getErrorMessage(error)), }) } else if (editing) { // provider is immutable - the update handler rejects it as an
            // unknown field, so it must not be forwarded even though the
            // (disabled) form field still carries its original value.
            const { provider: _provider, ...updateBody } = values
            updateSetting.mutate(
              { id: editing.id!, body: updateBody },
              { onSuccess: () => setEditing(null), onError: (error) => message.error(getErrorMessage(error)) },
            ) } }}
        submitting={createSetting.isPending || updateSetting.isPending}
      />
    </div>
  ) }

function PlatformProviderSettingFormDrawer({ setting,
  open,
  onClose,
  onSubmit,
  submitting, }: { setting: PlatformProviderSetting | null
  open: boolean
  onClose: () => void
  onSubmit: (values: PlatformProviderSettingInput) => void
  submitting: boolean }) { const [form] = Form.useForm<PlatformProviderSettingInput>()
  const isEdit = setting !== null

  // Reset as soon as the drawer is asked to open, not after its CSS
  // transition finishes (Drawer's afterOpenChange) - that gap is a real
  // race: on a slower render, a user could start typing before the
  // transition-end fires and have setFieldsValue silently wipe it back out.
  useEffect(() => { if (open) form.setFieldsValue(setting ?? { provider: '', default_model: '' }) }, [open, setting, form])

  return (
    <Drawer
      title={isEdit ? `Edit ${setting.provider} default` : 'New default provider'}
      open={open}
      onClose={onClose}
      destroyOnHidden
      extra={ <Button type="primary" loading={submitting} onClick={() => form.submit()}>
          Save
        </Button> }
    >
      <Form<PlatformProviderSettingInput> form={form} layout="vertical" onFinish={onSubmit}>
        <Form.Item
          name="provider"
          label="Provider"
          rules={[{ required: true, message: 'Required' }]}
          extra={isEdit ? undefined : 'e.g. anthropic, openai, google'}
        >
          <Input disabled={isEdit} placeholder="anthropic" />
        </Form.Item>
        <Form.Item name="default_model" label="Default model" rules={[{ required: true, message: 'Required' }]}>
          <Input placeholder="claude-sonnet-5" />
        </Form.Item>
        <Form.Item name="base_url" label="Base URL">
          <Input placeholder="Optional. Leave empty to use the provider's default" />
        </Form.Item>
        <Form.Item
          name="api_key"
          label="API key"
          rules={[{ required: !isEdit, message: 'Required' }]}
          extra={isEdit ? 'Leave empty to keep the current key unchanged.' : undefined}
        >
          <Input.Password autoComplete="off" placeholder={isEdit ? '••••••••' : undefined} />
        </Form.Item>
        {!isEdit && (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            The key is encrypted at rest and never shown again after saving.
          </Typography.Text>
        )}
      </Form>
    </Drawer>
  ) }
