import { useEffect, useState } from 'react'
import { Button,
  Drawer,
  Empty,
  Form,
  Input,
  message,
  Popconfirm,
  Select,
  Space,
  Switch,
  Tag,
  Tooltip,
  Typography, } from 'antd'
import type { TableProps } from 'antd'
import { PlusOutlined,
  DeleteOutlined,
  EditOutlined,
  CloudServerOutlined,
  CheckCircleFilled,
  CloseCircleFilled, } from '@ant-design/icons'
import { useProvidersList,
  useCreateProvider,
  useUpdateProvider,
  useDeleteProvider,
  type Provider,
  type ProviderInput, } from '@/api/providers'
import { getErrorMessage } from '@/api/errors'
import { PageHeader } from '@/components/PageHeader'
import { ConsoleTable } from '@/components/ConsoleTable'
import { useScopedOrganizationId } from '@/hooks/useOrganizationScope'
import { palette } from '@/theme/tokens'
import { presentText } from '@/lib/present'

const PAGE_SIZE = 20

// HealthBadge reflects whether a login through this connection has ever
// actually completed - separate from "enabled" (which only says the
// connection is turned on, not that it works). Only OIDC/SAML providers
// carry this signal today: it's updated at the end of CompleteOIDCLogin/
// CompleteSAMLLogin, so an OAuth2-kind provider (no login flow of its own
// yet) always shows "No activity yet".
function HealthBadge({ provider }: { provider: Provider }) {
  if (provider.last_login_success === undefined || provider.last_login_success === null) {
    return <Tag style={{ margin: 0 }}>No activity yet</Tag>
  }
  const label = provider.last_login_at ? new Date(provider.last_login_at).toLocaleString() : ''
  return provider.last_login_success ? (
    <Tooltip title={label ? `Last login succeeded ${label}` : 'Last login succeeded'}>
      <Tag color="green" icon={<CheckCircleFilled />} style={{ margin: 0 }}>
        Healthy
      </Tag>
    </Tooltip>
  ) : (
    <Tooltip title={[label ? `Last login failed ${label}` : 'Last login failed', provider.last_error].filter(Boolean).join(' — ')}>
      <Tag color="red" icon={<CloseCircleFilled />} style={{ margin: 0 }}>
        Last login failed
      </Tag>
    </Tooltip>
  )
}

export function ProvidersPage() { const organizationId = useScopedOrganizationId()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<{ field: string; order: 'asc' | 'desc' }>({ field: 'name', order: 'asc' })
  const [editing, setEditing] = useState<Provider | 'new' | null>(null)

  const { data, isLoading, isFetching, error } = useProvidersList(organizationId ?? undefined, { q: search || undefined,
    sort: sort.field,
    order: sort.order,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE, })
  const createProvider = useCreateProvider()
  const updateProvider = useUpdateProvider()
  const deleteProvider = useDeleteProvider()

  const handleTableChange: TableProps<Provider>['onChange'] = (_pagination, _filters, sorter) => {
    const single = Array.isArray(sorter) ? sorter[0] : sorter
    if (single?.field && single.order) {
      setSort({ field: String(single.field), order: single.order === 'ascend' ? 'asc' : 'desc' })
    }
  }

  const columns: TableProps<Provider>['columns'] = [
    { title: 'Name',
      dataIndex: 'name',
      key: 'name',
      sorter: true,
      render: (name: string, record) => (
        <div>
          <div style={{ fontWeight: 500 }}>{name}</div>
          <Typography.Text style={{ fontSize: 12, color: palette.inkTertiary }}>{record.slug}</Typography.Text>
        </div>
      ), },
    { title: 'Kind',
      dataIndex: 'kind',
      key: 'kind',
      width: 100,
      sorter: true,
      render: (kind: string) => <Tag>{kind?.toUpperCase()}</Tag>, },
    { title: 'Status',
      dataIndex: 'enabled',
      key: 'enabled',
      width: 100,
      sorter: true,
      render: (enabled: boolean) => (enabled ? <Tag color="green">Enabled</Tag> : <Tag>Disabled</Tag>), },
    { title: 'Health', key: 'health', width: 150, render: (_, record) => <HealthBadge provider={record} /> },
    { title: 'Issuer / Metadata', key: 'issuer', render: (_, record) => presentText(record.issuer_url || record.metadata_url, 'Not configured') },
    { title: '',
      key: 'actions',
      width: 96,
      render: (_, record) => (
        <Space>
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => setEditing(record)}
            aria-label={`Edit ${record.name}`}
          />
          <Popconfirm
            title={`Delete ${record.name}?`}
            description="Fails while any application still references this provider."
            onConfirm={() =>
              deleteProvider.mutate(record.id!, { onError: (error) => message.error(getErrorMessage(error)), }) }
          >
            <Button size="small" danger icon={<DeleteOutlined />} aria-label={`Delete ${record.name}`} />
          </Popconfirm>
        </Space>
      ), },
  ]

  return (
    <div>
      <PageHeader
        title="Identity Providers"
        description="Upstream identity providers (OIDC/OAuth2/SAML) this organization trusts."
        actions={ <Space>
            <Input.Search
              placeholder="Search providers"
              allowClear
              onSearch={(value) => { setPage(1)
                setSearch(value) }}
              style={{ width: 220 }}
              disabled={!organizationId}
            />
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setEditing('new')}
              disabled={!organizationId}
            >
              New provider
            </Button>
          </Space> }
      />

      <ConsoleTable<Provider>
          rowKey="id"
          columns={columns}
          dataSource={data?.providers ?? []}
          loading={isLoading || isFetching}
          queryError={error}
          onChange={handleTableChange}
          locale={{ emptyText: (
              <Empty
                image={<CloudServerOutlined style={{ fontSize: 32, color: palette.inkTertiary }} />}
                description={search ? 'No providers match your search' : 'No providers yet'}
                style={{ padding: '32px 0' }}
              />
            ), }}
          pagination={{ current: page,
            pageSize: PAGE_SIZE,
            total: data?.total ?? 0,
            onChange: setPage,
            showTotal: (total) => `${total} providers`, }}
        />

      <ProviderFormDrawer
        provider={editing === 'new' ? null : editing}
        open={editing !== null}
        onClose={() => setEditing(null)}
        onSubmit={(values) => { if (!organizationId) return
          if (editing === 'new') { createProvider.mutate(
              { ...values, organization_id: organizationId },
              { onSuccess: () => setEditing(null),
                onError: (error) => message.error(getErrorMessage(error)), },
            ) } else if (editing) { updateProvider.mutate(
              { id: editing.id!, body: values },
              { onSuccess: () => setEditing(null),
                onError: (error) => message.error(getErrorMessage(error)), },
            ) } }}
        submitting={createProvider.isPending || updateProvider.isPending}
      />
    </div>
  ) }

