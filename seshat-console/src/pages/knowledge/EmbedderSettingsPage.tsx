import { useEffect, useState } from 'react'
import { Alert, Button, Drawer, Form, Input, Popconfirm, Select, Space, Tag, Typography, message } from 'antd'
import { DeleteOutlined, EditOutlined, ReloadOutlined } from '@ant-design/icons'
import {
  useEmbedderSetting,
  useSetEmbedderSetting,
  useDeleteEmbedderSetting,
  useDetectEmbedderModels,
  type EmbedderSetting,
  type EmbedderSettingInput,
} from '@/api/embedderSettings'
import { getErrorMessage } from '@/api/errors'
import { AutofillGuard } from '@/components/AutofillGuard'
import { PageHeader } from '@/components/PageHeader'
import { ProviderIcon } from '@/components/ProviderIcon'
import { useScopedOrganizationId } from '@/hooks/useOrganizationScope'
import { palette, monoStack } from '@/theme/tokens'

// The SDK only understands two embedding *wire formats* - "openai" (a
// generic POST /embeddings shape used by OpenAI, Mistral, and most hosted
// vendors) and "ollama" (POST /api/embed) - see
// seshat/internal/rag/embedder/embedder.go. So "Mistral" can never be its
// own wire-level provider value; it's a vendor CATALOG entry that fills in
// the right openai-wire base_url/model, same idea as providerCatalog.ts
// does for LLM providers.
interface EmbedderVendor {
  id: string
  name: string
  wireProvider: 'openai' | 'ollama'
  baseURL: string
  // Substring to recognize an existing setting as this vendor when editing
  // (only the wire provider + base_url are actually persisted, not which
  // catalog entry was originally picked). Omitted for ollama (matched by
  // wireProvider alone) and the generic fallback (matches nothing else).
  hostMatch?: string
  defaultModel: string
  desc: string
}

const EMBEDDER_VENDORS: EmbedderVendor[] = [
  {
    id: 'mistral',
    name: 'Mistral',
    wireProvider: 'openai',
    baseURL: 'https://api.mistral.ai/v1',
    hostMatch: 'api.mistral.ai',
    defaultModel: 'mistral-embed',
    desc: 'Free tier available — verified working end-to-end with Seshat',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    wireProvider: 'openai',
    baseURL: 'https://api.openai.com/v1',
    hostMatch: 'api.openai.com',
    defaultModel: 'text-embedding-3-small',
    desc: 'text-embedding-3-small, text-embedding-3-large, text-embedding-ada-002',
  },
  {
    id: 'ollama',
    name: 'Ollama',
    wireProvider: 'ollama',
    baseURL: 'http://localhost:11434',
    defaultModel: '',
    desc: 'Run an embedding model locally on your own infrastructure',
  },
  {
    id: 'openai-compatible',
    name: 'Other OpenAI-compatible',
    wireProvider: 'openai',
    baseURL: '',
    defaultModel: '',
    desc: 'Any other OpenAI-compatible embeddings endpoint',
  },
]

function vendorForSetting(provider?: string, baseURL?: string): EmbedderVendor {
  if (provider === 'ollama') return EMBEDDER_VENDORS.find((v) => v.id === 'ollama')!
  const normalized = (baseURL ?? '').toLowerCase()
  const matched = EMBEDDER_VENDORS.find((v) => v.hostMatch && normalized.includes(v.hostMatch))
  return matched ?? EMBEDDER_VENDORS.find((v) => v.id === 'openai-compatible')!
}

// Shown as suggestions once a vendor is picked, before any live detection
// has run - the "openai" wire format's own list is also what a live probe
// would return anyway (see the backend's detect-models handler), so this
// isn't duplicated guesswork.
const EMBEDDER_STATIC_MODELS: Record<string, string[]> = {
  openai: ['text-embedding-3-small', 'text-embedding-3-large', 'text-embedding-ada-002', 'mistral-embed'],
}

