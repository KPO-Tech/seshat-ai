import { useEffect, useState } from 'react'
import { Alert,
  Button,
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
  Typography, } from 'antd'
import type { TableProps } from 'antd'
import { PlusOutlined, DeleteOutlined, EditOutlined, AppstoreOutlined, CopyOutlined } from '@ant-design/icons'
import { useApplicationsList,
  useCreateApplication,
  useUpdateApplication,
  useDeleteApplication,
  type Application,
  type ApplicationInput, } from '@/api/applications'
import { getErrorMessage } from '@/api/errors'
import { PageHeader } from '@/components/PageHeader'
import { ConsoleTable } from '@/components/ConsoleTable'
import { useScopedOrganizationId } from '@/hooks/useOrganizationScope'
import { palette } from '@/theme/tokens'
import { presentText } from '@/lib/present'

const PAGE_SIZE = 20

export function ApplicationsPage() { const organizationId = useScopedOrganizationId()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<{ field: string; order: 'asc' | 'desc' }>({ field: 'name', order: 'asc' })
  const [editing, setEditing] = useState<Application | 'new' | null>(null)
  const [createdSecret, setCreatedSecret] = useState<{ name: string; clientId: string; clientSecret: string } | null>(
    null,
  )

  const { data, isLoading, isFetching, error } = useApplicationsList(organizationId ?? undefined, { q: search || undefined,
    sort: sort.field,
    order: sort.order,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE, })
  const createApp = useCreateApplication()
  const updateApp = useUpdateApplication()
  const deleteApp = useDeleteApplication()

  const handleTableChange: TableProps<Application>['onChange'] = (_pagination, _filters, sorter) => {
    const single = Array.isArray(sorter) ? sorter[0] : sorter
    if (single?.field && single.order) {
      setSort({ field: String(single.field), order: single.order === 'ascend' ? 'asc' : 'desc' })
    }
  }

  const columns: TableProps<Application>['columns'] = [
    { title: 'Name',
      dataIndex: 'name',
      key: 'name',
      sorter: true,
      render: (name: string, record) => (
        <div>
          <div style={{ fontWeight: 500 }}>{record.display_name || name}</div>
          <Typography.Text style={{ fontSize: 12, color: palette.inkTertiary }}>{record.slug}</Typography.Text>
        </div>
      ), },
    { title: 'Protocol',
      dataIndex: 'protocol',
      key: 'protocol',
      width: 100,
      sorter: true,
      render: (protocol: string) => <Tag>{protocol?.toUpperCase()}</Tag>, },
    { title: 'Status',
      dataIndex: 'enabled',
      key: 'enabled',
      width: 100,
      sorter: true,
      render: (enabled: boolean) => (enabled ? <Tag color="green">Enabled</Tag> : <Tag>Disabled</Tag>), },
    { title: 'Client ID', dataIndex: 'client_id', key: 'client_id', render: (v) => presentText(v, 'Issued after setup') },
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
            description="This revokes any sessions issued through this application."
            onConfirm={() =>
              deleteApp.mutate(record.id!, { onError: (error) => message.error(getErrorMessage(error)), }) }
          >
            <Button size="small" danger icon={<DeleteOutlined />} aria-label={`Delete ${record.name}`} />
          </Popconfirm>
        </Space>
      ), },
  ]

  return (
    <div>
      <PageHeader
        actions={ <Space>
            <Input.Search
              placeholder="Search applications"
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
              New application
            </Button>
          </Space> }
      />

      <ConsoleTable<Application>
          rowKey="id"
          columns={columns}
          dataSource={data?.applications ?? []}
          loading={isLoading || isFetching}
          queryError={error}
          onChange={handleTableChange}
          locale={{ emptyText: (
              <Empty
                image={<AppstoreOutlined style={{ fontSize: 32, color: palette.inkTertiary }} />}
                description={search ? 'No applications match your search' : 'No applications yet'}
                style={{ padding: '32px 0' }}
              />
            ), }}
          pagination={{ current: page,
            pageSize: PAGE_SIZE,
            total: data?.total ?? 0,
            onChange: setPage,
            showTotal: (total) => `${total} applications`, }}
        />

      <ApplicationFormDrawer
        application={editing === 'new' ? null : editing}
        open={editing !== null}
        onClose={() => setEditing(null)}
        onSubmit={(values) => { if (!organizationId) return
          if (editing === 'new') { createApp.mutate(
              { ...values, organization_id: organizationId },
              { onSuccess: (created) => { setEditing(null)
                  if (created?.client_id && created?.client_secret) { setCreatedSecret({ name: created.name ?? values.name,
                      clientId: created.client_id,
                      clientSecret: created.client_secret, }) } },
                onError: (error) => message.error(getErrorMessage(error)), },
            ) } else if (editing) { updateApp.mutate(
              { id: editing.id!, body: values },
              { onSuccess: () => setEditing(null),
                onError: (error) => message.error(getErrorMessage(error)), },
            ) } }}
        submitting={createApp.isPending || updateApp.isPending}
      />

      <Drawer
        title={`${createdSecret?.name ?? 'Application'} credentials`}
        open={createdSecret !== null}
        onClose={() => setCreatedSecret(null)}
        size={480}
      >
        <Alert
          type="warning"
          showIcon
          title="This client secret is shown only once"
          description="Copy it now and store it securely. It is redacted everywhere else, including this page after you close it."
          style={{ marginBottom: 16 }}
        />
        <Typography.Paragraph>
          <Typography.Text strong>Client ID</Typography.Text>
          <br />
          <Typography.Text copyable={{ icon: <CopyOutlined /> }} code>
            {createdSecret?.clientId}
          </Typography.Text>
        </Typography.Paragraph>
        <Typography.Paragraph>
          <Typography.Text strong>Client secret</Typography.Text>
          <br />
          <Typography.Text copyable={{ icon: <CopyOutlined /> }} code>
            {createdSecret?.clientSecret}
          </Typography.Text>
        </Typography.Paragraph>
      </Drawer>
    </div>
  ) }

