import { useEffect, useMemo, useState } from 'react'
import { Button, Card, Drawer, Empty, Form, Popconfirm, Space, Tag, Typography, message } from 'antd'
import type { TableProps } from 'antd'
import {
  DeleteOutlined,
  EditOutlined,
  MailOutlined,
  PlusOutlined,
  SafetyOutlined,
  TeamOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import {
  useMembershipsList,
  useCreateMembership,
  useUpdateMembership,
  useDeleteMembership,
  type Membership,
} from '@/api/memberships'
import { useInvitationsList } from '@/api/invitations'
import { useRolesList } from '@/api/roles'
import { useUsersList } from '@/api/users'
import { getErrorMessage } from '@/api/errors'
import { PageHeader } from '@/components/PageHeader'
import { ConsoleTable } from '@/components/ConsoleTable'
import { StatTile } from '@/components/StatTile'
import { useScopedOrganizationId } from '@/hooks/useOrganizationScope'
import { UserSelect } from '@/components/UserSelect'
import { RoleSelect } from '@/components/RoleSelect'
import { presentDateTime, presentText } from '@/lib/present'
import { monoStack, palette } from '@/theme/tokens'

const PAGE_SIZE = 20

const ROLE_COLORS: Record<string, string> = {
  owner: 'gold',
  admin: 'orange',
  member: 'blue',
  viewer: 'default',
}

function formatRoleLabel(value: string | undefined) {
  if (!value) return 'Unknown role'
  return value
    .split(/[_-]/g)
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join(' ')
}

export function MembershipsPage() {
  const navigate = useNavigate()
  const organizationId = useScopedOrganizationId()
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState<Membership | 'new' | null>(null)

  const memberships = useMembershipsList(organizationId ?? undefined, {
    sort: 'created_at',
    order: 'asc',
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  })
  const invitations = useInvitationsList(organizationId ?? undefined, 'pending', {
    sort: 'created_at',
    order: 'desc',
    limit: 1,
    offset: 0,
  })
  const roles = useRolesList(organizationId ?? undefined)
  const users = useUsersList({ limit: 500, sort: 'email', order: 'asc' }, { enabled: true })

  const createMembership = useCreateMembership()
  const updateMembership = useUpdateMembership()
  const deleteMembership = useDeleteMembership()

  const roleByCode = useMemo(
    () => new Map((roles.data?.roles ?? []).map((role) => [role.code ?? '', role])),
    [roles.data?.roles],
  )
  const userById = useMemo(
    () => new Map((users.data?.users ?? []).map((user) => [user.id ?? '', user])),
    [users.data?.users],
  )

  const totalRoles = roles.data?.roles?.length ?? 0
  const customRoles = (roles.data?.roles ?? []).filter((role) => !role.system)
  const systemRoles = (roles.data?.roles ?? []).filter((role) => role.system)
  const pendingInvitations = invitations.data?.total ?? 0
  const directoryAvailable = !users.isError && (users.data?.users?.length ?? 0) > 0

  const columns: TableProps<Membership>['columns'] = [
    {
      title: 'Member',
      dataIndex: 'user_id',
      key: 'user_id',
      render: (value: string | undefined) => {
        const user = value ? userById.get(value) : undefined
        const primary = presentText(user?.display_name, user?.email ?? 'Unknown user')
        const showEmail = Boolean(user?.display_name && user?.email)

        return (
          <Space direction="vertical" size={2}>
            <Typography.Text strong>{primary}</Typography.Text>
            {showEmail ? (
              <Typography.Text style={{ fontSize: 12, color: palette.inkSecondary }}>
                {user?.email}
              </Typography.Text>
            ) : null}
            <Typography.Text
              style={{ fontSize: 12, color: palette.inkTertiary, fontFamily: monoStack }}
            >
              {value ?? 'No user ID'}
            </Typography.Text>
          </Space>
        )
      },
    },
    {
      title: 'Assigned role',
      dataIndex: 'role',
      key: 'role',
      width: 220,
      render: (value: string | undefined) => {
        const role = value ? roleByCode.get(value) : undefined
        const label = role?.name ?? formatRoleLabel(value)

        return (
          <Space direction="vertical" size={2}>
            <Tag color={ROLE_COLORS[value ?? '']}>{label}</Tag>
            <Typography.Text style={{ fontSize: 12, color: palette.inkTertiary }}>
              {role?.system ? 'System role' : role ? 'Custom role' : value ?? 'Unknown role'}
            </Typography.Text>
          </Space>
        )
      },
    },
    {
      title: 'Added',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 220,
      render: (value: string | undefined) => (
        <Typography.Text style={{ color: palette.inkSecondary }}>
          {presentDateTime(value, 'Unknown')}
        </Typography.Text>
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 96,
      render: (_, record) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => setEditing(record)} aria-label="Edit member role" />
          <Popconfirm
            title="Remove this membership?"
            description="The API blocks deleting the last owner in an organization."
            onConfirm={() =>
              deleteMembership.mutate(record.id!, {
                onError: (error) => message.error(getErrorMessage(error)),
              })}
          >
            <Button size="small" danger icon={<DeleteOutlined />} aria-label="Remove member" />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Team members"
        description="Direct access to this organization, with each member's effective role."
        actions={
          <Space>
            <Button onClick={() => navigate(`/orgs/${organizationId}/team/invitations`)}>Invitations</Button>
            <Button onClick={() => navigate(`/orgs/${organizationId}/team/roles`)}>Roles</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing('new')} disabled={!organizationId}>
              Add member
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
        <StatTile
          label="Members"
          value={memberships.data?.total}
          loading={memberships.isLoading}
          icon={<TeamOutlined />}
        />
        <StatTile
          label="Pending invites"
          value={pendingInvitations}
          loading={invitations.isLoading}
          icon={<MailOutlined />}
        />
        <StatTile
          label="Role templates"
          value={totalRoles}
          loading={roles.isLoading}
          icon={<SafetyOutlined />}
        />
        <StatTile
          label="Custom roles"
          value={customRoles.length}
          loading={roles.isLoading}
          icon={<EditOutlined />}
        />
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 16,
          alignItems: 'start',
        }}
      >
        <Card title="Organization access" styles={{ body: { paddingTop: 8 } }}>
          <ConsoleTable<Membership>
            rowKey="id"
            columns={columns}
            dataSource={memberships.data?.memberships ?? []}
            loading={memberships.isLoading || memberships.isFetching}
            locale={{
              emptyText: (
                <Empty
                  image={<TeamOutlined style={{ fontSize: 32, color: palette.inkTertiary }} />}
                  description="No members yet"
                  style={{ padding: '32px 0' }}
                />
              ),
            }}
            pagination={{
              current: page,
              pageSize: PAGE_SIZE,
              total: memberships.data?.total ?? 0,
              onChange: setPage,
              showTotal: (total) => `${total} member${total === 1 ? '' : 's'}`,
            }}
          />
        </Card>

        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Card
            title="Pending invitations"
            extra={<Button type="link" onClick={() => navigate(`/orgs/${organizationId}/team/invitations`)}>Open</Button>}
          >
            <Space direction="vertical" size={10} style={{ width: '100%' }}>
              <Typography.Text style={{ color: palette.inkSecondary }}>
                Invite people by email when they do not already have a platform account.
              </Typography.Text>
              <Typography.Text style={{ fontSize: 28, fontWeight: 700, color: palette.ink }}>
                {invitations.isLoading ? '...' : pendingInvitations}
              </Typography.Text>
              <Button block onClick={() => navigate(`/orgs/${organizationId}/team/invitations`)}>
                Review invitations
              </Button>
            </Space>
          </Card>

          <Card
            title="Roles and permissions"
            extra={<Button type="link" onClick={() => navigate(`/orgs/${organizationId}/team/roles`)}>Manage</Button>}
          >
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              <Typography.Text style={{ color: palette.inkSecondary }}>
                Keep only the roles this organization actually needs. Built-in roles cover the basics, custom roles cover tighter access control.
              </Typography.Text>
              <div>
                <Typography.Text strong>{customRoles.length ? 'Custom roles available' : 'Only built-in roles'}</Typography.Text>
                <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {customRoles.length > 0 ? (
                    customRoles.slice(0, 6).map((role) => (
                      <Tag key={role.code} color="orange">
                        {role.name}
                      </Tag>
                    ))
                  ) : (
                    systemRoles.map((role) => <Tag key={role.code}>{role.name}</Tag>)
                  )}
                  {customRoles.length > 6 ? <Tag>+{customRoles.length - 6} more</Tag> : null}
                </div>
              </div>
              <Button block onClick={() => navigate(`/orgs/${organizationId}/team/roles`)}>
                Manage roles
              </Button>
            </Space>
          </Card>

          {!directoryAvailable ? (
            <Card title="Directory lookup">
              <Typography.Text style={{ color: palette.inkSecondary }}>
                This account cannot resolve the user directory, so the member table falls back to raw user IDs. Platform admins still see emails and display names automatically.
              </Typography.Text>
            </Card>
          ) : null}
        </Space>
      </div>

      <MembershipFormDrawer
        membership={editing === 'new' ? null : editing}
        organizationId={organizationId}
        open={editing !== null}
        onClose={() => setEditing(null)}
        onSubmit={(values) => {
          if (!organizationId) return

          if (editing === 'new') {
            createMembership.mutate(
              {
                organization_id: organizationId,
                user_id: values.user_id!,
                role: values.role!,
              },
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
    if (!open) return
    form.setFieldsValue({
      user_id: membership?.user_id ?? '',
      role: membership?.role ?? 'member',
    })
  }, [open, membership, form])

  return (
    <Drawer
      title={membership ? 'Edit member access' : 'Add member'}
      open={open}
      onClose={onClose}
      destroyOnHidden
      size={640}
      extra={
        <Button type="primary" loading={submitting} onClick={() => form.submit()}>
          Save
        </Button>
      }
    >
      <Space direction="vertical" size={18} style={{ width: '100%' }}>
        <Typography.Text style={{ color: palette.inkSecondary }}>
          {membership
            ? 'Change the assigned role for this existing member.'
            : 'Choose an existing platform user and assign the role they should have in this organization.'}
        </Typography.Text>

        <Form form={form} layout="vertical" onFinish={onSubmit}>
          <Form.Item name="user_id" label="User" rules={[{ required: true, message: 'Required' }]}>
            <UserSelect
              disabled={Boolean(membership)}
              placeholder={membership ? undefined : 'Search by email or paste a user ID'}
            />
          </Form.Item>
          <Form.Item
            name="role"
            label="Role"
            extra="Use built-in roles for broad access and custom roles when a team needs narrower permissions."
            rules={[{ required: true, message: 'Required' }]}
          >
            <RoleSelect organizationId={organizationId ?? undefined} />
          </Form.Item>
        </Form>
      </Space>
    </Drawer>
  )
}
