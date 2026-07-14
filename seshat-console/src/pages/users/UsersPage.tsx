import { useEffect, useState } from 'react'
import { Button, Drawer, Empty, Form, Input, message, Popconfirm, Select, Space, Switch, Tag, Typography } from 'antd'
import type { TableProps } from 'antd'
import { PlusOutlined, DeleteOutlined, EditOutlined, UserOutlined, KeyOutlined } from '@ant-design/icons'
import { useUsersList,
  useCreateUser,
  useUpdateUser,
  useDeleteUser,
  useRevokeUserSessions,
  type User,
  type UserCreateInput,
  type UserUpdateInput, } from '@/api/users'
import { getErrorMessage } from '@/api/errors'
import { PageHeader } from '@/components/PageHeader'
import { ConsoleTable } from '@/components/ConsoleTable'
import { OrganizationSelect } from '@/components/OrganizationSelect'
import { palette } from '@/theme/tokens'

const PAGE_SIZE = 20

export function UsersPage() { const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<User | 'new' | null>(null)
  const [newUserOrganizationId, setNewUserOrganizationId] = useState<string | undefined>(undefined)

  const { data, isLoading, isFetching } = useUsersList(
    { q: search || undefined, sort: 'email', order: 'asc', limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE },
    { enabled: true },
  )
  const createUser = useCreateUser()
  const updateUser = useUpdateUser()
  const deleteUser = useDeleteUser()
  const revokeSessions = useRevokeUserSessions()

  const columns: TableProps<User>['columns'] = [
    { title: 'Email',
      dataIndex: 'email',
      key: 'email',
      render: (email: string, record) => (
        <div>
          <div style={{ fontWeight: 500 }}>{record.display_name}</div>
          <Typography.Text style={{ fontSize: 12, color: palette.inkTertiary }}>{email}</Typography.Text>
        </div>
      ), },
    { title: 'Access',
      dataIndex: 'is_admin',
      key: 'is_admin',
      width: 140,
      render: (isAdmin: boolean) => (isAdmin ? <Tag color="orange">Platform admin</Tag> : <Tag>Standard</Tag>), },
    { title: '',
      key: 'actions',
      width: 128,
      render: (_, record) => (
        <Space>
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => setEditing(record)}
            aria-label={`Edit ${record.email}`}
          />
          <Popconfirm
            title={`Revoke all sessions for ${record.email}?`}
            onConfirm={() =>
              revokeSessions.mutate(record.id!, { onSuccess: (result) => message.success(`Revoked ${result?.revoked_count ?? 0} session(s)`),
                onError: (error) => message.error(getErrorMessage(error)), }) }
          >
            <Button size="small" icon={<KeyOutlined />} aria-label={`Revoke sessions for ${record.email}`} />
          </Popconfirm>
          <Popconfirm
            title={`Delete ${record.email}?`}
            description="Cascades memberships and sessions."
            onConfirm={() =>
              deleteUser.mutate(record.id!, { onError: (error) => message.error(getErrorMessage(error)), }) }
          >
            <Button size="small" danger icon={<DeleteOutlined />} aria-label={`Delete ${record.email}`} />
          </Popconfirm>
        </Space>
      ), },
  ]

  return (
    <div>
      <PageHeader
        title="Users"
        description="Platform-wide user directory. New users can optionally be attached to an organization at creation time."
        actions={ <Space>
            <Input.Search
              placeholder="Search users"
              allowClear
              onSearch={(value) => { setPage(1)
                setSearch(value) }}
              style={{ width: 220 }}
            />
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing('new')}>
              New user
            </Button>
          </Space> }
      />

      <ConsoleTable<User>
        rowKey="id"
        columns={columns}
        dataSource={data?.users ?? []}
        loading={isLoading || isFetching}
        locale={{ emptyText: (
            <Empty
              image={<UserOutlined style={{ fontSize: 32, color: palette.inkTertiary }} />}
              description={search ? 'No users match your search' : 'No users yet'}
              style={{ padding: '32px 0' }}
            />
          ), }}
        pagination={{ current: page,
          pageSize: PAGE_SIZE,
          total: data?.total ?? 0,
          onChange: setPage,
          showTotal: (total) => `${total} users`, }}
      />

      <UserFormDrawer
        user={editing === 'new' ? null : editing}
        open={editing !== null}
        organizationId={newUserOrganizationId}
        setOrganizationId={setNewUserOrganizationId}
        onClose={() => setEditing(null)}
        onSubmit={(values) => { if (editing === 'new') { createUser.mutate(values as UserCreateInput, { onSuccess: () => { setEditing(null)
                setNewUserOrganizationId(undefined) },
              onError: (error) => message.error(getErrorMessage(error)), }) } else if (editing) { updateUser.mutate(
              { id: editing.id!, body: values as UserUpdateInput },
              { onSuccess: () => setEditing(null),
                onError: (error) => message.error(getErrorMessage(error)), },
            ) } }}
        submitting={createUser.isPending || updateUser.isPending}
      />
    </div>
  ) }

