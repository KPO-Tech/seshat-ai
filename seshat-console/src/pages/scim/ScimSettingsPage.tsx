import { useEffect, useState } from 'react'
import { Button, Drawer, Empty, Form, Input, message, Modal, Popconfirm, Space, Switch, Tag, Typography } from 'antd'
import { ApiOutlined, EditOutlined, DeleteOutlined, ReloadOutlined, PlusOutlined, CheckCircleFilled, CloseCircleFilled } from '@ant-design/icons'
import {
  useScimConnection,
  useCreateScimConnection,
  useUpdateScimConnection,
  useDeleteScimConnection,
  useRotateScimConnectionToken,
  useScimSyncEvents,
  type ScimConnection,
  type ScimConnectionInput,
  type ScimConnectionUpdateInput,
} from '@/api/scimConnections'
import { getErrorMessage } from '@/api/errors'
import { PageHeader } from '@/components/PageHeader'
import { useScopedOrganizationId } from '@/hooks/useOrganizationScope'
import { palette } from '@/theme/tokens'

function StatusBadge({ connection }: { connection: ScimConnection }) {
  if (connection.last_sync_success === undefined || connection.last_sync_success === null) {
    return <Tag style={{ margin: 0 }}>No activity yet</Tag>
  }
  return connection.last_sync_success ? (
    <Tag color="green" icon={<CheckCircleFilled />} style={{ margin: 0 }}>
      Healthy
    </Tag>
  ) : (
    <Tag color="red" icon={<CloseCircleFilled />} style={{ margin: 0 }}>
      Last operation failed
    </Tag>
  )
}

export function ScimSettingsPage() {
  const organizationId = useScopedOrganizationId()
  const [editing, setEditing] = useState<'new' | 'edit' | null>(null)
  const [revealedToken, setRevealedToken] = useState<string | null>(null)

  const { data: connection, isLoading, error } = useScimConnection(organizationId ?? undefined)
  const createConnection = useCreateScimConnection()
  const updateConnection = useUpdateScimConnection()
  const deleteConnection = useDeleteScimConnection()
  const rotateToken = useRotateScimConnectionToken()

  return (
    <div>
      <PageHeader
        title="SCIM Provisioning"
        description="Let an enterprise identity provider (Okta, Entra ID, ...) create, update and deactivate members automatically instead of managing them by hand here."
      />

      {error ? (
        <Typography.Text type="danger">{getErrorMessage(error)}</Typography.Text>
      ) : isLoading ? null : !connection ? (
        <div
          style={{
            border: `1px dashed ${palette.border}`,
            borderRadius: 12,
            padding: '48px 24px',
            background: palette.surface,
          }}
        >
          <Empty
            image={<ApiOutlined style={{ fontSize: 32, color: palette.inkTertiary }} />}
            description="SCIM provisioning isn't set up for this organization yet"
            style={{ marginBottom: 16 }}
          />
          <div style={{ textAlign: 'center' }}>
            <Button type="primary" icon={<PlusOutlined />} disabled={!organizationId} onClick={() => setEditing('new')}>
              Set up SCIM
            </Button>
          </div>
        </div>
      ) : (
        <div
          style={{
            border: `1px solid ${palette.border}`,
            borderRadius: 12,
            padding: '18px 20px',
            background: palette.surface,
          }}
        >
          <Space size={14} align="start" style={{ width: '100%', justifyContent: 'space-between' }}>
            <div>
              <Space size={8} align="center">
                <Typography.Text strong>{connection.name}</Typography.Text>
                <Tag color={connection.enabled ? 'green' : 'default'} style={{ margin: 0 }}>
                  {connection.enabled ? 'Enabled' : 'Disabled'}
                </Tag>
                <StatusBadge connection={connection} />
              </Space>
              <div style={{ marginTop: 6 }}>
                <Typography.Text style={{ fontSize: 12, color: palette.inkTertiary }}>
                  {connection.sync_groups
                    ? connection.auto_create_teams
                      ? 'Groups pushed by the IdP are synced into real teams.'
                      : 'Groups pushed by the IdP are recorded, but no team is created or modified.'
                    : 'Group provisioning is off — every /Groups push is rejected.'}
                </Typography.Text>
              </div>
              {connection.last_sync_success === false && connection.last_error && (
                <Typography.Text type="danger" style={{ display: 'block', fontSize: 12, marginTop: 4 }}>
                  {connection.last_error}
                </Typography.Text>
              )}
            </div>
            <Space>
              <Popconfirm
                title="Rotate the bearer token?"
                description="The current token stops working immediately — you'll need to update it in your IdP right after."
                onConfirm={() =>
                  rotateToken.mutate(organizationId!, {
                    onSuccess: (data) => setRevealedToken(data?.token ?? null),
                    onError: (error) => message.error(getErrorMessage(error)),
                  })
                }
              >
                <Button size="small" icon={<ReloadOutlined />} loading={rotateToken.isPending}>
                  Rotate token
                </Button>
              </Popconfirm>
              <Button size="small" icon={<EditOutlined />} onClick={() => setEditing('edit')} aria-label="Edit SCIM connection" />
              <Popconfirm
                title="Delete this SCIM connection?"
                description="Your IdP will immediately stop being able to provision members. Already-provisioned members are not affected."
                onConfirm={() =>
                  deleteConnection.mutate(organizationId!, { onError: (error) => message.error(getErrorMessage(error)) })
                }
              >
                <Button size="small" danger icon={<DeleteOutlined />} aria-label="Delete SCIM connection" />
              </Popconfirm>
            </Space>
          </Space>

          <RecentActivity organizationId={organizationId} />
        </div>
      )}

      <ScimConnectionFormDrawer
        connection={editing === 'edit' ? connection ?? null : null}
        open={editing !== null}
        onClose={() => setEditing(null)}
        onSubmit={(values) => {
          if (!organizationId) return
          if (editing === 'new') {
            createConnection.mutate(
              { ...values, organization_id: organizationId } as ScimConnectionInput,
              {
                onSuccess: (data) => {
                  setEditing(null)
                  setRevealedToken(data?.token ?? null)
                },
                onError: (error) => message.error(getErrorMessage(error)),
              },
            )
          } else {
            updateConnection.mutate(
              { organizationId, body: values },
              { onSuccess: () => setEditing(null), onError: (error) => message.error(getErrorMessage(error)) },
            )
          }
        }}
        submitting={createConnection.isPending || updateConnection.isPending}
      />

      <Modal
        title="Copy your SCIM bearer token"
        open={revealedToken !== null}
        onCancel={() => setRevealedToken(null)}
        footer={
          <Button type="primary" onClick={() => setRevealedToken(null)}>
            I've copied it
          </Button>
        }
        closable={false}
        maskClosable={false}
      >
        <Typography.Paragraph>
          This is the only time this token is shown. Paste it into your IdP's SCIM connection settings now — if you lose it,
          you'll need to rotate it and update your IdP again.
        </Typography.Paragraph>
        <Typography.Paragraph copyable={{ text: revealedToken ?? '' }} code style={{ wordBreak: 'break-all' }}>
          {revealedToken}
        </Typography.Paragraph>
      </Modal>
    </div>
  )
}

