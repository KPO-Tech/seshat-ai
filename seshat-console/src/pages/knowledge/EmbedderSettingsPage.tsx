import { useEffect, useState } from 'react'
import { Alert, Button, Drawer, Form, Input, Popconfirm, Select, Space, Tag, Typography, message } from 'antd'
import { DeleteOutlined, EditOutlined } from '@ant-design/icons'
import {
  useEmbedderSetting,
  useSetEmbedderSetting,
  useDeleteEmbedderSetting,
  type EmbedderSetting,
  type EmbedderSettingInput,
} from '@/api/embedderSettings'
import { getErrorMessage } from '@/api/errors'
import { PageHeader } from '@/components/PageHeader'
import { ProviderIcon } from '@/components/ProviderIcon'
import { useScopedOrganizationId } from '@/hooks/useOrganizationScope'
import { palette, monoStack } from '@/theme/tokens'

const EMBEDDER_PROVIDERS = [
  { id: 'openai', name: 'OpenAI-compatible', desc: 'Any OpenAI-compatible embeddings endpoint (OpenAI itself, Mistral, and most hosted providers)' },
  { id: 'ollama', name: 'Ollama', desc: 'Run an embedding model locally on your own infrastructure' },
]

export function EmbedderSettingsPage() {
  const organizationId = useScopedOrganizationId()
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)

  const { data: setting, isLoading } = useEmbedderSetting(organizationId ?? undefined)
  const setSetting = useSetEmbedderSetting()
  const deleteSetting = useDeleteEmbedderSetting()

  if (!organizationId || isLoading) return null

  const isConfigured = Boolean(setting)
  const catalogEntry = EMBEDDER_PROVIDERS.find((p) => p.id === setting?.provider)

  return (
    <div>
      <PageHeader
        title="Embedder Settings"
        description="The embedder this organization uses for RAG ingestion and search. Falls back to this platform's default organization's embedder when not set."
      />

      <Space orientation="vertical" size={16} style={{ width: '100%' }}>
        <Alert
          type="info"
          showIcon
          title="Why this can only ever be one embedder"
          description="A corpus's vectors are all produced by whichever embedder was active at ingest time. Switching embedders after documents exist would silently mix incompatible vector dimensions in the same corpus. Re-ingest affected files if you need to change providers."
        />

        <div style={{ border: `1px solid ${expanded ? palette.accent : palette.border}`, borderRadius: 12, background: palette.surface }}>
          <div
            onClick={() => isConfigured && setExpanded((v) => !v)}
            style={{
              padding: '14px 18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 16,
              cursor: isConfigured ? 'pointer' : 'default',
            }}
          >
            <Space size={14} align="start">
              <ProviderIcon provider={setting?.provider ?? 'embedder'} size={36} />
              <div>
                <Typography.Text strong>{catalogEntry?.name ?? 'Embedder'}</Typography.Text>
                <Typography.Text style={{ display: 'block', fontSize: 12, color: palette.inkTertiary }}>
                  {catalogEntry?.desc ?? 'No embedder configured for this organization yet'}
                </Typography.Text>
              </div>
            </Space>
            <Space size={10} onClick={(event) => event.stopPropagation()}>
              <Tag color={isConfigured ? 'green' : 'default'} style={{ margin: 0 }}>
                {isConfigured ? 'Connected' : 'Not configured'}
              </Tag>
              {isConfigured ? (
                <>
                  <Button size="small" icon={<EditOutlined />} onClick={() => setEditing(true)} aria-label="Edit embedder credential" />
                  <Popconfirm
                    title="Remove this embedder configuration?"
                    description="Ingestion and search will fall back to this platform's default organization's embedder (if one is configured) until a new one is set here."
                    onConfirm={() =>
                      deleteSetting.mutate(organizationId, {
                        onSuccess: () => message.success('Embedder configuration removed'),
                        onError: (error) => message.error(getErrorMessage(error)),
                      })
                    }
                  >
                    <Button size="small" danger icon={<DeleteOutlined />} aria-label="Delete embedder credential" />
                  </Popconfirm>
                </>
              ) : (
                <Button size="small" type="primary" onClick={() => setEditing(true)}>
                  Configure
                </Button>
              )}
            </Space>
          </div>

          {isConfigured && expanded && (
            <div style={{ borderTop: `1px solid ${palette.border}`, padding: '14px 18px', display: 'flex', gap: 32 }}>
              <div>
                <Typography.Text style={{ display: 'block', fontSize: 11, fontWeight: 700, color: palette.inkTertiary }}>
                  MODEL
                </Typography.Text>
                <Typography.Text style={{ fontFamily: monoStack, fontSize: 13 }}>{setting!.model}</Typography.Text>
              </div>
              <div>
                <Typography.Text style={{ display: 'block', fontSize: 11, fontWeight: 700, color: palette.inkTertiary }}>
                  BASE URL
                </Typography.Text>
                <Typography.Text style={{ fontFamily: monoStack, fontSize: 13 }}>{setting!.base_url}</Typography.Text>
              </div>
            </div>
          )}
        </div>
      </Space>

      <EmbedderSettingFormDrawer
        setting={setting ?? null}
        open={editing}
        onClose={() => setEditing(false)}
        onSubmit={(values) => {
          setSetting.mutate(
            { organizationId, body: values },
            {
              onSuccess: () => {
                message.success('Embedder configuration saved')
                setEditing(false)
              },
              onError: (error) => message.error(getErrorMessage(error)),
            },
          )
        }}
        submitting={setSetting.isPending}
      />
    </div>
  )
}

function EmbedderSettingFormDrawer({
  setting,
  open,
  onClose,
  onSubmit,
  submitting,
}: {
  setting: EmbedderSetting | null
  open: boolean
  onClose: () => void
  onSubmit: (values: EmbedderSettingInput) => void
  submitting: boolean
}) {
  const [form] = Form.useForm<EmbedderSettingInput>()
  const isEdit = setting !== null

  useEffect(() => {
    if (open) form.setFieldsValue(setting ?? { provider: 'openai', model: '', base_url: '' })
  }, [open, setting, form])

  return (
    <Drawer
      title={isEdit ? 'Edit embedder configuration' : 'Configure embedder'}
      open={open}
      onClose={onClose}
      destroyOnHidden
      extra={
        <Button type="primary" loading={submitting} onClick={() => form.submit()}>
          Save
        </Button>
      }
    >
      <Form form={form} layout="vertical" onFinish={onSubmit}>
        <Form.Item name="provider" label="Provider" rules={[{ required: true, message: 'Required' }]}>
          <Select
            options={EMBEDDER_PROVIDERS.map((p) => ({ value: p.id, label: p.name }))}
          />
        </Form.Item>
        <Form.Item
          name="model"
          label="Model"
          rules={[{ required: true, message: 'Required' }]}
          extra="e.g. text-embedding-3-small, mistral-embed, nomic-embed-text"
        >
          <Input placeholder="text-embedding-3-small" />
        </Form.Item>
        <Form.Item
          name="base_url"
          label="Base URL"
          rules={[{ required: true, message: 'Required' }]}
          extra="An OpenAI-compatible embeddings endpoint (many providers, including Mistral, work directly against provider: openai)."
        >
          <Input placeholder="https://api.openai.com/v1" />
        </Form.Item>
        <Form.Item
          name="api_key"
          label="API key"
          extra={isEdit ? 'Leave empty to keep the current key unchanged.' : 'Optional. A local Ollama instance typically needs none.'}
        >
          <Input.Password autoComplete="off" placeholder={isEdit ? '••••••••' : undefined} />
        </Form.Item>
      </Form>
    </Drawer>
  )
}
