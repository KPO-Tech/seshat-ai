import { useEffect, useState } from 'react'
import { Avatar, Button, Drawer, Empty, Form, Input, Popconfirm, Segmented, Space, Tooltip, Typography, message } from 'antd'
import type { TableProps } from 'antd'
import { CheckOutlined, CrownOutlined, DeleteOutlined, PlusOutlined, TeamOutlined, UserOutlined } from '@ant-design/icons'
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
import { getErrorMessage } from '@/api/errors'
import { PageHeader } from '@/components/PageHeader'
import { ConsoleTable } from '@/components/ConsoleTable'
import { useScopedOrganizationId } from '@/hooks/useOrganizationScope'
import { UserSelect } from '@/components/UserSelect'
import { RoleSelect } from '@/components/RoleSelect'
import { GroupMultiSelect } from '@/components/GroupMultiSelect'
import { presentDateTime, presentText } from '@/lib/present'
import { palette } from '@/theme/tokens'

const PAGE_SIZE = 20

export function MembershipsPage() {
  const navigate = useNavigate()
  const organizationId = useScopedOrganizationId()
  const [page, setPage] = useState(1)
  const [adding, setAdding] = useState(false)

  const memberships = useMembershipsList(organizationId ?? undefined, {
    sort: 'created_at',
    order: 'asc',
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  })

  const createMembership = useCreateMembership()
  const createOrganizationMember = useCreateOrganizationMember()
  const updateMembership = useUpdateMembership()
  const confirmMembership = useConfirmMembership()
  const deleteMembership = useDeleteMembership()

  const columns: TableProps<Membership>['columns'] = [
    {
      title: 'Member',
      key: 'user',
      render: (_, record) => {
        const primary = presentText(record.user_display_name, record.user_email ?? 'Unknown user')
        return (
          <Space size={10} align="center">
            <Avatar
              size={30}
              icon={<UserOutlined />}
              style={{ background: palette.accentSoft, color: palette.accentHover, border: `1px solid ${palette.accentSoftBorder}`, flexShrink: 0 }}
            />
            <Space size={6} align="center">
              <Typography.Text strong>{primary}</Typography.Text>
              {record.user_is_admin && (
                <Tooltip title="Platform Admin">
                  <CrownOutlined style={{ color: palette.warning, fontSize: 13 }} />
                </Tooltip>
              )}
            </Space>
          </Space>
        )
      },
    },
    {
      title: 'Email',
      key: 'email',
      render: (_, record) => (
        <Typography.Text style={{ color: palette.inkSecondary }}>{record.user_email ?? '—'}</Typography.Text>
      ),
    },
    {
      title: 'Role',
      dataIndex: 'role',
      key: 'role',
      width: 200,
      render: (value: string | undefined, record) => (
        <RoleSelect
          organizationId={organizationId ?? undefined}
          value={value}
          size="small"
          style={{ width: 170 }}
          onChange={(role) =>
            updateMembership.mutate(
              { id: record.id!, role },
              { onError: (error) => message.error(getErrorMessage(error)) },
            )
          }
        />
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (value: string | undefined) => (
        <span className="status-badge" style={{ background: value === 'pending' ? palette.warningSoft : palette.successSoft, color: value === 'pending' ? palette.warning : palette.success }}>
          <span className={`status-dot ${value === 'pending' ? 'status-dot--pending' : 'status-dot--active'}`} />
          {value ?? 'active'}
        </span>
      ),
    },
    {
      title: 'Joined',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 180,
      render: (value: string | undefined) => (
        <Typography.Text style={{ color: palette.inkSecondary }}>{presentDateTime(value, 'Unknown')}</Typography.Text>
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 90,
      render: (_, record) => (
        <Space size={4}>
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
          <Popconfirm
            title="Remove this membership?"
            description="The API blocks deleting the last owner in an organization."
            onConfirm={() =>
              deleteMembership.mutate(record.id!, {
                onError: (error) => message.error(getErrorMessage(error)),
              })}
          >
            <Button size="small" type="text" danger icon={<DeleteOutlined />} aria-label="Remove member" />
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
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setAdding(true)} disabled={!organizationId}>
              Add member
            </Button>
          </Space>
        }
      />

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

      <AddMemberDrawer
        organizationId={organizationId}
        open={adding}
        onClose={() => setAdding(false)}
        onSubmitExisting={(values) => {
          if (!organizationId) return
          createMembership.mutate(
            {
              organization_id: organizationId,
              user_id: values.user_id!,
              role: values.role!,
            },
            {
              onSuccess: () => setAdding(false),
              onError: (error) => message.error(getErrorMessage(error)),
            },
          )
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
                setAdding(false)
                message.success(`${values.display_name} was created. They'll get an email to set their password.`)
              },
              onError: (error) => message.error(getErrorMessage(error)),
            },
          )
        }}
        submitting={createMembership.isPending || createOrganizationMember.isPending}
      />
    </div>
  )
}

function AddMemberDrawer({
  organizationId,
  open,
  onClose,
  onSubmitExisting,
  onSubmitNewUser,
  submitting,
}: {
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
    existingForm.setFieldsValue({ user_id: '', role: 'member' })
  }, [open, existingForm])

  return (
    <Drawer
      title="Add member"
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
        <Segmented
          value={mode}
          onChange={(value) => setMode(value as 'existing' | 'new')}
          options={[
            { label: 'Existing user', value: 'existing' },
            { label: 'New user', value: 'new' },
          ]}
        />

        {mode === 'existing' ? (
          <>
            <Typography.Text style={{ color: palette.inkSecondary }}>
              Choose an existing platform user and assign the role they should have in this organization.
            </Typography.Text>

            <Form key="existing" form={existingForm} layout="vertical" onFinish={onSubmitExisting}>
              <Form.Item name="user_id" label="User" rules={[{ required: true, message: 'Required' }]}>
                <UserSelect placeholder="Search by email or paste a user ID" />
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
              email with a link to set their own password. Nobody here ever sees or sets it for them.
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
              <Form.Item name="group_ids" label="Teams" extra="Optional. Add this member to one or more teams right away.">
                <GroupMultiSelect organizationId={organizationId ?? undefined} />
              </Form.Item>
            </Form>
          </>
        )}
      </Space>
    </Drawer>
  )
}
