import { useEffect, useState } from 'react'
import { Alert, Button, Drawer, Form, Input, Popconfirm, Select, Space, Switch, Tag, Typography, message } from 'antd'
import { DeleteOutlined, EditOutlined, ReloadOutlined } from '@ant-design/icons'
import {
  useRerankerSetting,
  useSetRerankerSetting,
  useDeleteRerankerSetting,
  useDetectRerankerModel,
  type RerankerSetting,
  type RerankerSettingInput,
} from '@/api/rerankerSettings'
import { getErrorMessage } from '@/api/errors'
import { AutofillGuard } from '@/components/AutofillGuard'
import { PageHeader } from '@/components/PageHeader'
import { ProviderIcon } from '@/components/ProviderIcon'
import { useScopedOrganizationId } from '@/hooks/useOrganizationScope'
import { palette, monoStack } from '@/theme/tokens'

// Unlike the embedder, there's no wire-format split to encode here - every
// preset just POSTs the same Cohere/LangSearch/TEI-compatible rerank
// request shape (see seshat/internal/rag/reranker/reranker.go's Rerank),
// so a preset only ever pre-fills base_url/model, nothing structural.
interface RerankerPreset {
  id: string
  name: string
  baseURL: string
  defaultModel: string
  desc: string
  isTEI?: boolean // shows the "Detect model" probe - TEI can describe itself, hosted APIs can't
}

const RERANKER_PRESETS: RerankerPreset[] = [
  {
    id: 'tei',
    name: 'TEI / vLLM local',
    baseURL: 'http://tei-rerank/rerank',
    defaultModel: 'BAAI/bge-reranker-v2-m3',
    desc: 'Run a reranker locally on your own infrastructure - free, no API key',
    isTEI: true,
  },
  {
    id: 'langsearch',
    name: 'LangSearch',
    baseURL: 'https://api.langsearch.com/v1/rerank',
    defaultModel: 'langsearch-reranker-v1',
    desc: 'Free tier available',
  },
  {
    id: 'cohere',
    name: 'Cohere compatible',
    baseURL: 'https://api.cohere.com/v2/rerank',
    defaultModel: 'rerank-v3.5',
    desc: 'Cohere-shaped rerank endpoints',
  },
  {
    id: 'custom',
    name: 'Custom endpoint',
    baseURL: '',
    defaultModel: '',
    desc: 'Any other Cohere/TEI-compatible rerank endpoint',
  },
]

function presetForSetting(baseURL?: string): RerankerPreset {
  const normalized = (baseURL ?? '').toLowerCase()
  const matched = RERANKER_PRESETS.find((p) => p.baseURL && normalized === p.baseURL.toLowerCase())
  return matched ?? RERANKER_PRESETS.find((p) => p.id === 'custom')!
}

