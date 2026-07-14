import { useEffect, useMemo, useState } from 'react'
import { Button, Drawer, Form, Input, Select, message, Popconfirm, Space, Tag, Typography } from 'antd'
import { CrownOutlined, DeleteOutlined, DownOutlined, EditOutlined, RightOutlined } from '@ant-design/icons'
import {
  useProviderSettingsList,
  useCreateProviderSetting,
  useUpdateProviderSetting,
  useDeleteProviderSetting,
  useSetProviderSettingDefault,
  type ProviderSetting,
  type ProviderSettingInput,
} from '@/api/providerSettings'
import { getErrorMessage } from '@/api/errors'
import { PageHeader } from '@/components/PageHeader'
import { ProviderIcon } from '@/components/ProviderIcon'
import { useScopedOrganizationId } from '@/hooks/useOrganizationScope'
import { getProviderModels } from '@/lib/providerCatalog'
import { palette, monoStack } from '@/theme/tokens'

const SUPPORTED_PROVIDERS = [
  { id: 'anthropic', name: 'Anthropic', desc: 'Claude models — coding, reasoning, agents' },
  { id: 'openai', name: 'OpenAI', desc: 'GPT models — pay-per-use API key' },
  { id: 'mistral', name: 'Mistral AI', desc: 'Open & efficient European models' },
  { id: 'gemini', name: 'Google Gemini', desc: 'Massive context windows' },
  { id: 'z-ai', name: 'Z.ai', desc: 'GLM models' },
  { id: 'minimax', name: 'MiniMax', desc: 'Agentic, long-context models' },
  { id: 'openrouter', name: 'OpenRouter', desc: '300+ models through one API key' },
  { id: 'ollama', name: 'Ollama', desc: 'Run models locally on your own infrastructure' },
]

const PROVIDER_DEFAULT_URLS: Record<string, string> = {
  anthropic: 'https://api.anthropic.com',
  openai: 'https://api.openai.com/v1',
  mistral: 'https://api.mistral.ai/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta',
  'z-ai': 'https://api.z.ai/api/paas/v4',
  minimax: 'https://api.minimax.chat/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  ollama: 'http://localhost:11434',
}

export function ProviderSettingsPage() {
  const organizationId = useScopedOrganizationId()
  const [expanded, setExpanded] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ provider: string; setting: ProviderSetting | null } | null>(null)

  const { data } = useProviderSettingsList(organizationId ?? undefined)
  const createSetting = useCreateProviderSetting()
  const updateSetting = useUpdateProviderSetting()
  const deleteSetting = useDeleteProviderSetting()
  const setDefault = useSetProviderSettingDefault()

  const settingByProvider = new Map((data ?? []).map((setting) => [setting.provider, setting]))

  return (
    <div>
      <PageHeader
        title="Provider Settings"
        description="This organization's own LLM credentials. They override this platform's default organization's credentials when present."
      />

      <Space orientation="vertical" size={12} style={{ width: '100%' }}>
        {SUPPORTED_PROVIDERS.map((entry) => {
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
        providerName={SUPPORTED_PROVIDERS.find((p) => p.id === editing?.provider)?.name ?? ''}
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
  const isEdit = setting !== null
  const modelOptions = useMemo(() => getProviderModels(provider, setting?.default_model), [provider, setting?.default_model])
  const selectedModel = modelOptions.find((model) => model.id === watchedModelId) ?? null
  const supportsStaticCatalog = modelOptions.length > 0

  useEffect(() => {
    if (!open || !provider) return
    const fallbackModel = setting?.default_model ?? modelOptions[0]?.id ?? ''
    form.setFieldsValue(
      setting ?? { provider, default_model: fallbackModel, base_url: PROVIDER_DEFAULT_URLS[provider] ?? '' },
    )
  }, [open, provider, setting, form, modelOptions])

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
      <Form key={provider ?? 'none'} form={form} layout="vertical" onFinish={onSubmit}>
        {supportsStaticCatalog ? (
          <Form.Item name="default_model" label="Default model" rules={[{ required: true, message: 'Required' }]}>
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="Select the default model"
              options={modelOptions.map((model) => ({ label: `${model.label} (${model.id})`, value: model.id }))}
            />
          </Form.Item>
        ) : (
          <Form.Item name="default_model" label="Default model" rules={[{ required: true, message: 'Required' }]}>
            <Input placeholder="llama3.1:8b" />
          </Form.Item>
        )}

        {supportsStaticCatalog ? (
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
        ) : (
          <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: -8, marginBottom: 16 }}>
            This provider has no static catalog here yet. For Ollama, keep using a direct model identifier available on the target runtime.
          </Typography.Text>
        )}

        <Form.Item name="base_url" label="Base URL">
          <Input placeholder="Leave empty to use the provider's default" />
        </Form.Item>
        <Form.Item
          name="api_key"
          label="API key"
          rules={[{ required: !isEdit, message: 'Required' }]}
          extra={isEdit ? 'Leave empty to keep the current key unchanged.' : undefined}
        >
          <Input.Password autoComplete="off" placeholder={isEdit ? '••••••••' : undefined} />
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
