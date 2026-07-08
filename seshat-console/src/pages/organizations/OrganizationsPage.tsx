import { useState } from 'react'
import { Button, Drawer, Form, Input, message, Popconfirm, Space, Table, Typography } from 'antd'
import type { TableProps } from 'antd'
import { PlusOutlined, DeleteOutlined, EditOutlined } from '@ant-design/icons'
import {
  useOrganizationsList,
  useCreateOrganization,
  useUpdateOrganization,
  useDeleteOrganization,
  type Organization,
  type OrganizationInput,
} from '@/api/organizations'
import { getErrorMessage } from '@/api/errors'

const PAGE_SIZE = 20

export function OrganizationsPage() {
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

  const handleTableChange: TableProps<Organization>['onChange'] = (_pagination, _filters, sorter) => {
    const single = Array.isArray(sorter) ? sorter[0] : sorter
    if (single?.field && single.order) {
      setSort({ field: String(single.field), order: single.order === 'ascend' ? 'asc' : 'desc' })
    }
  }

  const columns: TableProps<Organization>['columns'] = [
    { title: 'Name', dataIndex: 'name', key: 'name', sorter: true },
    { title: 'Slug', dataIndex: 'slug', key: 'slug', sorter: true },
    { title: 'Website', dataIndex: 'website_url', key: 'website_url' },
    { title: 'Support email', dataIndex: 'support_email', key: 'support_email' },
    {
      title: '',
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
            description="This cascades everything scoped to this organization."
            onConfirm={() =>
              deleteOrg.mutate(record.id!, {
                onError: (error) => message.error(getErrorMessage(error)),
              })
            }
          >
            <Button size="small" danger icon={<DeleteOutlined />} aria-label={`Delete ${record.name}`} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          Organizations
        </Typography.Title>
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
      </Space>

      <Table<Organization>
        rowKey="id"
        columns={columns}
        dataSource={data?.organizations ?? []}
        loading={isLoading || isFetching}
        onChange={handleTableChange}
        pagination={{
          current: page,
          pageSize: PAGE_SIZE,
          total: data?.total ?? 0,
          onChange: setPage,
          showTotal: (total) => `${total} organizations`,
        }}
      />

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

  return (
    <Drawer
      title={organization ? `Edit ${organization.name}` : 'New organization'}
      open={open}
      onClose={onClose}
      destroyOnHidden
      afterOpenChange={(isOpen) => {
        if (isOpen) form.setFieldsValue(organization ?? { name: '', slug: '' })
      }}
      extra={
        <Button type="primary" loading={submitting} onClick={() => form.submit()}>
          Save
        </Button>
      }
    >
      <Form<OrganizationInput> form={form} layout="vertical" onFinish={onSubmit}>
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
        <Form.Item name="description" label="Description">
          <Input.TextArea rows={3} />
        </Form.Item>
        <Form.Item name="website_url" label="Website">
          <Input />
        </Form.Item>
        <Form.Item name="support_email" label="Support email" rules={[{ type: 'email' }]}>
          <Input />
        </Form.Item>
      </Form>
    </Drawer>
  )
}