export function RerankerSettingsPage() {
  const organizationId = useScopedOrganizationId()
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)

  const { data: setting, isLoading } = useRerankerSetting(organizationId ?? undefined)
  const setSetting = useSetRerankerSetting()
  const deleteSetting = useDeleteRerankerSetting()

  if (!organizationId || isLoading) return null

  const isConfigured = Boolean(setting)
  const preset = isConfigured ? presetForSetting(setting?.base_url) : null
  const statusTag = !isConfigured ? { color: 'default', label: 'Not configured' } : setting!.enabled ? { color: 'green', label: 'Enabled' } : { color: 'default', label: 'Disabled' }

  return (
    <div>
      <PageHeader />

      <Space orientation="vertical" size={16} style={{ width: '100%' }}>
        <Alert
          type="info"
          showIcon
          title="Optional second pass, not required for search to work"
          description="A reranker re-orders results after retrieval for better relevance. Unlike the embedder, this never touches stored vectors - turning it on, off, or switching providers takes effect on the next search, with nothing to re-ingest."
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
              <ProviderIcon provider={preset?.id ?? 'reranker'} size={36} />
              <div>
                <Typography.Text strong>{preset?.name ?? 'Reranker'}</Typography.Text>
                <Typography.Text style={{ display: 'block', fontSize: 12, color: palette.inkTertiary }}>
                  {preset?.desc ?? 'No reranker configured for this organization yet'}
                </Typography.Text>
              </div>
            </Space>
            <Space size={10} onClick={(event) => event.stopPropagation()}>
              <Tag color={statusTag.color} style={{ margin: 0 }}>
                {statusTag.label}
              </Tag>
              {isConfigured ? (
                <>
                  <Button size="small" icon={<EditOutlined />} onClick={() => setEditing(true)} aria-label="Edit reranker configuration" />
                  <Popconfirm
                    title="Remove this reranker configuration?"
                    description="Search reverts to this deployment's platform-wide reranker (if one is configured via RAG_RERANK_URL) or no reranking at all."
                    onConfirm={() =>
                      deleteSetting.mutate(organizationId, {
                        onSuccess: () => message.success('Reranker configuration removed'),
                        onError: (error) => message.error(getErrorMessage(error)),
                      })
                    }
                  >
                    <Button size="small" danger icon={<DeleteOutlined />} aria-label="Delete reranker configuration" />
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
                <Typography.Text style={{ fontFamily: monoStack, fontSize: 13 }}>{setting!.model || '—'}</Typography.Text>
              </div>
              <div>
                <Typography.Text style={{ display: 'block', fontSize: 11, fontWeight: 700, color: palette.inkTertiary }}>
                  ENDPOINT URL
                </Typography.Text>
                <Typography.Text style={{ fontFamily: monoStack, fontSize: 13 }}>{setting!.base_url}</Typography.Text>
              </div>
            </div>
          )}
        </div>
      </Space>

      <RerankerSettingFormDrawer
        setting={setting ?? null}
        open={editing}
        onClose={() => setEditing(false)}
        onSubmit={(values) => {
          setSetting.mutate(
            { organizationId, body: values },
            {
              onSuccess: () => {
                message.success('Reranker configuration saved')
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

function RerankerSettingFormDrawer({
  setting,
  open,
  onClose,
  onSubmit,
  submitting,
}: {
  setting: RerankerSetting | null
  open: boolean
  onClose: () => void
  onSubmit: (values: RerankerSettingInput) => void
  submitting: boolean
}) {
  const [form] = Form.useForm<RerankerSettingInput>()
  const watchedBaseURL = Form.useWatch('base_url', form)
  const isEdit = setting !== null

  const [presetId, setPresetId] = useState('tei')
  const preset = RERANKER_PRESETS.find((p) => p.id === presetId) ?? RERANKER_PRESETS[0]

  const detectModel = useDetectRerankerModel()

  useEffect(() => {
    if (!open) return
    const initialPreset = presetForSetting(setting?.base_url)
    setPresetId(initialPreset.id)
    form.setFieldsValue(
      setting
        ? { base_url: setting.base_url, model: setting.model, enabled: setting.enabled }
        : { base_url: initialPreset.baseURL, model: initialPreset.defaultModel, enabled: true },
    )
  }, [open, setting, form])

  const handlePresetChange = (nextPresetId: string) => {
    const nextPreset = RERANKER_PRESETS.find((p) => p.id === nextPresetId)
    if (!nextPreset) return
    setPresetId(nextPresetId)

    const currentBaseURL = form.getFieldValue('base_url')
    const baseURLWasAKnownDefault = !currentBaseURL || RERANKER_PRESETS.some((p) => p.baseURL && p.baseURL === currentBaseURL)
    if (baseURLWasAKnownDefault) form.setFieldValue('base_url', nextPreset.baseURL)

    const currentModel = form.getFieldValue('model')
    const modelWasAKnownDefault = !currentModel || RERANKER_PRESETS.some((p) => p.defaultModel && p.defaultModel === currentModel)
    if (modelWasAKnownDefault) form.setFieldValue('model', nextPreset.defaultModel)
  }

  const handleDetectModel = () => {
    if (!watchedBaseURL) return
    detectModel.mutate(
      { base_url: watchedBaseURL },
      {
        onSuccess: (data) => {
          if (data?.error || !data?.model) {
            message.warning(data?.error || 'No model reported - check the endpoint URL and that it is reachable.')
            return
          }
          form.setFieldValue('model', data.model)
          message.success(`Detected model: ${data.model}`)
        },
        onError: (error) => message.error(getErrorMessage(error)),
      },
    )
  }

  return (
    <Drawer
      title={isEdit ? 'Edit reranker configuration' : 'Configure reranker'}
      open={open}
      onClose={onClose}
      destroyOnHidden
      extra={
        <Button type="primary" loading={submitting} onClick={() => form.submit()}>
          Save
        </Button>
      }
    >
      <Form form={form} layout="vertical" onFinish={onSubmit} autoComplete="off">
        <AutofillGuard />
        <Form.Item label="Endpoint type" required>
          <Select
            value={presetId}
            onChange={handlePresetChange}
            options={RERANKER_PRESETS.map((p) => ({ value: p.id, label: p.name }))}
          />
        </Form.Item>
        <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: -12, marginBottom: 16 }}>
          {preset.desc}
        </Typography.Text>

        <Form.Item
          name="base_url"
          label="Endpoint URL"
          rules={[{ required: true, message: 'Required' }]}
          extra={
            preset.isTEI
              ? "seshat-server itself runs in a container in this project's docker-compose stack - http://tei-rerank/rerank reaches the tei-rerank service directly over the compose network."
              : undefined
          }
        >
          <Input autoComplete="off" placeholder="http://tei-rerank/rerank" />
        </Form.Item>

        {preset.isTEI && (
          <div style={{ marginTop: -8, marginBottom: 16 }}>
            <Button size="small" icon={<ReloadOutlined />} loading={detectModel.isPending} onClick={handleDetectModel} disabled={!watchedBaseURL}>
              Detect model
            </Button>
            <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 6 }}>
              Probes the endpoint above's /info route - TEI serves exactly one model per instance.
            </Typography.Text>
          </div>
        )}

        <Form.Item name="model" label="Model" extra="Ignored by single-model servers like TEI, required by LangSearch/Cohere/vLLM.">
          <Input autoComplete="off" placeholder="BAAI/bge-reranker-v2-m3" />
        </Form.Item>

        <Form.Item
          name="api_key"
          label="API key"
          extra={isEdit ? 'Leave empty to keep the current key unchanged.' : 'Optional. A self-hosted TEI/vLLM instance typically needs none.'}
        >
          <Input.Password autoComplete="new-password" placeholder={isEdit ? '••••••••' : undefined} />
        </Form.Item>

        <Form.Item name="enabled" label="Enabled" valuePropName="checked">
          <Switch />
        </Form.Item>
      </Form>
    </Drawer>
  )
}
