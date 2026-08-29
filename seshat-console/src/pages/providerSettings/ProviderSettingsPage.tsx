import { useEffect, useMemo, useState } from 'react'
import { Button, Drawer, Form, Input, Select, message, Popconfirm, Space, Tag, Typography } from 'antd'
import { CrownOutlined, DeleteOutlined, DownOutlined, EditOutlined, ReloadOutlined, RightOutlined } from '@ant-design/icons'
import {
  useProviderSettingsList,
  useCreateProviderSetting,
  useUpdateProviderSetting,
  useDeleteProviderSetting,
  useSetProviderSettingDefault,
  useDetectProviderModels,
  type ProviderSetting,
  type ProviderSettingInput,
} from '@/api/providerSettings'
import { getErrorMessage } from '@/api/errors'
import { useProviderCatalog, getProviderModels, type ProviderCatalogEntry } from '@/api/providerCatalog'
import { AutofillGuard } from '@/components/AutofillGuard'
import { PageHeader } from '@/components/PageHeader'
import { ProviderIcon } from '@/components/ProviderIcon'
import { useScopedOrganizationId } from '@/hooks/useOrganizationScope'
import { palette, monoStack } from '@/theme/tokens'

// Auth types this page's Add/Edit form knows how to collect: a plain API
// key (or none, for a local Ollama-style install). "oauth"/"aws"/"gcp"
// providers from the SDK catalog (Codex, Bedrock, Vertex) need a different
// setup flow this form doesn't offer yet, so they're filtered out below
// rather than shown with a form that can't actually configure them.
const SUPPORTED_AUTH_TYPES = new Set(['api_key', 'none'])

// Ollama's fixed local default - not "catalog data" in the SDK sense (it
// never varies by provider release), just a stable fact used for one
// diagnostic message below.
const OLLAMA_DEFAULT_URL = 'http://localhost:11434'

function toSupportedProviderEntries(catalog: ProviderCatalogEntry[] | undefined) {
  return (catalog ?? [])
    .filter((entry) => SUPPORTED_AUTH_TYPES.has(entry.auth_type ?? ''))
    .map((entry) => ({ id: entry.name!, name: entry.display_name!, desc: entry.description ?? '' }))
}

