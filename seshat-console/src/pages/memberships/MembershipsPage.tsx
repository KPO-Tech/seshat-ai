import { useEffect, useState } from 'react'
import { Alert, Button, Drawer, Empty, Form, message, Popconfirm, Space, Table, Tag, Typography } from 'antd'
import type { TableProps } from 'antd'
import { PlusOutlined, DeleteOutlined, EditOutlined, TeamOutlined } from '@ant-design/icons'
import {
  useMembershipsList,
  useCreateMembership,
  useUpdateMembership,
  useDeleteMembership,
  type Membership,
} from '@/api/memberships'
import { getErrorMessage } from '@/api/errors'
import { PageHeader } from '@/components/PageHeader'
import { OrganizationPicker } from '@/components/OrganizationPicker'
import { UserSelect } from '@/components/UserSelect'
import { RoleSelect } from '@/components/RoleSelect'
import { useConsoleOrgStore } from '@/store/consoleOrg'
import { palette } from '@/theme/tokens'

const PAGE_SIZE = 20

export function MembershipsPage() {
  const organizationId = useConsoleOrgStore((s) => s.organizationId)
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState<Membership | 'new' | null>(null)

  const { data, isLoading, isFetching } = useMembershipsList(organizationId ?? undefined, {
    sort: 'created_at',
    order: 'asc',
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  })
  const createMembership = useCreateMembership()
  const updateMembership = useUpdateMembership()
  const deleteMembership = useDeleteMembership()

  const columns: TableProps<Membership>['columns'] = [
    { title: 'User ID', dataIndex: 'user_id', key: 'user_id', render: (v) => <Typography.Text code>{v}</Typography.Text> },
    { title: 'Role', dataIndex: 'role', key: 'role', width: 140, render: (role: string) => <Tag>{role}</Tag> },
    {
      title: '',
      key: 'actions',
      width: 96,
      render: (_, record) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => setEditing(record)} aria-label="Edit role" />
          <Popconfirm
            title="Remove this membership?"
            description="Cannot remove the last owner of an organization."
            onConfirm={() =>
              deleteMembership.mutate(record.id!, { onError: (error) => message.error(getErrorMessage(error)) })
            }
          >
            <Button size="small" danger icon={<DeleteOutlined />} aria-label="Remove membership" />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Memberships"
        description="Who belongs to which organization, and with what role."
        actions={
          <Space>
            <OrganizationPicker />
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setEditing('new')}
              disabled={!organizationId}
            >
              Add member
            </Button>
          </Space>
        }
      />

      {!organizationId ? (
        <Alert type="info" showIcon title="Pick an organization above to see its memberships." />
      ) : (
        <Table<Membership>
          rowKey="id"
          columns={columns}
          dataSource={data?.memberships ?? []}
          loading={isLoading || isFetching}
          locale={{
            emptyText: (
              <Empty
                image={<TeamOutlined style={{ fontSize: 32, color: palette.inkTertiary }} />}
                description="No memberships yet"
                style={{ padding: '32px 0' }}
              />
            ),
          }}
          pagination={{
            current: page,
            pageSize: PAGE_SIZE,
            total: data?.total ?? 0,
            onChange: setPage,
            showTotal: (total) => `${total} memberships`,
          }}
        />
      )}

      <MembershipFormDrawer
        membership={editing === 'new' ? null : editing}
        organizationId={organizationId}
        open={editing !== null}
        onClose={() => setEditing(null)}
        onSubmit={(values) => {
          if (!organizationId) return
          if (editing === 'new') {
            createMembership.mutate(
              { organization_id: organizationId, user_id: values.user_id!, role: values.role! },
              {
                onSuccess: () => setEditing(null),
                onError: (error) => message.error(getErrorMessage(error)),
              },
            )
          } else if (editing) {
            updateMembership.mutate(
              { id: editing.id!, role: values.role! },
              {
                onSuccess: () => setEditing(null),
                onError: (error) => message.error(getErrorMessage(error)),
              },
            )
          }
        }}
        submitting={createMembership.isPending || updateMembership.isPending}
      />
    </div>
  )
}

function MembershipFormDrawer({
  membership,
  organizationId,
  open,
  onClose,
  onSubmit,
  submitting,
}: {
  membership: Membership | null
  organizationId: string | null
  open: boolean
  onClose: () => void
  onSubmit: (values: { user_id?: string; role?: string }) => void
  submitting: boolean
}) {
  const [form] = Form.useForm<{ user_id: string; role: string }>()

  useEffect(() => {
    if (open) form.setFieldsValue({ user_id: membership?.user_id ?? '', role: membership?.role ?? 'member' })
  }, [open, membership, form])

  return (
    <Drawer
      title={membership ? 'Edit membership role' : 'Add member'}
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
        <Form.Item name="user_id" label="User" rules={[{ required: true, message: 'Required' }]}>
          <UserSelect disabled={Boolean(membership)} placeholder={membership ? undefined : 'Existing user to add'} />
        </Form.Item>
        <Form.Item name="role" label="Role" rules={[{ required: true, message: 'Required' }]}>
          <RoleSelect organizationId={organizationId ?? undefined} />
        </Form.Item>
      </Form>
    </Drawer>
  )
}
