import { useEffect, useState } from 'react'
import { Button, Drawer, Empty, Form, Input, message, Popconfirm, Space, Typography } from 'antd'
import type { TableProps } from 'antd'
import { PlusOutlined, DeleteOutlined, EditOutlined, ClusterOutlined } from '@ant-design/icons'
import { useGroupsList,
  useCreateGroup,
  useUpdateGroup,
  useDeleteGroup,
  type Group,
  type GroupInput,
  type GroupUpdateInput, } from '@/api/groups'
import { getErrorMessage } from '@/api/errors'
import { PageHeader } from '@/components/PageHeader'
import { ConsoleTable } from '@/components/ConsoleTable'
import { useScopedOrganizationId } from '@/hooks/useOrganizationScope'
import { UserMultiSelect } from '@/components/UserSelect'
import { palette } from '@/theme/tokens'

const PAGE_SIZE = 20

export function TeamsPage() { const organizationId = useScopedOrganizationId()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<Group | 'new' | null>(null)

  const { data, isLoading, isFetching, error } = useGroupsList(organizationId ?? undefined, { q: search || undefined,
    sort: 'name',
    order: 'asc',
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE, })
  const createTeam = useCreateGroup()
  const updateTeam = useUpdateGroup()
  const deleteTeam = useDeleteGroup()

  const columns: TableProps<Group>['columns'] = [
    { title: 'Name',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record) => (
        <div>
          <div style={{ fontWeight: 500 }}>{name}</div>
          <Typography.Text style={{ fontSize: 12, color: palette.inkTertiary }}>{record.slug}</Typography.Text>
        </div>
      ), },
    { title: 'Members',
      dataIndex: 'member_user_ids',
      key: 'member_user_ids',
      width: 100,
      render: (ids: string[]) => ids?.length ?? 0, },
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
            description="Also removes any policy bindings that target this team."
            onConfirm={() =>
              deleteTeam.mutate(record.id!, { onError: (error) => message.error(getErrorMessage(error)) }) }
          >
            <Button size="small" danger icon={<DeleteOutlined />} aria-label={`Delete ${record.name}`} />
          </Popconfirm>
        </Space>
      ), },
  ]

  return (
    <div>
      <PageHeader
        title="Teams"
        description="Organize members into teams for policy assignment and day-to-day structure. A member can be on any number of teams, or none."
        actions={ <Space>
            <Input.Search
              placeholder="Search teams"
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
              New team
            </Button>
          </Space> }
      />

      <ConsoleTable<Group>
          rowKey="id"
          columns={columns}
          dataSource={data?.groups ?? []}
          loading={isLoading || isFetching}
          queryError={error}
          locale={{ emptyText: (
              <Empty
                image={<ClusterOutlined style={{ fontSize: 32, color: palette.inkTertiary }} />}
                description={search ? 'No teams match your search' : 'No teams yet'}
                style={{ padding: '32px 0' }}
              />
            ), }}
          pagination={{ current: page,
            pageSize: PAGE_SIZE,
            total: data?.total ?? 0,
            onChange: setPage,
            showTotal: (total) => `${total} teams`, }}
        />

      <TeamFormDrawer
        team={editing === 'new' ? null : editing}
        open={editing !== null}
        onClose={() => setEditing(null)}
        onSubmit={(values) => { if (!organizationId) return
          if (editing === 'new') { createTeam.mutate(
              { ...values, organization_id: organizationId } as GroupInput,
              { onSuccess: () => setEditing(null),
                onError: (error) => message.error(getErrorMessage(error)), },
            ) } else if (editing) { updateTeam.mutate(
              { id: editing.id!, body: values as GroupUpdateInput },
              { onSuccess: () => setEditing(null),
                onError: (error) => message.error(getErrorMessage(error)), },
            ) } }}
        submitting={createTeam.isPending || updateTeam.isPending}
      />
    </div>
  ) }

function TeamFormDrawer({ team,
  open,
  onClose,
  onSubmit,
  submitting, }: { team: Group | null
  open: boolean
  onClose: () => void
  onSubmit: (values: Omit<GroupInput, 'organization_id'>) => void
  submitting: boolean }) { const [form] = Form.useForm<Omit<GroupInput, 'organization_id'>>()

  useEffect(() => { if (open) { form.setFieldsValue(
        team ?? { name: '', slug: '', description: '', member_user_ids: [] },
      ) } }, [open, team, form])

  return (
    <Drawer
      title={team ? `Edit ${team.name}` : 'New team'}
      open={open}
      onClose={onClose}
      destroyOnHidden
      extra={ <Button type="primary" loading={submitting} onClick={() => form.submit()}>
          Save
        </Button> }
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
  ) }
