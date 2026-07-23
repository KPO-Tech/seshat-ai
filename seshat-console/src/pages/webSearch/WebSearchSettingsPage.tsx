import { useEffect, useState } from 'react'
import { Button, Drawer, Form, Input, Popconfirm, Space, Tag, Typography, message } from 'antd'
import { DeleteOutlined, DownOutlined, EditOutlined, RightOutlined } from '@ant-design/icons'
import {
  useWebSearchProviderSettingsList,
  useCreateWebSearchProviderSetting,
  useUpdateWebSearchProviderSetting,
  useDeleteWebSearchProviderSetting,
  type WebSearchProviderSetting,
  type WebSearchProviderSettingInput,
} from '@/api/webSearchProviderSettings'
import { getErrorMessage } from '@/api/errors'
import { AutofillGuard } from '@/components/AutofillGuard'
import { PageHeader } from '@/components/PageHeader'
import { WebSearchProviderIcon } from '@/components/WebSearchProviderIcon'
import { useScopedOrganizationId } from '@/hooks/useOrganizationScope'
import { palette, monoStack } from '@/theme/tokens'

// requiresBaseURL/defaultBaseURL mirror seshat-backend's own provider
// catalog (internal/websearch/service.go's providerCatalog) exactly: only
// searxng (self-hosted) has a base URL to configure at all - tavily, exa,
// jina and langsearch call a single fixed hosted endpoint each (see
// seshat/internal/web/search/providers/*.go, none of which accept a
// base URL override), so showing that field for them was always a no-op.
// ddg needs no credential of any kind - it's a keyless, always-available
// fallback, not something to "Configure".
const SUPPORTED_PROVIDERS = [
  { id: 'tavily', name: 'Tavily', desc: 'AI-powered search — high-quality results', needsConfig: true, requiresBaseURL: false },
  { id: 'exa', name: 'Exa', desc: 'Neural search engine built for AI apps', needsConfig: true, requiresBaseURL: false },
  { id: 'jina', name: 'Jina', desc: 'AI-native search with a reader API', needsConfig: true, requiresBaseURL: false },
  { id: 'langsearch', name: 'LangSearch', desc: 'Free API key, AI-optimized results', needsConfig: true, requiresBaseURL: false },
  {
    id: 'searxng',
    name: 'SearXNG',
    desc: 'Self-hosted, privacy-focused meta-search',
    needsConfig: true,
    requiresBaseURL: true,
    defaultBaseURL: 'http://localhost:8080',
  },
  { id: 'ddg', name: 'DuckDuckGo', desc: 'Always-available fallback — no key needed', needsConfig: false, requiresBaseURL: false },
]