function ApplicationFormDrawer({ application,
  open,
  onClose,
  onSubmit,
  submitting, }: { application: Application | null
  open: boolean
  onClose: () => void
  onSubmit: (values: Omit<ApplicationInput, 'organization_id'>) => void
  submitting: boolean }) { const [form] = Form.useForm<ApplicationInput>()

  useEffect(() => { if (open) { form.setFieldsValue(
        application ?? { name: '',
          slug: '',
          display_name: '',
          protocol: 'oidc',
          enabled: true,
          allow_signup: true,
          allow_password_login: true,
          pkce_required: false,
          skip_consent: false,
          issue_refresh_token: true, },
      ) } }, [open, application, form])

  return (
    <Drawer
      title={application ? `Edit ${application.name}` : 'New application'}
      open={open}
      onClose={onClose}
      destroyOnHidden
      size={480}
      extra={ <Button type="primary" loading={submitting} onClick={() => form.submit()}>
          Save
        </Button> }
    >
      <Form<ApplicationInput> form={form} layout="vertical" onFinish={onSubmit}>
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
        <Form.Item name="display_name" label="Display name" rules={[{ required: true, message: 'Required' }]}>
          <Input />
        </Form.Item>
        <Form.Item name="description" label="Description">
          <Input.TextArea rows={2} />
        </Form.Item>
        <Form.Item name="protocol" label="Protocol" rules={[{ required: true }]}>
          <Select
            options={[
              { value: 'oidc', label: 'OIDC' },
              { value: 'oauth2', label: 'OAuth2' },
            ]}
          />
        </Form.Item>
        <Form.Item name="homepage_url" label="Homepage URL">
          <Input placeholder="https://" />
        </Form.Item>
        <Form.Item name="callback_url" label="Callback URL">
          <Input placeholder="https://" />
        </Form.Item>
        <Form.Item name="redirect_urls" label="Redirect URLs">
          <Select mode="tags" open={false} placeholder="Press enter to add a URL" />
        </Form.Item>
        <Form.Item name="scopes" label="Scopes">
          <Select mode="tags" open={false} placeholder="openid, profile, email, ..." />
        </Form.Item>
        <Form.Item name="enabled" label="Enabled" valuePropName="checked">
          <Switch />
        </Form.Item>
        <Form.Item name="allow_signup" label="Allow signup" valuePropName="checked">
          <Switch />
        </Form.Item>
        <Form.Item name="allow_password_login" label="Allow password login" valuePropName="checked">
          <Switch />
        </Form.Item>
        <Form.Item name="pkce_required" label="Require PKCE" valuePropName="checked">
          <Switch />
        </Form.Item>
        <Form.Item name="issue_refresh_token" label="Issue refresh token" valuePropName="checked">
          <Switch />
        </Form.Item>
      </Form>
    </Drawer>
  ) }
