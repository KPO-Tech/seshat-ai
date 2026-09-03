import { useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Collapse,
  Empty,
  Form,
  Input,
  List,
  Space,
  Tabs,
  Tag,
  Typography,
  Upload,
  message,
} from 'antd'
import type { TableProps, UploadProps } from 'antd'
import { CheckCircleFilled, CloseCircleFilled, DownloadOutlined, GiftOutlined, InboxOutlined, UploadOutlined } from '@ant-design/icons'
import { useExportBundle, useImportBundle, type BundleManifest } from '@/api/bundles'
import { useMCPServerConfigsList, type MCPServerConfig } from '@/api/mcpServerConfigs'
import { useHookConfigsList, type HookConfig } from '@/api/hookConfigs'
import { useSkillReposList, type SkillRepo } from '@/api/skillRepos'
import { useAgentPresetsList, type AgentPreset } from '@/api/agentPresets'
import { getErrorMessage } from '@/api/errors'
import { PageHeader } from '@/components/PageHeader'
import { ConsoleTable } from '@/components/ConsoleTable'
import { useScopedOrganizationId } from '@/hooks/useOrganizationScope'
import { palette } from '@/theme/tokens'

// BundlesPage — Etape B4 of
// docs/helps/audit-2026-08-29-openwork-den-comparison.md § 7 sous-chantier B.
// Export: pick rows across the four existing registries and download the
// resulting manifest as a file. Import: upload that file back, preview it,
// then confirm — the actual scenario a portable bundle exists for is moving
// config between organizations, so both halves live on one page rather than
// bolted onto each of the four registry pages.
export function BundlesPage() {
  return (
    <div>
      <PageHeader
        description="Package a selection of MCP servers, hooks, skills, and agent presets into one portable manifest file, or import a manifest someone shared with you."
      />
      <Tabs
        defaultActiveKey="export"
        items={[
          { key: 'export', label: 'Export', children: <ExportTab /> },
          { key: 'import', label: 'Import', children: <ImportTab /> },
        ]}
      />
    </div>
  )
}

