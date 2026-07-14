import { useEffect } from 'react'
import { Button, Card, Empty, Form, Input, Popconfirm, Space, Tag, Typography } from 'antd'
import { DeleteOutlined, SaveOutlined } from '@ant-design/icons'
import type { EmbedderSetting, EmbedderSettingInput, PlatformEmbedderSetting } from '@/api/embedderSettings'
import { monoStack } from '@/theme/tokens'

type Setting = EmbedderSetting | PlatformEmbedderSetting | null | undefined

// Shared form for the org-scoped and platform-wide embedder settings pages
// — both are singleton config slots (GET/PUT-upsert/DELETE), same fields,
// same "not configured yet" empty state, so one component covers both
// rather than duplicating the form.
export function EmbedderSettingForm({
  setting,
  loading,
  saving,
  deleting,
  onSave,
  onDelete,
  emptyDescription,
}: {
  setting: Setting
  loading: boolean
  saving: boolean
  deleting: boolean
  onSave: (values: EmbedderSettingInput) => void
  onDelete: () => void
  emptyDescription: string
}) {
  const [form] = Form.useForm<EmbedderSettingInput>()
  const isConfigured = Boolean(setting)

  useEffect(() => {
    // Guarded on !loading — while loading this component renders nothing
    // (see below), so calling setFieldsValue before the Form has mounted
    // would fire antd's "instance not connected to any Form element" warning.
    if (!loading) form.setFieldsValue(setting ?? { provider: undefined, model: '', base_url: '' })
  }, [setting, loading, form])

  if (loading) return null

  return (
    <Card
      title={
        isConfigured ? (
          <Space>
            <span>Embedder configuration</span>
            <Tag style={{ fontFamily: monoStack, margin: 0 }}>{setting!.provider}</Tag>
          </Space>
        ) : (
          'Embedder configuration'
        )
      }
      extra={
        isConfigured && (
          <Popconfirm
            title="Remove this embedder configuration?"
            description="Ingestion and search will stop working here until a new embedder is configured (or the platform default takes over, if this was an organization-level setting)."
            onConfirm={onDelete}
          >
            <Button danger icon={<DeleteOutlined />} loading={deleting}>
              Delete
            </Button>
          </Popconfirm>
        )
      }
    >
      {!isConfigured && (
        <Empty
          description={emptyDescription}
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          style={{ marginBottom: 24 }}
        />
      )}
      <Form<EmbedderSettingInput> form={form} layout="vertical" onFinish={onSave} style={{ maxWidth: 480 }}>
        <Form.Item name="provider" label="Provider" rules={[{ required: true, message: 'Required' }]}>
          <Input placeholder="openai" />
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
          extra={
            isConfigured
              ? 'Leave empty to keep the current key unchanged.'
              : 'Optional — a local Ollama instance typically needs none.'
          }
        >
          <Input.Password autoComplete="off" placeholder={isConfigured ? '••••••••' : undefined} />
        </Form.Item>
        <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving}>
          Save
        </Button>
      </Form>
      {!isConfigured && (
        <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 12 }}>
          The key is encrypted at rest and never shown again after saving.
        </Typography.Text>
      )}
    </Card>
  )
}
