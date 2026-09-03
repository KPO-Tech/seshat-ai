import { useEffect, useState } from 'react'
import { Button, Drawer, Empty, Form, Input, InputNumber, message, Popconfirm, Select, Space, Tag, Typography } from 'antd'
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
import { useBundleProvenance } from '@/api/bundles'
import { PageHeader } from '@/components/PageHeader'
import { ConsoleTable } from '@/components/ConsoleTable'
import { ProvenanceTag } from '@/components/ProvenanceTag'
import { useScopedOrganizationId } from '@/hooks/useOrganizationScope'
import { monoStack, palette } from '@/theme/tokens'
import { SmartAddMCPServerDrawer } from './SmartAddMCPServerDrawer'

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

// See sdb.MCPServerConfig.ConnectorKind's doc comment - when set, resolving
// this server injects a per-caller Authorization: Bearer header from that
// person's own connected agent_action account (Workspace → Connections).
// The kinds below (past teams/gmail) all have a genuine official, remote MCP
// server from the vendor itself - researched live and recorded in
// helps/roadmap.md's "MCP Server Ledger" entry, not guessed. Most
// personalize via OAuth (mcpregistry's injectConnectorToken →
// connectors.Service.AccessTokenForUser); Stripe/Trello/Airtable
// personalize via a static API key the employee pastes once instead
// (StaticSecretForUser) - their vendor's own MCP server takes a Bearer key
// directly, no OAuth redirect needed. Both paths are tried automatically at
// resolve time, so the picker below doesn't need to say which is which.
// Kinds whose vendor has no such server at all (Zendesk, Telegram, Discord,
// SendGrid, Mailgun, Postmark) are deliberately not listed here - the
// dataflow nodes built earlier in this initiative remain the only
// integration path for those.
const CONNECTOR_KIND_OPTIONS = [
  { value: '', label: 'None (static config only)' },
  { value: 'gdrive', label: 'Google Drive' },
  { value: 'sharepoint', label: 'SharePoint' },
  { value: 'slack', label: 'Slack' },
  { value: 'outlook', label: 'Outlook' },
  { value: 'teams', label: 'Microsoft Teams' },
  { value: 'gmail', label: 'Gmail' },
  { value: 'notion', label: 'Notion' },
  { value: 'github', label: 'GitHub' },
  { value: 'linear', label: 'Linear' },
  { value: 'hubspot', label: 'HubSpot' },
  { value: 'jira', label: 'Jira (Atlassian Rovo)' },
  { value: 'confluence', label: 'Confluence (Atlassian Rovo)' },
  { value: 'asana', label: 'Asana' },
  { value: 'intercom', label: 'Intercom' },
  { value: 'pipedrive', label: 'Pipedrive' },
  { value: 'salesforce', label: 'Salesforce' },
  { value: 'stripe', label: 'Stripe' },
  { value: 'trello', label: 'Trello' },
  { value: 'airtable', label: 'Airtable' },
]

// outlook/teams/gmail are self-hosted by this seshat-server itself (see
// internal/server/msgraphmcp, internal/server/gmailmcp) rather than a
// third-party service like Slack's public https://mcp.slack.com/mcp - an
// admin has no way to already know this URL, so picking one of these kinds
// pre-fills (not force-locks) the url/server_type fields below.
const SELF_HOSTED_MCP_PATH: Partial<Record<string, string>> = {
  outlook: '/internal/mcp/outlook',
  teams: '/internal/mcp/teams',
  gmail: '/internal/mcp/gmail',
}

