import { useEffect, useMemo, useState } from 'react'
import { Button, Card, Drawer, Empty, Form, Input, Popconfirm, Segmented, Space, Tag, Typography, message } from 'antd'
import type { TableProps } from 'antd'
import { CheckOutlined, ClusterOutlined, CrownOutlined, DeleteOutlined, EditOutlined, MailOutlined, PlusOutlined, SafetyOutlined, TeamOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router'
import {
  useMembershipsList,
  useCreateMembership,
  useCreateOrganizationMember,
  useUpdateMembership,
  useConfirmMembership,
  useDeleteMembership,
  type Membership,
} from '@/api/memberships'
import { useInvitationsList } from '@/api/invitations'
import { useRolesList } from '@/api/roles'
import { getErrorMessage } from '@/api/errors'
import { PageHeader } from '@/components/PageHeader'
import { ConsoleTable } from '@/components/ConsoleTable'
import { StatTile } from '@/components/StatTile'
import { useTeamsList } from '@/api/groups'
import { useScopedOrganizationId } from '@/hooks/useOrganizationScope'
import { UserSelect } from '@/components/UserSelect'
import { RoleSelect } from '@/components/RoleSelect'
import { GroupMultiSelect } from '@/components/GroupMultiSelect'
import { presentDateTime, presentText } from '@/lib/present'
import { ROLE_COLORS, formatRoleLabel } from '@/lib/roles'
import { monoStack, palette } from '@/theme/tokens'

const PAGE_SIZE = 20

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
  const teams = useTeamsList(organizationId ?? undefined, { sort: 'name', order: 'asc', limit: 1, offset: 0 })

  const createMembership = useCreateMembership()
  const createOrganizationMember = useCreateOrganizationMember()
  const updateMembership = useUpdateMembership()
  const confirmMembership = useConfirmMembership()
  const deleteMembership = useDeleteMembership()

  const roleByCode = useMemo(
    () => new Map((roles.data?.roles ?? []).map((role) => [role.code ?? '', role])),
    [roles.data?.roles],
  )

  const totalRoles = roles.data?.roles?.length ?? 0
  const pendingInvitations = invitations.data?.total ?? 0

  const columns: TableProps<Membership>['columns'] = [
    {
      title: 'Member',
      key: 'user',
      render: (_, record) => {
        const primary = presentText(record.user_display_name, record.user_email ?? 'Unknown user')
        const showEmail = Boolean(record.user_display_name && record.user_email)

        return (
          <Space orientation="vertical" size={2}>
            <Space size={6}>
              <Typography.Text strong>{primary}</Typography.Text>
              {record.user_is_admin && (
                <Tag color="gold" icon={<CrownOutlined />} style={{ margin: 0 }}>
                  Platform Admin
                </Tag>
              )}
              {record.status === 'pending' && (
                <Tag color="blue" style={{ margin: 0 }}>
                  New
                </Tag>
              )}
            </Space>
            {showEmail ? (
              <Typography.Text style={{ fontSize: 12, color: palette.inkSecondary }}>
                {record.user_email}
              </Typography.Text>
            ) : null}
            <Typography.Text
              style={{ fontSize: 12, color: palette.inkTertiary, fontFamily: monoStack }}
            >
              {record.user_id ?? 'No user ID'}
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
          <Space orientation="vertical" size={2}>
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
      width: 180,
      render: (_, record) => (
        <Space>
          {record.status === 'pending' && (
            <Button
              size="small"
              icon={<CheckOutlined />}
              onClick={() =>
                confirmMembership.mutate(record.id!, {
                  onError: (error) => message.error(getErrorMessage(error)),
                })
              }
              aria-label="Confirm member"
            />
          )}
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
            <Button onClick={() => navigate(`/orgs/${organizationId}/team/teams`)}>Teams</Button>
            <Button onClick={() => navigate(`/orgs/${organizationId}/team/invitations`)}>Invitations</Button>
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
          label="Teams"
          value={teams.data?.total}
          loading={teams.isLoading}
          icon={<ClusterOutlined />}
        />
        <StatTile
          label="Pending invites"
          value={pendingInvitations}
          loading={invitations.isLoading}
          icon={<MailOutlined />}
        />
        <StatTile
          label="Roles"
          value={totalRoles}
          loading={roles.isLoading}
          icon={<SafetyOutlined />}
        />
      </div>

      <Card title="Organization access" styles={{ body: { paddingTop: 8 } }}>
        <ConsoleTable<Membership>
          rowKey="id"
          columns={columns}
          dataSource={memberships.data?.memberships ?? []}
          loading={memberships.isLoading || memberships.isFetching}
          queryError={memberships.error}
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

      <MembershipFormDrawer
        membership={editing === 'new' ? null : editing}
        organizationId={organizationId}
        open={editing !== null}
        onClose={() => setEditing(null)}
        onSubmitExisting={(values) => {
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
        onSubmitNewUser={(values) => {
          if (!organizationId) return
          createOrganizationMember.mutate(
            {
              organization_id: organizationId,
              email: values.email,
              display_name: values.display_name,
              role: values.role,
              group_ids: values.group_ids,
            },
            {
              onSuccess: () => {
                setEditing(null)
                message.success(`${values.display_name} was created — they'll get an email to set their password.`)
              },
              onError: (error) => message.error(getErrorMessage(error)),
            },
          )
        }}
        submitting={createMembership.isPending || updateMembership.isPending || createOrganizationMember.isPending}
      />
    </div>
  )
}

function MembershipFormDrawer({
  membership,
  organizationId,
  open,
  onClose,
  onSubmitExisting,
  onSubmitNewUser,
  submitting,
}: {
  membership: Membership | null
  organizationId: string | null
  open: boolean
  onClose: () => void
  onSubmitExisting: (values: { user_id?: string; role?: string }) => void
  onSubmitNewUser: (values: { email: string; display_name: string; role: string; group_ids?: string[] }) => void
  submitting: boolean
}) {
  const [mode, setMode] = useState<'existing' | 'new'>('existing')
  const [existingForm] = Form.useForm<{ user_id: string; role: string }>()
  const [newUserForm] = Form.useForm<{ email: string; display_name: string; role: string; group_ids?: string[] }>()

  useEffect(() => {
    if (!open) return
    setMode('existing')
    existingForm.setFieldsValue({
      user_id: membership?.user_id ?? '',
      role: membership?.role ?? 'member',
    })
  }, [open, membership, existingForm])

  return (
    <Drawer
      title={membership ? 'Edit member access' : 'Add member'}
      open={open}
      onClose={onClose}
      destroyOnHidden
      size={640}
      extra={
        <Button
          type="primary"
          loading={submitting}
          onClick={() => (mode === 'existing' ? existingForm.submit() : newUserForm.submit())}
        >
          Save
        </Button>
      }
    >
      <Space orientation="vertical" size={18} style={{ width: '100%' }}>
        {!membership && (
          <Segmented
            value={mode}
            onChange={(value) => setMode(value as 'existing' | 'new')}
            options={[
              { label: 'Existing user', value: 'existing' },
              { label: 'New user', value: 'new' },
            ]}
          />
        )}

        {mode === 'existing' || membership ? (
          <>
            <Typography.Text style={{ color: palette.inkSecondary }}>
              {membership
                ? 'Change the assigned role for this existing member.'
                : 'Choose an existing platform user and assign the role they should have in this organization.'}
            </Typography.Text>

            <Form key="existing" form={existingForm} layout="vertical" onFinish={onSubmitExisting}>
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
          </>
        ) : (
          <>
            <Typography.Text style={{ color: palette.inkSecondary }}>
              Creates a brand-new platform account and adds it to this organization in one step. They'll get an
              email with a link to set their own password — nobody here ever sees or sets it for them.
            </Typography.Text>

            <Form key="new-user" form={newUserForm} layout="vertical" onFinish={onSubmitNewUser} initialValues={{ role: 'member' }}>
              <Form.Item name="display_name" label="Name" rules={[{ required: true, message: 'Required' }]}>
                <Input />
              </Form.Item>
              <Form.Item
                name="email"
                label="Email"
                rules={[{ required: true, type: 'email', message: 'Enter a valid email' }]}
              >
                <Input />
              </Form.Item>
              <Form.Item
                name="role"
                label="Role"
                extra="Use built-in roles for broad access and custom roles when a team needs narrower permissions."
                rules={[{ required: true, message: 'Required' }]}
              >
                <RoleSelect organizationId={organizationId ?? undefined} />
              </Form.Item>
              <Form.Item name="group_ids" label="Teams" extra="Optional — add this member to one or more teams right away.">
                <GroupMultiSelect organizationId={organizationId ?? undefined} />
              </Form.Item>
            </Form>
          </>
        )}
      </Space>
    </Drawer>
  )
}
