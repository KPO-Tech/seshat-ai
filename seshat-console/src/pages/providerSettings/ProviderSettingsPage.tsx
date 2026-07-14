import { useEffect, useState } from 'react'
import { Button, Drawer, Empty, Form, Input, message, Popconfirm, Space, Tag, Typography } from 'antd'
import type { TableProps } from 'antd'
import { PlusOutlined, DeleteOutlined, EditOutlined, SettingOutlined } from '@ant-design/icons'
import { useProviderSettingsList,
  useCreateProviderSetting,
  useUpdateProviderSetting,
  useDeleteProviderSetting,
  type ProviderSetting,
  type ProviderSettingInput, } from '@/api/providerSettings'
import { getErrorMessage } from '@/api/errors'
import { PageHeader } from '@/components/PageHeader'
import { ConsoleTable } from '@/components/ConsoleTable'
import { useScopedOrganizationId } from '@/hooks/useOrganizationScope'
import { palette, monoStack } from '@/theme/tokens'
import { presentText } from '@/lib/present'

export function ProviderSettingsPage() { const organizationId = useScopedOrganizationId()
  const [editing, setEditing] = useState<ProviderSetting | 'new' | null>(null)

  const { data, isLoading } = useProviderSettingsList(organizationId ?? undefined)
  const createSetting = useCreateProviderSetting()
  const updateSetting = useUpdateProviderSetting()
  const deleteSetting = useDeleteProviderSetting()

  const columns: TableProps<ProviderSetting>['columns'] = [
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
            title={`Remove the ${record.provider} credential?`}
            description="Cloud jobs configured for this provider will fall back to this platform's default organization's credentials (if any) or start failing at execution time."
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
        title="Provider Settings"
        description="This organization's own LLM credentials. They override this platform's default organization's credentials when present."
        actions={ <Space>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setEditing('new')}
              disabled={!organizationId}
            >
              New credential
            </Button>
          </Space> }
      />

      <ConsoleTable<ProviderSetting>
          rowKey="id"
          columns={columns}
          dataSource={data ?? []}
          loading={isLoading}
          pagination={false}
          locale={{ emptyText: (
              <Empty
                image={<SettingOutlined style={{ fontSize: 32, color: palette.inkTertiary }} />}
                description="No provider credentials configured. Cloud jobs fall back to this platform's default organization's credentials."
                style={{ padding: '32px 0' }}
              />
            ), }}
        />

      <ProviderSettingFormDrawer
        setting={editing === 'new' ? null : editing}
        open={editing !== null}
        onClose={() => setEditing(null)}
        onSubmit={(values) => { if (!organizationId) return
          if (editing === 'new') { createSetting.mutate(
              { ...values, organization_id: organizationId },
              { onSuccess: () => setEditing(null), onError: (error) => message.error(getErrorMessage(error)) },
            ) } else if (editing) { const { provider: _provider, ...updateBody } = values
            updateSetting.mutate(
              { id: editing.id!, body: updateBody },
              { onSuccess: () => setEditing(null), onError: (error) => message.error(getErrorMessage(error)) },
            ) } }}
        submitting={createSetting.isPending || updateSetting.isPending}
      />
    </div>
  ) }

function ProviderSettingFormDrawer({ setting,
  open,
  onClose,
  onSubmit,
  submitting, }: { setting: ProviderSetting | null
  open: boolean
  onClose: () => void
  onSubmit: (values: Omit<ProviderSettingInput, 'organization_id'>) => void
  submitting: boolean }) { const [form] = Form.useForm<Omit<ProviderSettingInput, 'organization_id'>>()
  const isEdit = setting !== null

  useEffect(() => { if (open) form.setFieldsValue(setting ?? { provider: '', default_model: '' }) }, [open, setting, form])

  return (
    <Drawer
      title={isEdit ? `Edit ${setting.provider} credential` : 'New provider credential'}
      open={open}
      onClose={onClose}
      destroyOnHidden
      extra={ <Button type="primary" loading={submitting} onClick={() => form.submit()}>
          Save
        </Button> }
    >
      <Form form={form} layout="vertical" onFinish={onSubmit}>
        <Form.Item
          name="provider"
          label="Provider"
          rules={[{ required: true, message: 'Required' }]}
          extra={isEdit ? undefined : 'e.g. anthropic, openai, google, mistral'}
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
