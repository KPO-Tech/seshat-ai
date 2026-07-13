import { useEffect, useState } from 'react'
import { Alert, Button, Drawer, Empty, Form, Input, message, Popconfirm, Space, Table, Typography } from 'antd'
import type { TableProps } from 'antd'
import { PlusOutlined, DeleteOutlined, EditOutlined, ClusterOutlined } from '@ant-design/icons'
import {
  useGroupsList,
  useCreateGroup,
  useUpdateGroup,
  useDeleteGroup,
  type Group,
  type GroupInput,
  type GroupUpdateInput,
} from '@/api/groups'
import { getErrorMessage } from '@/api/errors'
import { PageHeader } from '@/components/PageHeader'
import { OrganizationPicker } from '@/components/OrganizationPicker'
import { UserMultiSelect } from '@/components/UserSelect'
import { useConsoleOrgStore } from '@/store/consoleOrg'
import { palette } from '@/theme/tokens'

const PAGE_SIZE = 20

export function GroupsPage() {
  const organizationId = useConsoleOrgStore((s) => s.organizationId)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<Group | 'new' | null>(null)

  const { data, isLoading, isFetching } = useGroupsList(organizationId ?? undefined, {
    q: search || undefined,
    sort: 'name',
    order: 'asc',
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  })
  const createGroup = useCreateGroup()
  const updateGroup = useUpdateGroup()
  const deleteGroup = useDeleteGroup()

  const columns: TableProps<Group>['columns'] = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record) => (
        <div>
          <div style={{ fontWeight: 500 }}>{name}</div>
          <Typography.Text style={{ fontSize: 12, color: palette.inkTertiary }}>{record.slug}</Typography.Text>
        </div>
      ),
    },
    {
      title: 'Members',
      dataIndex: 'member_user_ids',
      key: 'member_user_ids',
      width: 100,
      render: (ids: string[]) => ids?.length ?? 0,
    },
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
            description="Also removes any policy bindings that target this group."
            onConfirm={() =>
              deleteGroup.mutate(record.id!, { onError: (error) => message.error(getErrorMessage(error)) })
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
      <PageHeader
        title="Groups"
        description="Named sets of members, used as a policy-binding subject."
        actions={
          <Space>
            <OrganizationPicker />
            <Input.Search
              placeholder="Search groups"
              allowClear
              onSearch={(value) => {
                setPage(1)
                setSearch(value)
              }}
              style={{ width: 220 }}
              disabled={!organizationId}
            />
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setEditing('new')}
              disabled={!organizationId}
            >
              New group
            </Button>
          </Space>
        }
      />

      {!organizationId ? (
        <Alert type="info" showIcon title="Pick an organization above to see its groups." />
      ) : (
        <Table<Group>
          rowKey="id"
          columns={columns}
          dataSource={data?.groups ?? []}
          loading={isLoading || isFetching}
          locale={{
            emptyText: (
              <Empty
                image={<ClusterOutlined style={{ fontSize: 32, color: palette.inkTertiary }} />}
                description={search ? 'No groups match your search' : 'No groups yet'}
                style={{ padding: '32px 0' }}
              />
            ),
          }}
          pagination={{
            current: page,
            pageSize: PAGE_SIZE,
            total: data?.total ?? 0,
            onChange: setPage,
            showTotal: (total) => `${total} groups`,
          }}
        />
      )}

      <GroupFormDrawer
        group={editing === 'new' ? null : editing}
        open={editing !== null}
        onClose={() => setEditing(null)}
        onSubmit={(values) => {
          if (!organizationId) return
          if (editing === 'new') {
            createGroup.mutate(
              { ...values, organization_id: organizationId } as GroupInput,
              {
                onSuccess: () => setEditing(null),
                onError: (error) => message.error(getErrorMessage(error)),
              },
            )
          } else if (editing) {
            updateGroup.mutate(
              { id: editing.id!, body: values as GroupUpdateInput },
              {
                onSuccess: () => setEditing(null),
                onError: (error) => message.error(getErrorMessage(error)),
              },
            )
          }
        }}
        submitting={createGroup.isPending || updateGroup.isPending}
      />
    </div>
  )
}

function GroupFormDrawer({
  group,
  open,
  onClose,
  onSubmit,
  submitting,
}: {
  group: Group | null
  open: boolean
  onClose: () => void
  onSubmit: (values: Omit<GroupInput, 'organization_id'>) => void
  submitting: boolean
}) {
  const [form] = Form.useForm<Omit<GroupInput, 'organization_id'>>()

  useEffect(() => {
    if (open) {
      form.setFieldsValue(
        group ?? { name: '', slug: '', description: '', member_user_ids: [] },
      )
    }
  }, [open, group, form])

  return (
    <Drawer
      title={group ? `Edit ${group.name}` : 'New group'}
      open={open}
      onClose={onClose}
      destroyOnHidden
      extra={
        <Button type="primary" loading={submitting} onClick={() => form.submit()}>
          Save
        </Button>
      }
    >
      <Form form={form} layout="vertical" onFinish={onSubmit}>
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
          <Input.TextArea rows={2} />
        </Form.Item>
        <Form.Item name="member_user_ids" label="Members">
          <UserMultiSelect />
        </Form.Item>
      </Form>
    </Drawer>
  )
}