function UserFormDrawer({ user,
  open,
  organizationId,
  setOrganizationId,
  onClose,
  onSubmit,
  submitting, }: { user: User | null
  open: boolean
  organizationId?: string
  setOrganizationId: (value: string | undefined) => void
  onClose: () => void
  onSubmit: (values: UserCreateInput | UserUpdateInput) => void
  submitting: boolean }) { const [form] = Form.useForm<UserCreateInput>()

  useEffect(() => { if (open) { form.setFieldsValue(
        user
          ? { email: user.email!, display_name: user.display_name!, is_admin: user.is_admin, password: '' }
          : { email: '', display_name: '', password: '', is_admin: false, role: 'member' },
      ) } }, [open, user, form])

  return (
    <Drawer
      title={user ? `Edit ${user.email}` : 'New user'}
      open={open}
      onClose={onClose}
      destroyOnHidden
      extra={ <Button type="primary" loading={submitting} onClick={() => form.submit()}>
          Save
        </Button> }
    >
      <Form<UserCreateInput>
        form={form}
        layout="vertical"
        onFinish={(values) => { if (user) { onSubmit({ email: values.email, display_name: values.display_name, is_admin: values.is_admin }) } else { onSubmit({ ...values, organization_id: organizationId ?? undefined }) } }}
      >
        <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email', message: 'Required' }]}>
          <Input />
        </Form.Item>
        <Form.Item name="display_name" label="Display name" rules={[{ required: true, message: 'Required' }]}>
          <Input />
        </Form.Item>
        {!user && (
          <Form.Item name="password" label="Password" rules={[{ required: true, min: 8, message: 'Minimum 8 characters' }]}>
            <Input.Password />
          </Form.Item>
        )}
        <Form.Item name="is_admin" label="Platform admin" valuePropName="checked" extra="Full access to every organization, no membership required.">
          <Switch />
        </Form.Item>
        {!user && (
          <>
            <Form.Item label="Attach to organization">
              <OrganizationSelect
                value={organizationId}
                onChange={setOrganizationId}
                allowClear
                placeholder="Optional"
                style={{ width: '100%', minWidth: 0 }}
              />
            </Form.Item>
            <Form.Item name="role" label="Role in that organization" style={{ marginTop: 8 }}>
              <Select
                disabled={!organizationId}
                options={[
                  { value: 'owner', label: 'Owner' },
                  { value: 'admin', label: 'Admin' },
                  { value: 'member', label: 'Member' },
                  { value: 'viewer', label: 'Viewer' },
                ]}
              />
            </Form.Item>
            <Typography.Text style={{ fontSize: 12, color: palette.inkTertiary }}>
              {organizationId
                ? 'This user will be created and attached to the selected organization.'
                : 'No organization selected. The user will be created without a membership.'}
            </Typography.Text>
          </>
        )}
      </Form>
    </Drawer>
  ) }