function downloadJSON(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

function ExportTab() {
  const organizationId = useScopedOrganizationId()
  const [form] = Form.useForm()
  const [mcpIds, setMcpIds] = useState<string[]>([])
  const [hookIds, setHookIds] = useState<string[]>([])
  const [skillIds, setSkillIds] = useState<string[]>([])
  const [agentPresetIds, setAgentPresetIds] = useState<string[]>([])

  const mcpList = useMCPServerConfigsList(organizationId ?? undefined)
  const hookList = useHookConfigsList(organizationId ?? undefined)
  const skillList = useSkillReposList(organizationId ?? undefined)
  const agentPresetList = useAgentPresetsList(organizationId ?? undefined)

  const exportBundle = useExportBundle()

  const totalSelected = mcpIds.length + hookIds.length + skillIds.length + agentPresetIds.length

  const mcpColumns: TableProps<MCPServerConfig>['columns'] = [
    { title: 'Name', key: 'name', render: (_, r) => r.display_name || r.name },
    { title: 'Type', dataIndex: 'server_type', key: 'server_type' },
  ]
  const hookColumns: TableProps<HookConfig>['columns'] = [
    { title: 'Name', dataIndex: 'name', key: 'name' },
    { title: 'Matcher', dataIndex: 'matcher', key: 'matcher', render: (v: string | undefined) => v || 'any tool' },
  ]
  const skillColumns: TableProps<SkillRepo>['columns'] = [
    { title: 'Name', dataIndex: 'name', key: 'name' },
    { title: 'URL', dataIndex: 'url', key: 'url' },
  ]
  const agentPresetColumns: TableProps<AgentPreset>['columns'] = [
    { title: 'Slug', dataIndex: 'slug', key: 'slug' },
    { title: 'Name', dataIndex: 'name', key: 'name' },
  ]

  function handleExport() {
    form.validateFields().then((values) => {
      if (!organizationId) return
      if (totalSelected === 0) {
        message.warning('Select at least one item to export')
        return
      }
      exportBundle.mutate(
        {
          organization_id: organizationId,
          name: values.name,
          description: values.description || undefined,
          mcp_server_ids: mcpIds,
          hook_config_ids: hookIds,
          skill_repo_ids: skillIds,
          agent_preset_ids: agentPresetIds,
        },
        {
          onSuccess: (manifest) => {
            downloadJSON(`${values.name}.seshatbundle.json`, manifest)
            message.success('Bundle exported')
          },
          onError: (error) => message.error(getErrorMessage(error)),
        },
      )
    })
  }

  return (
    <div>
      <Form form={form} layout="vertical" style={{ maxWidth: 480, marginBottom: 16 }}>
        <Form.Item name="name" label="Bundle name" rules={[{ required: true, message: 'Required' }]}>
          <Input placeholder="Jira Integration" />
        </Form.Item>
        <Form.Item name="description" label="Description">
          <Input.TextArea rows={2} placeholder="Optional" />
        </Form.Item>
      </Form>

      <Collapse
        defaultActiveKey={['mcp', 'hooks', 'skills', 'agent-presets']}
        items={[
          {
            key: 'mcp',
            label: `MCP servers (${mcpIds.length} selected)`,
            children: (
              <ConsoleTable<MCPServerConfig>
                rowKey="id"
                size="small"
                pagination={false}
                columns={mcpColumns}
                dataSource={mcpList.data ?? []}
                loading={mcpList.isLoading}
                queryError={mcpList.error}
                rowSelection={{ selectedRowKeys: mcpIds, onChange: (keys) => setMcpIds(keys as string[]) }}
                locale={{ emptyText: <Empty description="No MCP servers" /> }}
              />
            ),
          },
          {
            key: 'hooks',
            label: `Hooks (${hookIds.length} selected)`,
            children: (
              <ConsoleTable<HookConfig>
                rowKey="id"
                size="small"
                pagination={false}
                columns={hookColumns}
                dataSource={hookList.data ?? []}
                loading={hookList.isLoading}
                queryError={hookList.error}
                rowSelection={{ selectedRowKeys: hookIds, onChange: (keys) => setHookIds(keys as string[]) }}
                locale={{ emptyText: <Empty description="No hooks" /> }}
              />
            ),
          },
          {
            key: 'skills',
            label: `Skills (${skillIds.length} selected)`,
            children: (
              <ConsoleTable<SkillRepo>
                rowKey="id"
                size="small"
                pagination={false}
                columns={skillColumns}
                dataSource={skillList.data ?? []}
                loading={skillList.isLoading}
                queryError={skillList.error}
                rowSelection={{ selectedRowKeys: skillIds, onChange: (keys) => setSkillIds(keys as string[]) }}
                locale={{ emptyText: <Empty description="No skill repos" /> }}
              />
            ),
          },
          {
            key: 'agent-presets',
            label: `Agent presets (${agentPresetIds.length} selected)`,
            children: (
              <ConsoleTable<AgentPreset>
                rowKey="id"
                size="small"
                pagination={false}
                columns={agentPresetColumns}
                dataSource={agentPresetList.data ?? []}
                loading={agentPresetList.isLoading}
                queryError={agentPresetList.error}
                rowSelection={{ selectedRowKeys: agentPresetIds, onChange: (keys) => setAgentPresetIds(keys as string[]) }}
                locale={{ emptyText: <Empty description="No agent presets" /> }}
              />
            ),
          },
        ]}
      />

      <div style={{ marginTop: 16 }}>
        <Button
          type="primary"
          icon={<DownloadOutlined />}
          loading={exportBundle.isPending}
          disabled={!organizationId || totalSelected === 0}
          onClick={handleExport}
        >
          Export {totalSelected > 0 ? `${totalSelected} item${totalSelected === 1 ? '' : 's'}` : 'bundle'}
        </Button>
      </div>
    </div>
  )
}

function manifestItemCount(manifest: BundleManifest): number {
  return (
    (manifest.mcp_servers?.length ?? 0) +
    (manifest.hooks?.length ?? 0) +
    (manifest.skills?.length ?? 0) +
    (manifest.agent_presets?.length ?? 0)
  )
}

function ImportTab() {
  const organizationId = useScopedOrganizationId()
  const [manifest, setManifest] = useState<BundleManifest | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const importBundle = useImportBundle()

  const itemCount = useMemo(() => (manifest ? manifestItemCount(manifest) : 0), [manifest])

  const uploadProps: UploadProps = {
    accept: '.json,application/json',
    maxCount: 1,
    showUploadList: false,
    beforeUpload: (file) => {
      setParseError(null)
      importBundle.reset()
      const reader = new FileReader()
      reader.onload = () => {
        try {
          const parsed = JSON.parse(String(reader.result)) as BundleManifest
          if (!parsed || typeof parsed !== 'object' || !parsed.name) {
            throw new Error('Not a valid bundle manifest (missing "name")')
          }
          setManifest(parsed)
        } catch (error) {
          setManifest(null)
          setParseError(error instanceof Error ? error.message : 'Could not parse this file as JSON')
        }
      }
      reader.onerror = () => setParseError('Could not read this file')
      reader.readAsText(file)
      return false
    },
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <Upload.Dragger {...uploadProps} style={{ marginBottom: 16 }}>
        <p className="ant-upload-drag-icon">
          <InboxOutlined />
        </p>
        <p className="ant-upload-text">Click or drag a .seshatbundle.json file here</p>
      </Upload.Dragger>

      {parseError && <Alert type="error" showIcon message="Invalid bundle file" description={parseError} style={{ marginBottom: 16 }} />}

      {manifest && (
        <div style={{ border: `1px solid ${palette.border}`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <Space direction="vertical" size={4} style={{ width: '100%' }}>
            <Typography.Text strong style={{ fontSize: 16 }}>
              <GiftOutlined /> {manifest.name}
            </Typography.Text>
            {manifest.description && <Typography.Text type="secondary">{manifest.description}</Typography.Text>}
            <Space wrap style={{ marginTop: 8 }}>
              {(manifest.mcp_servers?.length ?? 0) > 0 && <Tag>{manifest.mcp_servers!.length} MCP server(s)</Tag>}
              {(manifest.hooks?.length ?? 0) > 0 && <Tag>{manifest.hooks!.length} hook(s)</Tag>}
              {(manifest.skills?.length ?? 0) > 0 && <Tag>{manifest.skills!.length} skill(s)</Tag>}
              {(manifest.agent_presets?.length ?? 0) > 0 && <Tag>{manifest.agent_presets!.length} agent preset(s)</Tag>}
            </Space>
          </Space>

          <ManifestItemList title="MCP servers" names={manifest.mcp_servers?.map((s) => s.display_name || s.name)} />
          <ManifestItemList title="Hooks" names={manifest.hooks?.map((h) => h.name)} />
          <ManifestItemList title="Skills" names={manifest.skills?.map((s) => s.name)} />
          <ManifestItemList title="Agent presets" names={manifest.agent_presets?.map((p) => p.name || p.slug)} />

          <Button
            type="primary"
            icon={<UploadOutlined />}
            loading={importBundle.isPending}
            disabled={!organizationId || itemCount === 0}
            style={{ marginTop: 12 }}
            onClick={() =>
              organizationId &&
              importBundle.mutate(
                { organization_id: organizationId, manifest },
                { onError: (error) => message.error(getErrorMessage(error)) },
              )
            }
          >
            Import into this organization
          </Button>
        </div>
      )}

      {importBundle.isSuccess && importBundle.data && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {importBundle.data.created && importBundle.data.created.length > 0 && (
            <Alert
              type="success"
              showIcon
              message={`${importBundle.data.created.length} item(s) created`}
              description={
                <List
                  size="small"
                  dataSource={importBundle.data.created}
                  renderItem={(item) => (
                    <List.Item>
                      <CheckCircleFilled style={{ color: palette.success, marginRight: 8 }} />
                      {item.name} <Tag style={{ marginLeft: 8 }}>{item.resource_type}</Tag>
                    </List.Item>
                  )}
                />
              }
            />
          )}
          {importBundle.data.failed && importBundle.data.failed.length > 0 && (
            <Alert
              type="warning"
              showIcon
              message={`${importBundle.data.failed.length} item(s) failed`}
              description={
                <List
                  size="small"
                  dataSource={importBundle.data.failed}
                  renderItem={(item) => (
                    <List.Item>
                      <CloseCircleFilled style={{ color: palette.danger, marginRight: 8 }} />
                      {item.name} <Tag style={{ marginLeft: 8 }}>{item.resource_type}</Tag> — {item.error}
                    </List.Item>
                  )}
                />
              }
            />
          )}
        </div>
      )}
    </div>
  )
}

function ManifestItemList({ title, names }: { title: string; names: (string | undefined)[] | undefined }) {
  if (!names || names.length === 0) return null
  return (
    <div style={{ marginTop: 10 }}>
      <Typography.Text type="secondary" style={{ fontSize: 12, textTransform: 'uppercase' }}>
        {title}
      </Typography.Text>
      <div>
        {names.map((name, index) => (
          <Tag key={`${name}-${index}`} style={{ marginTop: 4 }}>
            {name}
          </Tag>
        ))}
      </div>
    </div>
  )
}