// Vendor-hosted remote MCP endpoints for the kinds above - same pre-fill
// convenience as SELF_HOSTED_MCP_PATH, but an absolute external URL rather
// than a path on this server's own origin. Every URL here was confirmed
// directly against the vendor's own docs (not guessed from a naming
// convention) - see helps/roadmap.md. Salesforce has no fixed URL - its
// Hosted MCP Server is provisioned per org via an External Client App, so
// it's deliberately left out of this map; the admin pastes their own.
// Pipedrive's URL (mcp.pipedrive.ai, not .com) was confirmed from a single
// source - worth a quick re-check against Pipedrive's own docs if it ever
// stops resolving.
const VENDOR_HOSTED_MCP_URL: Partial<Record<string, string>> = {
  slack: 'https://mcp.slack.com/mcp',
  notion: 'https://mcp.notion.com/mcp',
  github: 'https://api.githubcopilot.com/mcp/',
  linear: 'https://mcp.linear.app/mcp',
  hubspot: 'https://mcp.hubspot.com',
  jira: 'https://mcp.atlassian.com/v2/mcp',
  confluence: 'https://mcp.atlassian.com/v2/mcp',
  asana: 'https://mcp.asana.com/v2/mcp',
  intercom: 'https://mcp.intercom.com/mcp',
  pipedrive: 'https://mcp.pipedrive.ai/mcp',
  stripe: 'https://mcp.stripe.com',
  trello: 'https://mcp.trello.com/v1',
  airtable: 'https://mcp.airtable.com/mcp',
}

export function MCPServersPage() {
  const organizationId = useScopedOrganizationId()
  const [editing, setEditing] = useState<MCPServerConfig | 'new' | null>(null)
  // Smart-Add (see docs/helps/audit-2026-08-29-openwork-den-comparison.md
  // § 8) is the default "New MCP server" entry point - the manual drawer
  // (editing='new') is still reachable via its own "switch to manual setup"
  // link, kept as a separate piece of state since the two drawers are
  // mutually exclusive but neither is a subset of the other's fields.
  const [smartAddOpen, setSmartAddOpen] = useState(false)
  const { data, isLoading, error } = useMCPServerConfigsList(organizationId ?? undefined)
  const createConfig = useCreateMCPServerConfig()
  const updateConfig = useUpdateMCPServerConfig()
  const deleteConfig = useDeleteMCPServerConfig()
  const provenance = useBundleProvenance(
    organizationId ?? undefined,
    'mcp_server_config',
    (data ?? []).map((r) => r.id!).filter(Boolean),
  )

  const columns: TableProps<MCPServerConfig>['columns'] = [
    {
      title: 'Server',
      key: 'name',
      render: (_, record) => (
        <div>
          <Space size={6}>
            <span style={{ fontWeight: 500 }}>{record.display_name || record.name}</span>
            {record.connector_kind && <Tag color="blue">🔗 {record.connector_kind}</Tag>}
          </Space>
          <div>
            <Typography.Text style={{ fontSize: 12, color: palette.inkTertiary, fontFamily: monoStack }}>
              {record.name}
            </Typography.Text>
          </div>
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
        actions={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setSmartAddOpen(true)} disabled={!organizationId}>
            New MCP server
          </Button>
        }
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

      <SmartAddMCPServerDrawer
        organizationId={organizationId}
        open={smartAddOpen}
        onClose={() => setSmartAddOpen(false)}
        onSwitchToManual={() => {
          setSmartAddOpen(false)
          setEditing('new')
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
      connector_kind: config?.connector_kind ?? '',
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
        <Form.Item
          name="connector_kind"
          label="Bridged account"
          extra="When set, each member's own connected account (Workspace → Connections) is injected as a Bearer header when this server resolves - lets an agent action run under that person's own permissions."
        >
          <Select
            options={CONNECTOR_KIND_OPTIONS}
            onChange={(value: string) => {
              if (form.getFieldValue('url')) return
              const selfHostedPath = SELF_HOSTED_MCP_PATH[value]
              if (selfHostedPath) {
                form.setFieldsValue({ url: window.location.origin + selfHostedPath, server_type: 'http' })
                return
              }
              const vendorURL = VENDOR_HOSTED_MCP_URL[value]
              if (vendorURL) {
                form.setFieldsValue({ url: vendorURL, server_type: 'http' })
              }
            }}
          />
        </Form.Item>
      </Form>
    </Drawer>
  )
}

function buildPayload(values: Record<string, unknown>, organizationId: string | null) {
  const args = parseStringList(values.args_text)
  const env = parseRecord(values.env_json, 'environment variables')
  const headers = parseRecord(values.headers_json, 'headers')

  const connectorKind = String(values.connector_kind ?? '').trim() as MCPServerConfigInput['connector_kind']

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
    connector_kind: connectorKind,
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
    connector_kind: connectorKind,
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