export function ProviderSettingsPage() {
  const organizationId = useScopedOrganizationId()
  const [expanded, setExpanded] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ provider: string; setting: ProviderSetting | null } | null>(null)

  const { data } = useProviderSettingsList(organizationId ?? undefined)
  const providerCatalog = useProviderCatalog()
  const createSetting = useCreateProviderSetting()
  const updateSetting = useUpdateProviderSetting()
  const deleteSetting = useDeleteProviderSetting()
  const setDefault = useSetProviderSettingDefault()

  const supportedProviders = useMemo(() => toSupportedProviderEntries(providerCatalog.data), [providerCatalog.data])
  const settingByProvider = new Map((data ?? []).map((setting) => [setting.provider, setting]))

  return (
    <div>
      <PageHeader
        title="Provider Settings"
        description="This organization's own LLM credentials. They override this platform's default organization's credentials when present."
      />

      <Space orientation="vertical" size={12} style={{ width: '100%' }}>
        {supportedProviders.map((entry) => {
          const setting = settingByProvider.get(entry.id)
          const isConfigured = Boolean(setting)
          const isExpanded = expanded === entry.id

          return (
            <div
              key={entry.id}
              style={{
                border: `1px solid ${isExpanded ? palette.accent : palette.border}`,
                borderRadius: 12,
                background: palette.surface,
              }}
            >
              <div
                onClick={() => isConfigured && setExpanded(isExpanded ? null : entry.id)}
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
                  <ProviderIcon provider={entry.id} size={36} />
                  <div>
                    <Space size={8} align="center">
                      <Typography.Text strong>{entry.name}</Typography.Text>
                      {setting?.is_default && (
                        <Tag color="gold" icon={<CrownOutlined />} style={{ margin: 0 }}>
                          Default
                        </Tag>
                      )}
                    </Space>
                    <Typography.Text style={{ display: 'block', fontSize: 12, color: palette.inkTertiary }}>
                      {entry.desc}
                    </Typography.Text>
                  </div>
                </Space>
                <Space size={10} onClick={(event) => event.stopPropagation()}>
                  <Tag color={isConfigured ? 'green' : 'default'} style={{ margin: 0 }}>
                    {isConfigured ? 'Connected' : 'Not configured'}
                  </Tag>
                  {isConfigured ? (
                    <>
                      {!setting!.is_default && (
                        <Popconfirm
                          title={`Set ${entry.name} as the default provider?`}
                          description="This replaces this organization's current default provider (if any)."
                          onConfirm={() =>
                            setDefault.mutate(
                              { id: setting!.id!, isDefault: true },
                              { onError: (error) => message.error(getErrorMessage(error)) },
                            )
                          }
                        >
                          <Button size="small" icon={<CrownOutlined />} aria-label={`Set ${entry.name} as default`} />
                        </Popconfirm>
                      )}
                      <Button
                        size="small"
                        icon={<EditOutlined />}
                        onClick={() => setEditing({ provider: entry.id, setting: setting! })}
                        aria-label={`Edit ${entry.name} credential`}
                      />
                      <Popconfirm
                        title={`Remove the ${entry.name} credential?`}
                        description="Cloud jobs configured for this provider will fall back to this platform's default organization's credentials (if any) or start failing at execution time."
                        onConfirm={() =>
                          deleteSetting.mutate(setting!.id!, { onError: (error) => message.error(getErrorMessage(error)) })
                        }
                      >
                        <Button size="small" danger icon={<DeleteOutlined />} aria-label={`Delete ${entry.name} credential`} />
                      </Popconfirm>
                      <Button
                        size="small"
                        icon={isExpanded ? <DownOutlined /> : <RightOutlined />}
                        onClick={() => setExpanded(isExpanded ? null : entry.id)}
                        aria-label={isExpanded ? `Collapse ${entry.name} details` : `Expand ${entry.name} details`}
                      />
                    </>
                  ) : (
                    <Button
                      size="small"
                      type="primary"
                      disabled={!organizationId}
                      onClick={() => setEditing({ provider: entry.id, setting: null })}
                    >
                      Configure
                    </Button>
                  )}
                </Space>
              </div>

              {isConfigured && isExpanded && (
                <div style={{ borderTop: `1px solid ${palette.border}`, padding: '14px 18px', display: 'flex', gap: 32, flexWrap: 'wrap' }}>
                  <div>
                    <Typography.Text style={{ display: 'block', fontSize: 11, fontWeight: 700, color: palette.inkTertiary }}>
                      DEFAULT MODEL
                    </Typography.Text>
                    <Typography.Text style={{ fontFamily: monoStack, fontSize: 13 }}>{setting!.default_model}</Typography.Text>
                  </div>
                  <div>
                    <Typography.Text style={{ display: 'block', fontSize: 11, fontWeight: 700, color: palette.inkTertiary }}>
                      BASE URL
                    </Typography.Text>
                    <Typography.Text style={{ fontFamily: monoStack, fontSize: 13 }}>
                      {setting!.base_url || 'Provider default'}
                    </Typography.Text>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </Space>

      <ProviderSettingFormDrawer
        provider={editing?.provider ?? null}
        providerName={supportedProviders.find((p) => p.id === editing?.provider)?.name ?? ''}
        setting={editing?.setting ?? null}
        open={editing !== null}
        onClose={() => setEditing(null)}
        onSubmit={(values) => {
          if (!organizationId || !editing) return
          if (!editing.setting) {
            createSetting.mutate(
              { ...values, organization_id: organizationId, provider: editing.provider },
              { onSuccess: () => setEditing(null), onError: (error) => message.error(getErrorMessage(error)) },
            )
          } else {
            const { provider: _provider, ...updateBody } = values
            updateSetting.mutate(
              { id: editing.setting.id!, body: updateBody },
              { onSuccess: () => setEditing(null), onError: (error) => message.error(getErrorMessage(error)) },
            )
          }
        }}
        submitting={createSetting.isPending || updateSetting.isPending}
      />
    </div>
  )
}

function ProviderSettingFormDrawer({
  provider,
  providerName,
  setting,
  open,
  onClose,
  onSubmit,
  submitting,
}: {
  provider: string | null
  providerName: string
  setting: ProviderSetting | null
  open: boolean
  onClose: () => void
  onSubmit: (values: Omit<ProviderSettingInput, 'organization_id'>) => void
  submitting: boolean
}) {
  const [form] = Form.useForm<Omit<ProviderSettingInput, 'organization_id'>>()
  const watchedModelId = Form.useWatch('default_model', form)
  const watchedBaseURL = Form.useWatch('base_url', form)
  const isEdit = setting !== null
  const isOllama = provider === 'ollama'
  const providerCatalog = useProviderCatalog()
  const modelOptions = useMemo(
    () => getProviderModels(providerCatalog.data, provider, setting?.default_model),
    [providerCatalog.data, provider, setting?.default_model],
  )
  const selectedModel = modelOptions.find((model) => model.id === watchedModelId) ?? null
  const supportsStaticCatalog = modelOptions.length > 0

  const detectModels = useDetectProviderModels()
  const [detectedModels, setDetectedModels] = useState<string[]>([])

  useEffect(() => {
    if (!open || !provider) return
    const fallbackModel = setting?.default_model ?? modelOptions[0]?.id ?? ''
    form.setFieldsValue(setting ?? { provider, default_model: fallbackModel, base_url: '' })
    setDetectedModels([])
  }, [open, provider, setting, form, modelOptions])

  const handleDetectModels = () => {
    if (!provider) return
    detectModels.mutate(
      { provider, base_url: watchedBaseURL || undefined },
      {
        onSuccess: (data) => {
          const models = data?.models ?? []
          setDetectedModels(models)
          if (models.length === 0) {
            message.warning(
              `No models found. Check that Ollama is running and reachable at ${watchedBaseURL || OLLAMA_DEFAULT_URL}`,
            )
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
      title={isEdit ? `Edit ${providerName} credential` : `Configure ${providerName}`}
      open={open}
      onClose={onClose}
      destroyOnHidden
      extra={
        <Button type="primary" loading={submitting} onClick={() => form.submit()}>
          Save
        </Button>
      }
    >
      <Form key={provider ?? 'none'} form={form} layout="vertical" onFinish={onSubmit} autoComplete="off">
        <AutofillGuard />
        <Form.Item
          name="base_url"
          label="Base URL"
          extra={
            isOllama
              ? "seshat-server itself runs in a container in this project's docker-compose stack. From inside it, localhost means the container, not your machine. Use http://host.docker.internal:11434 to reach an Ollama running on your host."
              : undefined
          }
        >
          <Input autoComplete="off" placeholder="Leave empty to use the provider's default" />
        </Form.Item>

        {isOllama && (
          <div style={{ marginTop: -8, marginBottom: 16 }}>
            <Button size="small" icon={<ReloadOutlined />} loading={detectModels.isPending} onClick={handleDetectModels}>
              Detect models
            </Button>
            <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 6 }}>
              {detectedModels.length > 0
                ? `${detectedModels.length} model${detectedModels.length === 1 ? '' : 's'} found on this Ollama instance.`
                : 'Probes the base URL above for installed models.'}
            </Typography.Text>
          </div>
        )}

        {supportsStaticCatalog ? (
          <Form.Item name="default_model" label="Default model" rules={[{ required: true, message: 'Required' }]}>
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="Select the default model"
              options={modelOptions.map((model) => ({ label: `${model.label} (${model.id})`, value: model.id }))}
            />
          </Form.Item>
        ) : isOllama && detectedModels.length > 0 ? (
          <Form.Item name="default_model" label="Default model" rules={[{ required: true, message: 'Required' }]}>
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="Select the default model"
              options={detectedModels.map((model) => ({ label: model, value: model }))}
            />
          </Form.Item>
        ) : (
          <Form.Item name="default_model" label="Default model" rules={[{ required: true, message: 'Required' }]}>
            <Input autoComplete="off" placeholder="llama3.1:8b" />
          </Form.Item>
        )}

        {supportsStaticCatalog && (
          <div style={{ marginTop: -8, marginBottom: 16 }}>
            <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
              Suggested models from the shared Seshat provider catalog.
            </Typography.Text>
            {selectedModel?.description ? (
              <Typography.Text style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
                {selectedModel.description}
              </Typography.Text>
            ) : null}
          </div>
        )}

        <Form.Item
          name="api_key"
          label="API key"
          rules={[{ required: !isEdit, message: 'Required' }]}
          extra={isEdit ? 'Leave empty to keep the current key unchanged.' : undefined}
        >
          <Input.Password autoComplete="new-password" placeholder={isEdit ? '••••••••' : undefined} />
        </Form.Item>
        {!isEdit && (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            The key is encrypted at rest and never shown again after saving.
          </Typography.Text>
        )}
      </Form>
    </Drawer>
  )
}