function ProviderFormDrawer({ provider,
  open,
  onClose,
  onSubmit,
  submitting, }: { provider: Provider | null
  open: boolean
  onClose: () => void
  onSubmit: (values: Omit<ProviderInput, 'organization_id'>) => void
  submitting: boolean }) { const [form] = Form.useForm<ProviderInput>()
  const kind = Form.useWatch('kind', form)

  useEffect(() => { if (open) { form.setFieldsValue(
        provider ?? { name: '',
          slug: '',
          kind: 'oidc',
          enabled: true,
          allow_signup: true,
          allow_auto_link: false,
          pkce_required: false, },
      ) } }, [open, provider, form])

  const isSaml = kind === 'saml'

  return (
    <Drawer
      title={provider ? `Edit ${provider.name}` : 'New provider'}
      open={open}
      onClose={onClose}
      destroyOnHidden
      size={480}
      extra={ <Button type="primary" loading={submitting} onClick={() => form.submit()}>
          Save
        </Button> }
    >
      <Form<ProviderInput> form={form} layout="vertical" onFinish={onSubmit}>
        <Form.Item name="name" label="Name" rules={[{ required: true, message: 'Required' }]}>
          <Input />
        </Form.Item>
        <Form.Item
          name="slug"
          label="Slug"
          rules={[{ required: true, pattern: /^[a-z0-9-]+$/, message: 'Lowercase letters, digits, hyphens' }]}
        >
          <Input />
        </Form.Item>
        <Form.Item name="kind" label="Kind" rules={[{ required: true }]}>
          <Select
            options={[
              { value: 'oidc', label: 'OIDC' },
              { value: 'oauth2', label: 'OAuth2' },
              { value: 'saml', label: 'SAML' },
            ]}
          />
        </Form.Item>
        <Form.Item name="enabled" label="Enabled" valuePropName="checked">
          <Switch />
        </Form.Item>

        {!isSaml && (
          <>
            <Form.Item name="client_id" label="Client ID" rules={[{ required: true, message: 'Required for OIDC/OAuth2 providers' }]}>
              <Input />
            </Form.Item>
            <Form.Item name="client_secret" label="Client secret" extra="Write-only. Never echoed back by the API.">
              <Input.Password autoComplete="new-password" placeholder={provider ? 'Unchanged' : undefined} />
            </Form.Item>
            <Form.Item name="issuer_url" label="Issuer URL">
              <Input placeholder="https://" />
            </Form.Item>
            <Form.Item name="discovery_url" label="Discovery URL">
              <Input placeholder="https://.../.well-known/openid-configuration" />
            </Form.Item>
            <Form.Item name="authorization_url" label="Authorization URL">
              <Input placeholder="https://" />
            </Form.Item>
            <Form.Item name="token_url" label="Token URL">
              <Input placeholder="https://" />
            </Form.Item>
            <Form.Item name="userinfo_url" label="Userinfo URL">
              <Input placeholder="https://" />
            </Form.Item>
            <Form.Item name="jwks_url" label="JWKS URL">
              <Input placeholder="https://" />
            </Form.Item>
          </>
        )}

        {isSaml && (
          <>
            <Form.Item name="metadata_url" label="Metadata URL">
              <Input placeholder="https://" />
            </Form.Item>
            <Form.Item name="entity_id" label="Entity ID">
              <Input />
            </Form.Item>
            <Form.Item name="sso_url" label="SSO URL">
              <Input placeholder="https://" />
            </Form.Item>
            <Form.Item name="x509_certificate" label="x509 certificate" extra="Public verification certificate. It is not a secret.">
              <Input.TextArea rows={4} />
            </Form.Item>
          </>
        )}

        <Form.Item name="scopes" label="Scopes">
          <Select mode="tags" open={false} placeholder="openid, profile, email, ..." />
        </Form.Item>
        <Form.Item name="allowed_domains" label="Allowed domains">
          <Select mode="tags" open={false} placeholder="Restrict signup/link to these email domains" />
        </Form.Item>
        <Form.Item name="allow_signup" label="Allow signup" valuePropName="checked">
          <Switch />
        </Form.Item>
        <Form.Item name="allow_auto_link" label="Auto-link existing accounts by email" valuePropName="checked">
          <Switch />
        </Form.Item>
        {!isSaml && (
          <Form.Item name="pkce_required" label="Require PKCE" valuePropName="checked">
            <Switch />
          </Form.Item>
        )}
      </Form>
    </Drawer>
  ) }
