import { useEffect, useMemo, useState } from 'react'
import { Button, Drawer, Empty, Form, Input, InputNumber, message, Popconfirm, Select, Space, Switch, Tag, Typography } from 'antd'
import type { TableProps } from 'antd'
import { DeleteOutlined, EditOutlined, PlusOutlined, RobotOutlined } from '@ant-design/icons'
import {
  useAgentPresetsList,
  useCreateAgentPreset,
  useUpdateAgentPreset,
  useDeleteAgentPreset,
  type AgentPreset,
} from '@/api/agentPresets'
import { useMCPServerConfigsList } from '@/api/mcpServerConfigs'
import { getErrorMessage } from '@/api/errors'
import { useBundleProvenance } from '@/api/bundles'
import { PageHeader } from '@/components/PageHeader'
import { ConsoleTable } from '@/components/ConsoleTable'
import { ProvenanceTag } from '@/components/ProvenanceTag'
import { useScopedOrganizationId } from '@/hooks/useOrganizationScope'
import { isolationModeOptions, permissionModeOptions } from '@/lib/runtimeOptions'
import { monoStack, palette } from '@/theme/tokens'

export function AgentPresetsPage() {
  const organizationId = useScopedOrganizationId()
  const [editing, setEditing] = useState<AgentPreset | 'new' | null>(null)
  const { data, isLoading, error } = useAgentPresetsList(organizationId ?? undefined)
  const createPreset = useCreateAgentPreset()
  const updatePreset = useUpdateAgentPreset()
  const deletePreset = useDeleteAgentPreset()
  const provenance = useBundleProvenance(
    organizationId ?? undefined,
    'agent_preset',
    (data ?? []).map((r) => r.id!).filter(Boolean),
  )

  const columns: TableProps<AgentPreset>['columns'] = [
    {
      title: 'Preset',
      key: 'slug',
      render: (_, record) => (
        <div>
          <div style={{ fontWeight: 500 }}>{record.name || record.slug}</div>
          <Typography.Text style={{ fontSize: 12, color: palette.inkTertiary, fontFamily: monoStack }}>
            {record.slug}
          </Typography.Text>
        </div>
      ),
    },
    {
      title: 'Model',
      dataIndex: 'model',
      key: 'model',
      render: (value: string | undefined) => value || <Typography.Text type="secondary">Default</Typography.Text>,
    },
    {
      title: 'Mode',
      key: 'mode',
      width: 200,
      render: (_, record) => (
        <Space wrap>
          <Tag>{record.permission_mode || 'default'}</Tag>
          <Tag>{record.isolation || 'default'}</Tag>
        </Space>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'enabled',
      key: 'enabled',
      width: 110,
      render: (value: boolean | undefined) => (value === false ? <Tag>Disabled</Tag> : <Tag color="green">Enabled</Tag>),
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
          <Button size="small" icon={<EditOutlined />} onClick={() => setEditing(record)} aria-label={`Edit ${record.slug}`} />
          <Popconfirm
            title={`Delete ${record.name || record.slug}?`}
            onConfirm={() =>
              deletePreset.mutate(record.id!, {
                onError: (error) => message.error(getErrorMessage(error)),
              })
            }
          >
            <Button size="small" danger icon={<DeleteOutlined />} aria-label={`Delete ${record.slug}`} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        actions={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing('new')} disabled={!organizationId}>
            New preset
          </Button>
        }
      />

      <ConsoleTable<AgentPreset>
        rowKey="id"
        columns={columns}
        dataSource={data ?? []}
        loading={isLoading}
        queryError={error}
        pagination={false}
        locale={{
          emptyText: (
            <Empty
              image={<RobotOutlined style={{ fontSize: 32, color: palette.inkTertiary }} />}
              description="No agent presets yet"
              style={{ padding: '32px 0' }}
            />
          ),
        }}
      />

      <AgentPresetFormDrawer
        preset={editing === 'new' ? null : editing}
        organizationId={organizationId}
        open={editing !== null}
        onClose={() => setEditing(null)}
        onSubmit={(values) => {
          if (!organizationId) return
          if (editing === 'new') {
            createPreset.mutate(
              { ...values, organization_id: organizationId },
              {
                onSuccess: () => setEditing(null),
                onError: (error) => message.error(getErrorMessage(error)),
              },
            )
            return
          }
          if (!editing?.id) return
          updatePreset.mutate(
            { id: editing.id, body: values },
            {
              onSuccess: () => setEditing(null),
              onError: (error) => message.error(getErrorMessage(error)),
            },
          )
        }}
        submitting={createPreset.isPending || updatePreset.isPending}
      />
    </div>
  )
}

function AgentPresetFormDrawer({
  preset,
  organizationId,
  open,
  onClose,
  onSubmit,
  submitting,
}: {
  preset: AgentPreset | null
  organizationId: string | null
  open: boolean
  onClose: () => void
  onSubmit: (values: any) => void
  submitting: boolean
}) {
  const [form] = Form.useForm()
  const { data: mcpConfigs } = useMCPServerConfigsList(organizationId ?? undefined)
  const mcpOptions = useMemo(
    () => (mcpConfigs ?? []).map((config) => ({ value: config.name!, label: config.display_name || config.name! })),
    [mcpConfigs],
  )

  useEffect(() => {
    if (!open) return
    form.setFieldsValue({
      slug: preset?.slug ?? '',
      name: preset?.name ?? '',
      when_to_use: preset?.when_to_use ?? '',
      system_prompt: preset?.system_prompt ?? '',
      model: preset?.model ?? '',
      tools: preset?.tools ?? [],
      disallowed_tools: preset?.disallowed_tools ?? [],
      max_turns: preset?.max_turns ?? undefined,
      permission_mode: preset?.permission_mode ?? '',
      isolation: preset?.isolation ?? '',
      mcp_servers: preset?.mcp_servers ?? [],
      icon: preset?.icon ?? '',
      enabled: preset?.enabled !== false,
    })
  }, [form, open, preset])

  return (
    <Drawer
      title={preset ? `Edit ${preset.name || preset.slug}` : 'New agent preset'}
      open={open}
      onClose={onClose}
      destroyOnHidden
      size={560}
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
          const payload = {
            ...(preset ? {} : { organization_id: organizationId ?? '' }),
            ...(preset ? {} : { slug: String(values.slug ?? '').trim() }),
            name: String(values.name ?? '').trim() || undefined,
            when_to_use: String(values.when_to_use ?? '').trim() || undefined,
            system_prompt: String(values.system_prompt ?? '').trim() || undefined,
            model: String(values.model ?? '').trim() || undefined,
            tools: cleanStringArray(values.tools),
            disallowed_tools: cleanStringArray(values.disallowed_tools),
            max_turns: values.max_turns === undefined || values.max_turns === null ? undefined : Number(values.max_turns),
            permission_mode: String(values.permission_mode ?? '').trim() || undefined,
            isolation: String(values.isolation ?? '').trim() || undefined,
            mcp_servers: cleanStringArray(values.mcp_servers),
            icon: String(values.icon ?? '').trim() || undefined,
            enabled: Boolean(values.enabled),
          }
          onSubmit(payload)
        }}
      >
        {!preset && (
          <Form.Item name="slug" label="Slug" rules={[{ required: true, pattern: /^[a-z0-9-]+$/, message: 'Lowercase letters, digits, hyphens' }]}>
            <Input placeholder="researcher" />
          </Form.Item>
        )}
        <Form.Item name="name" label="Name">
          <Input placeholder="Researcher" />
        </Form.Item>
        <Form.Item name="when_to_use" label="When to use">
          <Input.TextArea rows={2} placeholder="For long-form research and synthesis tasks." />
        </Form.Item>
        <Form.Item name="system_prompt" label="System prompt">
          <Input.TextArea rows={6} />
        </Form.Item>
        <Form.Item name="model" label="Model">
          <Input placeholder="anthropic:claude-sonnet-5" />
        </Form.Item>
        <Form.Item name="tools" label="Allowed tools">
          <Select mode="tags" open={false} placeholder="bash, write, web_search, ..." />
        </Form.Item>
        <Form.Item name="disallowed_tools" label="Disallowed tools">
          <Select mode="tags" open={false} placeholder="git, edit, ..." />
        </Form.Item>
        <Form.Item name="mcp_servers" label="MCP servers">
          <Select mode="multiple" allowClear options={mcpOptions} placeholder="Optional org-shared MCP servers" />
        </Form.Item>
        <Form.Item name="max_turns" label="Max turns">
          <InputNumber min={1} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="permission_mode" label="Permission mode">
          <Select allowClear options={permissionModeOptions.filter((option) => option.value)} />
        </Form.Item>
        <Form.Item name="isolation" label="Isolation">
          <Select allowClear options={isolationModeOptions.filter((option) => option.value)} />
        </Form.Item>
        <Form.Item name="icon" label="Icon">
          <Input placeholder="Optional icon name or URL" />
        </Form.Item>
        <Form.Item name="enabled" label="Enabled" valuePropName="checked">
          <Switch />
        </Form.Item>
      </Form>
    </Drawer>
  )
}

function cleanStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const cleaned = value.map((entry) => String(entry).trim()).filter(Boolean)
  return cleaned.length > 0 ? cleaned : undefined
}