export function EmbedderSettingsPage() {
  const organizationId = useScopedOrganizationId()
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)

  const { data: setting, isLoading } = useEmbedderSetting(organizationId ?? undefined)
  const setSetting = useSetEmbedderSetting()
  const deleteSetting = useDeleteEmbedderSetting()

  if (!organizationId || isLoading) return null

  const isConfigured = Boolean(setting)
  const vendor = isConfigured ? vendorForSetting(setting?.provider, setting?.base_url) : null

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
              <ProviderIcon provider={vendor?.id ?? 'embedder'} size={36} />
              <div>
                <Typography.Text strong>{vendor?.name ?? 'Embedder'}</Typography.Text>
                <Typography.Text style={{ display: 'block', fontSize: 12, color: palette.inkTertiary }}>
                  {vendor?.desc ?? 'No embedder configured for this organization yet'}
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
  const watchedBaseURL = Form.useWatch('base_url', form)
  const isEdit = setting !== null

  const [vendorId, setVendorId] = useState('mistral')
  const vendor = EMBEDDER_VENDORS.find((v) => v.id === vendorId) ?? EMBEDDER_VENDORS[0]
  const isOllama = vendor.wireProvider === 'ollama'

  const detectModels = useDetectEmbedderModels()
  const [modelOptions, setModelOptions] = useState<string[]>([])

  useEffect(() => {
    if (!open) return
    const initialVendor = vendorForSetting(setting?.provider, setting?.base_url)
    setVendorId(initialVendor.id)
    form.setFieldsValue(
      setting
        ? { provider: setting.provider, model: setting.model, base_url: setting.base_url }
        : { provider: initialVendor.wireProvider, model: initialVendor.defaultModel, base_url: initialVendor.baseURL },
    )
    setModelOptions(mergeWithCurrent(EMBEDDER_STATIC_MODELS[initialVendor.wireProvider] ?? [], setting?.model))
  }, [open, setting, form])

  const handleVendorChange = (nextVendorId: string) => {
    const nextVendor = EMBEDDER_VENDORS.find((v) => v.id === nextVendorId)
    if (!nextVendor) return
    setVendorId(nextVendorId)
    form.setFieldValue('provider', nextVendor.wireProvider)

    const currentBaseURL = form.getFieldValue('base_url')
    const baseURLWasAKnownDefault = !currentBaseURL || EMBEDDER_VENDORS.some((v) => v.baseURL && v.baseURL === currentBaseURL)
    if (baseURLWasAKnownDefault) form.setFieldValue('base_url', nextVendor.baseURL)

    const currentModel = form.getFieldValue('model')
    const modelWasAKnownDefault = !currentModel || EMBEDDER_VENDORS.some((v) => v.defaultModel && v.defaultModel === currentModel)
    if (modelWasAKnownDefault) form.setFieldValue('model', nextVendor.defaultModel)

    setModelOptions(EMBEDDER_STATIC_MODELS[nextVendor.wireProvider] ?? [])
  }

  const handleDetectModels = () => {
    const provider = form.getFieldValue('provider')
    detectModels.mutate(
      { provider, base_url: watchedBaseURL || undefined },
      {
        onSuccess: (data) => {
          const models = data?.embedding_models ?? []
          setModelOptions(models)
          if (models.length === 0) {
            message.warning(`No embedding models found — check the base URL${isOllama ? ' and that Ollama is reachable' : ''}.`)
          } else {
            message.success(`Found ${models.length} model${models.length === 1 ? '' : 's'}`)
          }
        },
        onError: (error) => message.error(getErrorMessage(error)),
      },
    )
  }

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
      <Form form={form} layout="vertical" onFinish={onSubmit} autoComplete="off">
        <AutofillGuard />
        <Form.Item label="Provider" required>
          <Select
            value={vendorId}
            onChange={handleVendorChange}
            options={EMBEDDER_VENDORS.map((v) => ({ value: v.id, label: v.name }))}
          />
        </Form.Item>
        {/* The actual wire-format value ("openai"/"ollama") the vendor above resolves to - never edited directly. */}
        <Form.Item name="provider" hidden rules={[{ required: true, message: 'Required' }]}>
          <Input />
        </Form.Item>
        <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: -12, marginBottom: 16 }}>
          {vendor.desc}
        </Typography.Text>
        <Form.Item
          name="base_url"
          label="Base URL"
          rules={[{ required: true, message: 'Required' }]}
          extra={
            isOllama
              ? "seshat-server itself runs in a container in this project's docker-compose stack — from inside it, localhost means the container, not your machine. Use http://host.docker.internal:11434 to reach an Ollama running on your host."
              : 'An OpenAI-compatible embeddings endpoint. Pick "Other OpenAI-compatible" above for a vendor not listed by name.'
          }
        >
          <Input autoComplete="off" placeholder="https://api.openai.com/v1" />
        </Form.Item>

        <div style={{ marginTop: -8, marginBottom: 16 }}>
          <Button size="small" icon={<ReloadOutlined />} loading={detectModels.isPending} onClick={handleDetectModels}>
            Detect models
          </Button>
          <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 6 }}>
            {modelOptions.length > 0
              ? `${modelOptions.length} model${modelOptions.length === 1 ? '' : 's'} available.`
              : 'Probes the base URL above for installed embedding models.'}
          </Typography.Text>
        </div>

        {modelOptions.length > 0 ? (
          <Form.Item name="model" label="Model" rules={[{ required: true, message: 'Required' }]}>
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="Select a model"
              options={modelOptions.map((model) => ({ label: model, value: model }))}
            />
          </Form.Item>
        ) : (
          <Form.Item
            name="model"
            label="Model"
            rules={[{ required: true, message: 'Required' }]}
            extra="e.g. text-embedding-3-small, mistral-embed, nomic-embed-text"
          >
            <Input autoComplete="off" placeholder="text-embedding-3-small" />
          </Form.Item>
        )}

        <Form.Item
          name="api_key"
          label="API key"
          extra={isEdit ? 'Leave empty to keep the current key unchanged.' : 'Optional. A local Ollama instance typically needs none.'}
        >
          <Input.Password autoComplete="new-password" placeholder={isEdit ? '••••••••' : undefined} />
        </Form.Item>
      </Form>
    </Drawer>
  )
}

function mergeWithCurrent(options: string[], current: string | null | undefined): string[] {
  if (!current || options.includes(current)) return options
  return [current, ...options]
}
