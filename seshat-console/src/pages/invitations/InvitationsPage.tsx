import { useEffect, useState } from 'react'
import { Button, Drawer, Empty, Form, Input, InputNumber, message, Popconfirm, Segmented, Space, Tag, Typography } from 'antd'
import type { TableProps } from 'antd'
import { PlusOutlined, StopOutlined, MailOutlined } from '@ant-design/icons'
import { useInvitationsList,
  useCreateInvitation,
  useRevokeInvitation,
  type Invitation,
  type InvitationCreateInput,
  type InvitationStatus, } from '@/api/invitations'
import { getErrorMessage } from '@/api/errors'
import { PageHeader } from '@/components/PageHeader'
import { ConsoleTable } from '@/components/ConsoleTable'
import { useScopedOrganizationId } from '@/hooks/useOrganizationScope'
import { RoleSelect } from '@/components/RoleSelect'
import { palette } from '@/theme/tokens'

const PAGE_SIZE = 20

const STATUS_COLORS: Record<string, string> = { pending: 'gold',
  accepted: 'green',
  revoked: 'default',
  expired: 'red', }

export function InvitationsPage() { const organizationId = useScopedOrganizationId()
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState<'all' | InvitationStatus>('all')
  const [creating, setCreating] = useState(false)

  const { data, isLoading, isFetching } = useInvitationsList(
    organizationId ?? undefined,
    status === 'all' ? undefined : status,
    { sort: 'created_at', order: 'desc', limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE },
  )
  const createInvitation = useCreateInvitation()
  const revokeInvitation = useRevokeInvitation()

  const columns: TableProps<Invitation>['columns'] = [
    { title: 'Email',
      dataIndex: 'email',
      key: 'email',
      render: (email: string, record) => (
        <div>
          <div style={{ fontWeight: 500 }}>{email}</div>
          <Typography.Text style={{ fontSize: 12, color: palette.inkTertiary }}>{record.role}</Typography.Text>
        </div>
      ), },
    { title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (s: string) => <Tag color={STATUS_COLORS[s]}>{s}</Tag>, },
    { title: 'Expires',
      dataIndex: 'expires_at',
      key: 'expires_at',
      render: (v: string) => (v ? new Date(v).toLocaleString() : 'No expiry'), },
    { title: '',
      key: 'actions',
      width: 64,
      render: (_, record) =>
        record.status === 'pending' ? (
          <Popconfirm
            title={`Revoke invitation to ${record.email}?`}
            onConfirm={() =>
              revokeInvitation.mutate(record.id!, { onError: (error) => message.error(getErrorMessage(error)) }) }
          >
            <Button size="small" danger icon={<StopOutlined />} aria-label={`Revoke invitation to ${record.email}`} />
          </Popconfirm>
        ) : null, },
  ]

  return (
    <div>
      <PageHeader
        title="Invitations"
        description="Pending, accepted, revoked and expired invites to join an organization."
        actions={ <Space>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setCreating(true)}
              disabled={!organizationId}
            >
              Invite
            </Button>
          </Space> }
      />

      <>
          <Segmented
            style={{ marginBottom: 16 }}
            value={status}
            onChange={(v) => { setPage(1)
              setStatus(v as 'all' | InvitationStatus) }}
            options={[
              { label: 'All', value: 'all' },
              { label: 'Pending', value: 'pending' },
              { label: 'Accepted', value: 'accepted' },
              { label: 'Revoked', value: 'revoked' },
              { label: 'Expired', value: 'expired' },
            ]}
          />
          <ConsoleTable<Invitation>
            rowKey="id"
            columns={columns}
            dataSource={data?.invitations ?? []}
            loading={isLoading || isFetching}
            locale={{ emptyText: (
                <Empty
                  image={<MailOutlined style={{ fontSize: 32, color: palette.inkTertiary }} />}
                  description="No invitations yet"
                  style={{ padding: '32px 0' }}
                />
              ), }}
            pagination={{ current: page,
              pageSize: PAGE_SIZE,
              total: data?.total ?? 0,
              onChange: setPage,
              showTotal: (total) => `${total} invitations`, }}
          />
        </>

      <InvitationFormDrawer
        organizationId={organizationId}
        open={creating}
        onClose={() => setCreating(false)}
        onSubmit={(values) => { if (!organizationId) return
          createInvitation.mutate(
            { ...values, organization_id: organizationId },
            { onSuccess: () => setCreating(false),
              onError: (error) => message.error(getErrorMessage(error)), },
          ) }}
        submitting={createInvitation.isPending}
      />
    </div>
  ) }

function InvitationFormDrawer({ organizationId,
  open,
  onClose,
  onSubmit,
  submitting, }: { organizationId: string | null
  open: boolean
  onClose: () => void
  onSubmit: (values: Omit<InvitationCreateInput, 'organization_id'>) => void
  submitting: boolean }) { const [form] = Form.useForm<Omit<InvitationCreateInput, 'organization_id'>>()

  useEffect(() => { if (open) form.setFieldsValue({ email: '', role: 'member', expires_in_days: 7 }) }, [open, form])

  return (
    <Drawer
      title="Invite to organization"
      open={open}
      onClose={onClose}
      destroyOnHidden
      extra={ <Button type="primary" loading={submitting} onClick={() => form.submit()}>
          Send invite
        </Button> }
    >
      <Form form={form} layout="vertical" onFinish={onSubmit}>
        <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email', message: 'Required' }]}>
          <Input />
        </Form.Item>
        <Form.Item name="role" label="Role" rules={[{ required: true, message: 'Required' }]}>
          <RoleSelect organizationId={organizationId ?? undefined} />
        </Form.Item>
        <Form.Item name="expires_in_days" label="Expires in (days)">
          <InputNumber min={1} max={90} style={{ width: '100%' }} />
        </Form.Item>
      </Form>
    </Drawer>
  ) }