export function WebSearchSettingsPage() {
  const organizationId = useScopedOrganizationId()
  const [expanded, setExpanded] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ provider: string; setting: WebSearchProviderSetting | null } | null>(null)

  const { data } = useWebSearchProviderSettingsList(organizationId ?? undefined)
  const createSetting = useCreateWebSearchProviderSetting()
  const updateSetting = useUpdateWebSearchProviderSetting()
  const deleteSetting = useDeleteWebSearchProviderSetting()

  const settingByProvider = new Map((data ?? []).map((setting) => [setting.provider, setting]))

  return (
    <div>
      <PageHeader
        title="Web Search Settings"
        description="This organization's own web-search credentials. They override this platform's default web-search credentials when present."
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
                  <WebSearchProviderIcon provider={entry.id} size={36} />
                  <div>
                    <Typography.Text strong>{entry.name}</Typography.Text>
                    <Typography.Text style={{ display: 'block', fontSize: 12, color: palette.inkTertiary }}>
                      {entry.desc}
                    </Typography.Text>
                  </div>
                </Space>
                <Space size={10} onClick={(event) => event.stopPropagation()}>
                  {!entry.needsConfig ? (
                    <Tag color="blue" style={{ margin: 0 }}>
                      Always on
                    </Tag>
                  ) : (
                    <>
                      <Tag color={isConfigured ? 'green' : 'default'} style={{ margin: 0 }}>
                        {isConfigured ? 'Connected' : 'Not configured'}
                      </Tag>
                      {isConfigured ? (
                        <>
                          <Button
                            size="small"
                            icon={<EditOutlined />}
                            onClick={() => setEditing({ provider: entry.id, setting: setting! })}
                            aria-label={`Edit ${entry.name} credential`}
                          />
                          <Popconfirm
                            title={`Remove the ${entry.name} credential?`}
                            description="Web search jobs configured for this provider will fall back to this platform's default credentials (if any) or start failing at execution time."
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
                    </>
                  )}
                </Space>
              </div>

              {isConfigured && isExpanded && (
                <div style={{ borderTop: `1px solid ${palette.border}`, padding: '14px 18px', display: 'flex', gap: 32 }}>
                  {entry.requiresBaseURL && (
                    <div>
                      <Typography.Text style={{ display: 'block', fontSize: 11, fontWeight: 700, color: palette.inkTertiary }}>
                        BASE URL
                      </Typography.Text>
                      <Typography.Text style={{ fontFamily: monoStack, fontSize: 13 }}>
                        {setting!.base_url || entry.defaultBaseURL}
                      </Typography.Text>
                    </div>
                  )}
                  {entry.id === 'searxng' && (
                    <div>
                      <Typography.Text style={{ display: 'block', fontSize: 11, fontWeight: 700, color: palette.inkTertiary }}>
                        AUTH USERNAME
                      </Typography.Text>
                      <Typography.Text style={{ fontFamily: monoStack, fontSize: 13 }}>
                        {setting!.auth_username || 'None'}
                      </Typography.Text>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </Space>

      <WebSearchProviderFormDrawer
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

function WebSearchProviderFormDrawer({
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
  setting: WebSearchProviderSetting | null
  open: boolean
  onClose: () => void
  onSubmit: (values: Omit<WebSearchProviderSettingInput, 'organization_id'>) => void
  submitting: boolean
}) {
  const [form] = Form.useForm<Omit<WebSearchProviderSettingInput, 'organization_id'>>()
  const isEdit = setting !== null
  const isSearxng = provider === 'searxng'

  useEffect(() => {
    if (!open || !provider) return
    const defaultBaseURL = provider === 'searxng' ? 'http://localhost:8080' : ''
    form.setFieldsValue(setting ?? { provider, base_url: defaultBaseURL, auth_username: '' })
  }, [open, provider, setting, form])

  return (
    <Drawer
      key={provider ?? 'none'}
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
      <Form form={form} layout="vertical" onFinish={onSubmit} autoComplete="off">
        <AutofillGuard />
        {isSearxng && (
          <>
            <Form.Item
              name="base_url"
              label="Base URL"
              rules={[{ required: true, message: 'Required for a self-hosted SearXNG instance' }]}
            >
              <Input autoComplete="off" placeholder="http://localhost:8080" />
            </Form.Item>
            <Form.Item name="auth_username" label="Auth username" extra="Leave empty if your SearXNG instance doesn't require HTTP basic auth.">
              <Input autoComplete="off" placeholder="Optional" />
            </Form.Item>
          </>
        )}
        <Form.Item
          name="api_key"
          label={isSearxng ? 'Auth password' : 'API key'}
          rules={[{ required: !isEdit && !isSearxng, message: 'Required' }]}
          extra={
            isEdit
              ? 'Leave empty to keep the current value unchanged.'
              : isSearxng
                ? "Leave empty if your SearXNG instance doesn't require HTTP basic auth."
                : undefined
          }
        >
          <Input.Password
            autoComplete="new-password"
            placeholder={isEdit ? '••••••••' : isSearxng ? 'Optional' : undefined}
          />
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
