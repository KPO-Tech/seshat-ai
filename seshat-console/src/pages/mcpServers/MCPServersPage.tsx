import { useEffect, useState } from 'react'
import { Alert, Button, Drawer, Empty, Form, Input, InputNumber, message, Popconfirm, Select, Space, Tag, Typography } from 'antd'
import type { TableProps } from 'antd'
import { ApiOutlined, DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons'
import {
  useMCPServerConfigsList,
  useCreateMCPServerConfig,
  useUpdateMCPServerConfig,
  useDeleteMCPServerConfig,
  type MCPServerConfig,
  type MCPServerConfigInput,
  type MCPServerConfigUpdateInput,
} from '@/api/mcpServerConfigs'
import { getErrorMessage } from '@/api/errors'
import { PageHeader } from '@/components/PageHeader'
import { ConsoleTable } from '@/components/ConsoleTable'
import { useScopedOrganizationId } from '@/hooks/useOrganizationScope'
import { monoStack, palette } from '@/theme/tokens'

// "sdk" is deliberately not offered here: it identifies an MCP tool built
// into the SDK's own binary (see seshat/internal/tools/system/mcp -
// McpServerType), which is inherently local to one installation, not
// something an org admin can share remotely. The transport type actually
// used when a connected seshat-backend resolves an org-shared config
// (seshat/pkg/mcp.TransportType) only defines stdio/http/sse/websocket -
// there's no matching "sdk" transport for it to dispatch on.
const SERVER_TYPE_OPTIONS = [
  { value: 'stdio', label: 'stdio' },
  { value: 'http', label: 'http' },
  { value: 'sse', label: 'sse' },
  { value: 'websocket', label: 'websocket' },
]

export function MCPServersPage() {
  const organizationId = useScopedOrganizationId()
  const [editing, setEditing] = useState<MCPServerConfig | 'new' | null>(null)
  const { data, isLoading, error } = useMCPServerConfigsList(organizationId ?? undefined)
  const createConfig = useCreateMCPServerConfig()
  const updateConfig = useUpdateMCPServerConfig()
  const deleteConfig = useDeleteMCPServerConfig()

  const columns: TableProps<MCPServerConfig>['columns'] = [
    {
      title: 'Server',
      key: 'name',
      render: (_, record) => (
        <div>
          <div style={{ fontWeight: 500 }}>{record.display_name || record.name}</div>
          <Typography.Text style={{ fontSize: 12, color: palette.inkTertiary, fontFamily: monoStack }}>
            {record.name}
          </Typography.Text>
        </div>
      ),
    },
    {
      title: 'Type',
      dataIndex: 'server_type',
      key: 'server_type',
      width: 120,
      render: (value: string | undefined) => <Tag>{value ?? 'unknown'}</Tag>,
    },
    {
      title: 'Target',
      key: 'target',
      render: (_, record) => (
        <Typography.Text style={{ fontSize: 12, color: palette.inkSecondary, fontFamily: monoStack }}>
          {record.server_type === 'stdio'
            ? [record.command, ...(record.args ?? [])].filter(Boolean).join(' ')
            : record.url || 'Not configured'}
        </Typography.Text>
      ),
    },
    {
      title: 'Timeout',
      dataIndex: 'timeout_secs',
      key: 'timeout_secs',
      width: 110,
      render: (value: number | undefined) => `${value ?? 30}s`,
    },
    {
      title: '',
      key: 'actions',
      width: 100,
      render: (_, record) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => setEditing(record)} aria-label={`Edit ${record.name}`} />
          <Popconfirm
            title={`Delete ${record.display_name || record.name}?`}
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
        title="MCP Servers"
        description="Organization-shared MCP server definitions. Secrets are encrypted at rest and never echoed back in list responses. Falls back to this platform's default organization's servers when this organization has none of its own."
        actions={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing('new')} disabled={!organizationId}>
            New MCP server
          </Button>
        }
      />

      <Alert
        showIcon
        type="info"
        style={{ marginBottom: 20 }}
        title="Connected backends resolve these configs locally"
        description={`Entries available to connected devices: ${data?.length ?? 0}. stdio servers still require explicit user approval on the desktop before they can run locally.`}
      />

      <ConsoleTable<MCPServerConfig>
        rowKey="id"
        columns={columns}
        dataSource={data ?? []}
        loading={isLoading}
        queryError={error}
        pagination={false}
        locale={{
          emptyText: (
            <Empty
              image={<ApiOutlined style={{ fontSize: 32, color: palette.inkTertiary }} />}
              description="No MCP servers configured yet"
              style={{ padding: '32px 0' }}
            />
          ),
        }}
      />

      <MCPServerFormDrawer
        config={editing === 'new' ? null : editing}
        organizationId={organizationId}
        open={editing !== null}
        onClose={() => setEditing(null)}
        onSubmit={(payload) => {
          if (!organizationId) return
          if (editing === 'new') {
            createConfig.mutate(
              { ...payload, organization_id: organizationId },
              {
                onSuccess: () => setEditing(null),
                onError: (error) => message.error(getErrorMessage(error)),
              },
            )
            return
          }
          if (!editing?.id) return
          updateConfig.mutate(
            { id: editing.id, body: payload },
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

function MCPServerFormDrawer({
  config,
  organizationId,
  open,
  onClose,
  onSubmit,
  submitting,
}: {
  config: MCPServerConfig | null
  organizationId: string | null
  open: boolean
  onClose: () => void
  onSubmit: (values: any) => void
  submitting: boolean
}) {
  const [form] = Form.useForm()
  const serverType = Form.useWatch('server_type', form) ?? config?.server_type ?? 'stdio'
  const isCreate = config === null

  useEffect(() => {
    if (!open) return
    form.setFieldsValue({
      name: config?.name ?? '',
      display_name: config?.display_name ?? '',
      server_type: config?.server_type ?? 'stdio',
      command: config?.command ?? '',
      args_text: (config?.args ?? []).join('\n'),
      url: config?.url ?? '',
      env_json: '',
      headers_json: '',
      timeout_secs: config?.timeout_secs ?? 30,
      icon: config?.icon ?? '',
    })
  }, [config, form, open])

  const isStdio = serverType === 'stdio'
  const isRemote = ['http', 'sse', 'websocket'].includes(serverType)

  return (
    <Drawer
      title={config ? `Edit ${config.display_name || config.name}` : 'New MCP server'}
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
          try {
            const payload = buildPayload(values, organizationId)
            onSubmit(isCreate ? payload.create : payload.update)
          } catch (error) {
            message.error(error instanceof Error ? error.message : 'Invalid MCP server payload')
          }
        }}
      >
        {config ? (
          <Form.Item label="Name">
            <Input value={config.name ?? ''} disabled />
          </Form.Item>
        ) : (
          <Form.Item
            name="name"
            label="Name"
            rules={[{ required: true, pattern: /^[a-z0-9-]+$/, message: 'Lowercase letters, digits, hyphens' }]}
          >
            <Input placeholder="internal-jira" />
          </Form.Item>
        )}
        <Form.Item name="display_name" label="Display name">
          <Input placeholder="Internal Jira" />
        </Form.Item>
        <Form.Item name="server_type" label="Server type" rules={[{ required: true, message: 'Required' }]}>
          <Select options={SERVER_TYPE_OPTIONS} />
        </Form.Item>
        {isStdio && (
          <>
            <Form.Item name="command" label="Command" rules={[{ required: true, message: 'Required for stdio servers' }]}>
              <Input placeholder="npx" />
            </Form.Item>
            <Form.Item name="args_text" label="Arguments" extra="One argument per line.">
              <Input.TextArea rows={4} placeholder="@modelcontextprotocol/server-filesystem\n/home/workspace" />
            </Form.Item>
            <Form.Item name="env_json" label="Environment variables" extra={config ? 'Leave empty to keep the stored values unchanged.' : 'JSON object, e.g. {"API_KEY":"..."}'}>
              <Input.TextArea rows={5} placeholder='{"API_KEY":"..."}' />
            </Form.Item>
          </>
        )}
        {isRemote && (
          <>
            <Form.Item name="url" label="URL" rules={[{ required: true, message: 'Required for remote servers' }]}>
              <Input placeholder="https://example.com/mcp" />
            </Form.Item>
            <Form.Item name="headers_json" label="Headers" extra={config ? 'Leave empty to keep the stored values unchanged.' : 'JSON object, e.g. {"Authorization":"Bearer ..."}'}>
              <Input.TextArea rows={5} placeholder='{"Authorization":"Bearer ..."}' />
            </Form.Item>
          </>
        )}
        <Form.Item name="timeout_secs" label="Timeout (seconds)">
          <InputNumber min={1} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="icon" label="Icon">
          <Input placeholder="Optional icon name or URL" />
        </Form.Item>
      </Form>
    </Drawer>
  )
}

function buildPayload(values: Record<string, unknown>, organizationId: string | null) {
  const args = parseStringList(values.args_text)
  const env = parseRecord(values.env_json, 'environment variables')
  const headers = parseRecord(values.headers_json, 'headers')

  const create: MCPServerConfigInput = {
    organization_id: organizationId ?? '',
    name: String(values.name ?? '').trim(),
    display_name: String(values.display_name ?? '').trim() || undefined,
    server_type: values.server_type as MCPServerConfigInput['server_type'],
    command: String(values.command ?? '').trim() || undefined,
    args,
    env,
    url: String(values.url ?? '').trim() || undefined,
    headers,
    timeout_secs: Number(values.timeout_secs ?? 30),
    icon: String(values.icon ?? '').trim() || undefined,
  }

  const update: MCPServerConfigUpdateInput = {
    display_name: String(values.display_name ?? '').trim() || undefined,
    server_type: values.server_type as MCPServerConfigUpdateInput['server_type'],
    command: String(values.command ?? '').trim() || undefined,
    args,
    env,
    url: String(values.url ?? '').trim() || undefined,
    headers,
    timeout_secs: Number(values.timeout_secs ?? 30),
    icon: String(values.icon ?? '').trim() || undefined,
  }

  return { create, update }
}

function parseStringList(value: unknown): string[] | undefined {
  const raw = String(value ?? '').trim()
  if (!raw) return undefined
  return raw
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function parseRecord(value: unknown, label: string): Record<string, string> | undefined {
  const raw = String(value ?? '').trim()
  if (!raw) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error(`Invalid ${label} JSON`)
  }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error(`${label} must be a JSON object`)
  }
  return Object.fromEntries(
    Object.entries(parsed as Record<string, unknown>).map(([key, entry]) => [key, String(entry)]),
  )
}
