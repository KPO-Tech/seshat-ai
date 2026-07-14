import { useEffect, useState } from 'react'
import {
  Avatar,
  Button,
  Card,
  Drawer,
  Empty,
  Form,
  Input,
  message,
  Popconfirm,
  Space,
  Tag,
  Typography,
} from 'antd'
import type { TableProps } from 'antd'
import {
  ApartmentOutlined,
  DeleteOutlined,
  EditOutlined,
  GlobalOutlined,
  MailOutlined,
  PlusOutlined,
  RightOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import {
  useOrganizationsList,
  useCreateOrganization,
  useUpdateOrganization,
  useDeleteOrganization,
  type Organization,
  type OrganizationInput,
} from '@/api/organizations'
import { getErrorMessage } from '@/api/errors'
import { PageHeader } from '@/components/PageHeader'
import { ConsoleTable } from '@/components/ConsoleTable'
import { StatTile } from '@/components/StatTile'
import { presentDateTime, presentText } from '@/lib/present'
import { palette } from '@/theme/tokens'

const PAGE_SIZE = 20

function hasValue(value: string | null | undefined) {
  return Boolean(value && value.trim().length > 0)
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function getOrganizationProfile(org: Organization) {
  const missing: string[] = []
  if (!hasValue(org.description)) missing.push('Description')
  if (!hasValue(org.website_url)) missing.push('Website')
  if (!hasValue(org.support_email)) missing.push('Support')

  return {
    missing,
    isReady: missing.length === 0,
    completionCount: 3 - missing.length,
  }
}

export function OrganizationsPage() {
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<{ field: string; order: 'asc' | 'desc' }>({
    field: 'name',
    order: 'asc',
  })
  const [editing, setEditing] = useState<Organization | 'new' | null>(null)

  const { data, isLoading, isFetching } = useOrganizationsList({
    q: search || undefined,
    sort: sort.field,
    order: sort.order,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  })
  const createOrg = useCreateOrganization()
  const updateOrg = useUpdateOrganization()
  const deleteOrg = useDeleteOrganization()

  const organizations = data?.organizations ?? []
  const organizationsWithWebsite = organizations.filter((org) => hasValue(org.website_url)).length
  const organizationsWithSupport = organizations.filter((org) => hasValue(org.support_email)).length
  const organizationsNeedingAttention = organizations.filter((org) => !getOrganizationProfile(org).isReady).length

  const handleTableChange: TableProps<Organization>['onChange'] = (_pagination, _filters, sorter) => {
    const single = Array.isArray(sorter) ? sorter[0] : sorter
    if (single?.field && single.order) {
      setSort({
        field: String(single.field),
        order: single.order === 'ascend' ? 'asc' : 'desc',
      })
    }
  }

  const columns: TableProps<Organization>['columns'] = [
    {
      title: 'Organization',
      dataIndex: 'name',
      key: 'name',
      sorter: true,
      render: (name: string, record) => {
        const profile = getOrganizationProfile(record)
        return (
          <Space align="start" size={12}>
            <Avatar
              size={32}
              style={{ background: palette.accentSoft, color: palette.accent, fontWeight: 700, fontSize: 12 }}
            >
              {name?.slice(0, 2).toUpperCase()}
            </Avatar>
            <div style={{ minWidth: 0 }}>
              <Typography.Text strong style={{ display: 'block' }}>
                {name}
              </Typography.Text>
              <Typography.Text style={{ fontSize: 12, color: palette.inkTertiary }}>
                /{record.slug}
              </Typography.Text>
              <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Tag color={profile.isReady ? 'green' : 'orange'} style={{ margin: 0 }}>
                  {profile.isReady ? 'Ready' : `${profile.completionCount}/3 complete`}
                </Tag>
              </div>
            </div>
          </Space>
        )
      },
    },
    {
      title: 'Details',
      key: 'details',
      render: (_, record) => (
        <div style={{ minWidth: 240 }}>
          <Typography.Text style={{ display: 'block', color: palette.inkSecondary }}>
            {presentText(record.description, 'No description yet')}
          </Typography.Text>
          <Typography.Text style={{ display: 'block', marginTop: 6, fontSize: 12, color: palette.inkTertiary }}>
            Updated {presentDateTime(record.updated_at, 'Unknown')}
          </Typography.Text>
        </div>
      ),
    },
    {
      title: 'Contact',
      key: 'contact',
      render: (_, record) => (
        <div>
          <Typography.Text style={{ display: 'block', color: palette.inkSecondary }}>
            {presentText(record.support_email, 'No support email')}
          </Typography.Text>
          <Typography.Text style={{ display: 'block', marginTop: 6, fontSize: 12, color: palette.inkTertiary }}>
            {presentText(record.website_url, 'No website')}
          </Typography.Text>
        </div>
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 156,
      render: (_, record) => (
        <Space>
          <Button size="small" onClick={() => navigate(`/orgs/${record.id}/overview`)} icon={<RightOutlined />}>
            Open
          </Button>
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={(event) => {
              event.stopPropagation()
              setEditing(record)
            }}
            aria-label={`Edit ${record.name}`}
          />
          <Popconfirm
            title={`Delete ${record.name}?`}
            description="This cascades everything scoped to this organization."
            onConfirm={(event) => {
              event?.stopPropagation()
              deleteOrg.mutate(record.id!, {
                onError: (error) => message.error(getErrorMessage(error)),
              })
            }}
          >
            <Button
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={(event) => event.stopPropagation()}
              aria-label={`Delete ${record.name}`}
            />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Organizations"
        description="Create and manage the companies that use your Seshat platform."
        actions={
          <Space>
            <Input.Search
              placeholder="Search organizations"
              allowClear
              onSearch={(value) => {
                setPage(1)
                setSearch(value)
              }}
              style={{ width: 260 }}
            />
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing('new')}>
              New organization
            </Button>
          </Space>
        }
      />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 16,
          marginBottom: 24,
        }}
      >
        <StatTile label="Organizations" value={data?.total} loading={isLoading} icon={<ApartmentOutlined />} />
        <StatTile label="With website" value={organizationsWithWebsite} loading={isLoading} icon={<GlobalOutlined />} />
        <StatTile label="With support" value={organizationsWithSupport} loading={isLoading} icon={<MailOutlined />} />
        <StatTile
          label="Need details"
          value={organizationsNeedingAttention}
          loading={isLoading}
          icon={<WarningOutlined />}
        />
      </div>

      <Card title="All organizations" styles={{ body: { padding: 0 } }}>
        <ConsoleTable<Organization>
          rowKey="id"
          columns={columns}
          dataSource={organizations}
          loading={isLoading || isFetching}
          onChange={handleTableChange}
          onRow={(record) => ({
            onClick: () => navigate(`/orgs/${record.id}/overview`),
            style: { cursor: 'pointer' },
          })}
          locale={{
            emptyText: (
              <Empty
                image={<ApartmentOutlined style={{ fontSize: 32, color: palette.inkTertiary }} />}
                description={search ? 'No organizations match your search' : 'No organizations yet'}
                style={{ padding: '40px 0' }}
              />
            ),
          }}
          pagination={{
            current: page,
            pageSize: PAGE_SIZE,
            total: data?.total ?? 0,
            onChange: setPage,
            showTotal: (total) => `${total} organizations`,
          }}
        />
      </Card>

      <OrganizationFormDrawer
        organization={editing === 'new' ? null : editing}
        open={editing !== null}
        onClose={() => setEditing(null)}
        onSubmit={(values) => {
          if (editing === 'new') {
            createOrg.mutate(values, {
              onSuccess: () => setEditing(null),
              onError: (error) => message.error(getErrorMessage(error)),
            })
          } else if (editing) {
            updateOrg.mutate(
              { id: editing.id!, body: values },
              {
                onSuccess: () => setEditing(null),
                onError: (error) => message.error(getErrorMessage(error)),
              },
            )
          }
        }}
        submitting={createOrg.isPending || updateOrg.isPending}
      />
    </div>
  )
}

function OrganizationFormDrawer({
  organization,
  open,
  onClose,
  onSubmit,
  submitting,
}: {
  organization: Organization | null
  open: boolean
  onClose: () => void
  onSubmit: (values: OrganizationInput) => void
  submitting: boolean
}) {
  const [form] = Form.useForm<OrganizationInput>()
  const [slugTouched, setSlugTouched] = useState(false)

  useEffect(() => {
    if (open) {
      form.setFieldsValue(organization ?? { name: '', slug: '' })
      setSlugTouched(Boolean(organization?.slug))
    }
  }, [open, organization, form])

  return (
    <Drawer
      title={organization ? `Edit ${organization.name}` : 'New organization'}
      open={open}
      onClose={onClose}
      destroyOnHidden
      size={720}
      extra={
        <Button type="primary" loading={submitting} onClick={() => form.submit()}>
          Save
        </Button>
      }
    >
      <Form<OrganizationInput>
        form={form}
        layout="vertical"
        onValuesChange={(changedValues) => {
          if (organization || slugTouched) return
          if (typeof changedValues.name === 'string') {
            form.setFieldValue('slug', slugify(changedValues.name))
          }
        }}
        onFinish={onSubmit}
      >
        <Form.Item name="name" label="Name" rules={[{ required: true, message: 'Required' }]}>
          <Input placeholder="Acme" />
        </Form.Item>
        <Form.Item
          name="slug"
          label="Slug"
          rules={[{ required: true, pattern: /^[a-z0-9-]+$/, message: 'Lowercase letters, digits, hyphens' }]}
          extra="Used in URLs and internal routing."
        >
          <Input placeholder="acme" onChange={() => setSlugTouched(true)} />
        </Form.Item>
        <Form.Item name="description" label="Description">
          <Input.TextArea rows={3} placeholder="What this organization is for." />
        </Form.Item>
        <Form.Item name="website_url" label="Website">
          <Input placeholder="https://example.com" />
        </Form.Item>
        <Form.Item name="support_email" label="Support email" rules={[{ type: 'email' }]}>
          <Input placeholder="support@example.com" />
        </Form.Item>
      </Form>
    </Drawer>
  )
}
