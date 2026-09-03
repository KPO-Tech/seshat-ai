import { useEffect, useState } from 'react'
import { Alert, Button, Drawer, Empty, Form, Input, InputNumber, message, Popconfirm, Space, Switch, Tag, Typography } from 'antd'
import type { TableProps } from 'antd'
import { CodeOutlined, DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons'
import {
  useHookConfigsList,
  useCreateHookConfig,
  useUpdateHookConfig,
  useDeleteHookConfig,
  type HookConfig,
  type HookConfigInput,
  type HookConfigUpdateInput,
} from '@/api/hookConfigs'
import { getErrorMessage } from '@/api/errors'
import { useBundleProvenance } from '@/api/bundles'
import { PageHeader } from '@/components/PageHeader'
import { ConsoleTable } from '@/components/ConsoleTable'
import { ProvenanceTag } from '@/components/ProvenanceTag'
import { useScopedOrganizationId } from '@/hooks/useOrganizationScope'
import { monoStack, palette } from '@/theme/tokens'

export function HooksPage() {
  const organizationId = useScopedOrganizationId()
  const [editing, setEditing] = useState<HookConfig | 'new' | null>(null)
  const { data, isLoading, error } = useHookConfigsList(organizationId ?? undefined)
  const createConfig = useCreateHookConfig()
  const updateConfig = useUpdateHookConfig()
  const deleteConfig = useDeleteHookConfig()
  const provenance = useBundleProvenance(
    organizationId ?? undefined,
    'hook_config',
    (data ?? []).map((r) => r.id!).filter(Boolean),
  )

  const columns: TableProps<HookConfig>['columns'] = [
    {
      title: 'Name',
      key: 'name',
      render: (_, record) => (
        <Space size={6}>
          <span style={{ fontWeight: 500 }}>{record.name}</span>
          {!record.enabled && <Tag>Disabled</Tag>}
        </Space>
      ),
    },
    {
      title: 'Matcher',
      dataIndex: 'matcher',
      key: 'matcher',
      width: 160,
      render: (value: string | undefined) => (
        <Typography.Text style={{ fontSize: 12, fontFamily: monoStack }}>{value || 'all tools'}</Typography.Text>
      ),
    },
    {
      title: 'Command',
      dataIndex: 'command',
      key: 'command',
      render: (value: string | undefined) => (
        <Typography.Text style={{ fontSize: 12, color: palette.inkSecondary, fontFamily: monoStack }} ellipsis>
          {value}
        </Typography.Text>
      ),
    },
    {
      title: 'Timeout',
      dataIndex: 'timeout_secs',
      key: 'timeout_secs',
      width: 100,
      render: (value: number | undefined) => `${value ?? 30}s`,
    },
    {
      title: 'Provenance',
      key: 'provenance',
      width: 160,
      render: (_, record) => (
        <ProvenanceTag createdByUserId={record.created_by_user_id} provenance={record.id ? provenance.data?.[record.id] : undefined} />
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 100,
      render: (_, record) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => setEditing(record)} aria-label={`Edit ${record.name}`} />
          <Popconfirm
            title={`Delete ${record.name}?`}
            onConfirm={() =>
              deleteConfig.mutate(record.id!, {
                onError: (error) => message.error(getErrorMessage(error)),
              })
            }
          >
            <Button size="small" danger icon={<DeleteOutlined />} aria-label={`Delete ${record.name}`} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        description="Shell commands that run before matching tool calls on a connected desktop device. Desktop-only - never executed by the shared server."
        actions={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing('new')} disabled={!organizationId}>
            New hook
          </Button>
        }
      />

      <Alert
        showIcon
        type="warning"
        style={{ marginBottom: 20 }}
        message="Requires explicit local approval on each device"
        description="A hook defined here never runs automatically - the person using each connected device must approve it themselves before it executes anything, exactly like an org-shared MCP server."
      />

      <ConsoleTable<HookConfig>
        rowKey="id"
        columns={columns}
        dataSource={data ?? []}
        loading={isLoading}
        queryError={error}
        pagination={false}
        locale={{
          emptyText: (
            <Empty
              image={<CodeOutlined style={{ fontSize: 32, color: palette.inkTertiary }} />}
              description="No hooks configured yet"
              style={{ padding: '32px 0' }}
            />
          ),
        }}
      />

      <HookFormDrawer
        config={editing === 'new' ? null : editing}
        organizationId={organizationId}
        open={editing !== null}
        onClose={() => setEditing(null)}
        onSubmit={(payload) => {
          if (!organizationId) return
          if (editing === 'new') {
            createConfig.mutate(
              { ...(payload as HookConfigInput), organization_id: organizationId },
              {
                onSuccess: () => setEditing(null),
                onError: (error) => message.error(getErrorMessage(error)),
              },
            )
            return
          }
          if (!editing?.id) return
          updateConfig.mutate(
            { id: editing.id, body: payload as HookConfigUpdateInput },
            {
              onSuccess: () => setEditing(null),
              onError: (error) => message.error(getErrorMessage(error)),
            },
          )
        }}
        submitting={createConfig.isPending || updateConfig.isPending}
      />
    </div>
  )
}

function HookFormDrawer({
  config,
  organizationId,
  open,
  onClose,
  onSubmit,
  submitting,
}: {
  config: HookConfig | null
  organizationId: string | null
  open: boolean
  onClose: () => void
  onSubmit: (values: HookConfigInput | HookConfigUpdateInput) => void
  submitting: boolean
}) {
  const [form] = Form.useForm()
  const isCreate = config === null

  useEffect(() => {
    if (!open) return
    form.setFieldsValue({
      name: config?.name ?? '',
      matcher: config?.matcher ?? '',
      command: config?.command ?? '',
      timeout_secs: config?.timeout_secs ?? 30,
      enabled: config?.enabled ?? true,
    })
  }, [config, form, open])

  return (
    <Drawer
      title={config ? `Edit ${config.name}` : 'New hook'}
      open={open}
      onClose={onClose}
      destroyOnHidden
      size={520}
      extra={
        <Button type="primary" loading={submitting} onClick={() => form.submit()}>
          Save
        </Button>
      }
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={(values) => {
          const base = {
            matcher: String(values.matcher ?? '').trim() || undefined,
            command: String(values.command ?? '').trim(),
            timeout_secs: Number(values.timeout_secs ?? 30),
            enabled: Boolean(values.enabled),
          }
          onSubmit(isCreate ? { ...base, organization_id: organizationId ?? '', name: String(values.name ?? '').trim() } : base)
        }}
      >
        {config ? (
          <Form.Item label="Name">
            <Input value={config.name ?? ''} disabled />
          </Form.Item>
        ) : (
          <Form.Item name="name" label="Name" rules={[{ required: true, message: 'Required' }]}>
            <Input placeholder="block-rm" />
          </Form.Item>
        )}
        <Form.Item name="matcher" label="Matcher" extra="Regex against the tool name. Leave empty to match every tool.">
          <Input placeholder="bash" />
        </Form.Item>
        <Form.Item name="command" label="Command" rules={[{ required: true, message: 'Required' }]} extra="Shell command - exit 0 allows, exit 2 denies, exit 49 halts the turn.">
          <Input.TextArea rows={4} placeholder='[[ "$SESHAT_TOOL_INPUT" != *"rm -rf"* ]] || exit 2' />
        </Form.Item>
        <Form.Item name="timeout_secs" label="Timeout (seconds)">
          <InputNumber min={1} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="enabled" label="Enabled" valuePropName="checked" extra="A disabled hook is not offered for approval on any device at all.">
          <Switch />
        </Form.Item>
      </Form>
    </Drawer>
  )
}