function ScimConnectionFormDrawer({
  connection,
  open,
  onClose,
  onSubmit,
  submitting,
}: {
  connection: ScimConnection | null
  open: boolean
  onClose: () => void
  onSubmit: (values: ScimConnectionUpdateInput) => void
  submitting: boolean
}) {
  const [form] = Form.useForm<ScimConnectionUpdateInput>()

  useEffect(() => {
    if (open) {
      form.setFieldsValue(
        connection ?? { name: '', enabled: true, sync_groups: false, auto_create_teams: false },
      )
    }
  }, [open, connection, form])

  return (
    <Drawer
      title={connection ? `Edit ${connection.name}` : 'Set up SCIM'}
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
        <Form.Item name="name" label="Name" rules={[{ required: true, message: 'Required' }]} extra="For your own reference, e.g. the IdP's name.">
          <Input placeholder="Okta" />
        </Form.Item>
        {connection && (
          <Form.Item name="enabled" label="Enabled" valuePropName="checked">
            <Switch />
          </Form.Item>
        )}
        <Form.Item name="sync_groups" label="Sync groups" valuePropName="checked" extra="When off, the IdP's group pushes are rejected outright rather than silently ignored.">
          <Switch />
        </Form.Item>
        <Form.Item
          name="auto_create_teams"
          label="Auto-create teams from synced groups"
          valuePropName="checked"
          extra="When off (but groups are synced), pushed groups are recorded for visibility only — no team is created or changed."
        >
          <Switch />
        </Form.Item>
      </Form>
    </Drawer>
  )
}

function RecentActivity({ organizationId }: { organizationId: string | null }) {
  const { data, isLoading } = useScimSyncEvents(organizationId ?? undefined)
  const events = data?.events ?? []

  return (
    <div style={{ borderTop: `1px solid ${palette.border}`, marginTop: 16, paddingTop: 16 }}>
      <Typography.Text style={{ display: 'block', fontSize: 11, fontWeight: 700, color: palette.inkTertiary, marginBottom: 8 }}>
        RECENT ACTIVITY
      </Typography.Text>
      {isLoading ? null : events.length === 0 ? (
        <Typography.Text style={{ fontSize: 12, color: palette.inkTertiary }}>
          Nothing has synced yet — this fills in once your IdP starts pushing users or groups.
        </Typography.Text>
      ) : (
        <Space orientation="vertical" size={6} style={{ width: '100%' }}>
          {events.map((event) => (
            <Space key={event.id} size={8} align="start" style={{ width: '100%' }}>
              {event.success ? (
                <CheckCircleFilled style={{ color: palette.accent, fontSize: 13, marginTop: 2 }} />
              ) : (
                <CloseCircleFilled style={{ color: '#d4380d', fontSize: 13, marginTop: 2 }} />
              )}
              <div>
                <Typography.Text style={{ fontSize: 12 }}>
                  {event.operation} <Typography.Text type="secondary">({event.resource_type})</Typography.Text>
                  {event.external_id ? <Typography.Text type="secondary"> — {event.external_id}</Typography.Text> : null}
                </Typography.Text>
                <Typography.Text style={{ display: 'block', fontSize: 11, color: palette.inkTertiary }}>
                  {event.created_at ? new Date(event.created_at).toLocaleString() : ''}
                  {!event.success && event.error_message ? ` — ${event.error_message}` : ''}
                </Typography.Text>
              </div>
            </Space>
          ))}
        </Space>
      )}
    </div>
  )
}
