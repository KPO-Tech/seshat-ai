import { useEffect, useState } from 'react'
import { Alert, Button, Drawer, Empty, Form, Input, message, Popconfirm, Space, Tag, Typography } from 'antd'
import type { TableProps } from 'antd'
import { PlusOutlined, DeleteOutlined, DesktopOutlined, CopyOutlined } from '@ant-design/icons'
import { useDevicesList, useRegisterDevice, useRevokeDevice, type Device, type DeviceRegisterInput } from '@/api/devices'
import { getErrorMessage } from '@/api/errors'
import { PageHeader } from '@/components/PageHeader'
import { ConsoleTable } from '@/components/ConsoleTable'
import { useScopedOrganizationId } from '@/hooks/useOrganizationScope'
import { palette } from '@/theme/tokens'

export function DevicesPage() { const organizationId = useScopedOrganizationId()
  const [registering, setRegistering] = useState(false)
  const [issuedToken, setIssuedToken] = useState<{ name: string; token: string } | null>(null)

  const { data, isLoading } = useDevicesList(organizationId ?? undefined)
  const registerDevice = useRegisterDevice()
  const revokeDevice = useRevokeDevice()

  const columns: TableProps<Device>['columns'] = [
    { title: 'Name',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record) => (
        <div>
          <div style={{ fontWeight: 500 }}>{name}</div>
          <Typography.Text style={{ fontSize: 12, color: palette.inkTertiary }}>
            {record.platform}
            {record.app_version ? ` · v${record.app_version}` : ''}
          </Typography.Text>
        </div>
      ), },
    { title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => (status === 'active' ? <Tag color="green">Active</Tag> : <Tag>Revoked</Tag>), },
    { title: 'Last seen',
      dataIndex: 'last_seen_at',
      key: 'last_seen_at',
      render: (v: string | null) => (v ? new Date(v).toLocaleString() : 'Never'), },
    { title: '',
      key: 'actions',
      width: 64,
      render: (_, record) =>
        record.status === 'active' ? (
          <Popconfirm
            title={`Revoke ${record.name}?`}
            onConfirm={() =>
              revokeDevice.mutate(record.id!, { onError: (error) => message.error(getErrorMessage(error)) }) }
          >
            <Button size="small" danger icon={<DeleteOutlined />} aria-label={`Revoke ${record.name}`} />
          </Popconfirm>
        ) : null, },
  ]

  return (
    <div>
      <PageHeader
        title="Devices"
        description="Machines registered to run device-targeted jobs for this organization."
        actions={ <Space>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setRegistering(true)}
              disabled={!organizationId}
            >
              Register device
            </Button>
          </Space> }
      />

      <ConsoleTable<Device>
          rowKey="id"
          columns={columns}
          dataSource={data ?? []}
          loading={isLoading}
          pagination={false}
          locale={{ emptyText: (
              <Empty
                image={<DesktopOutlined style={{ fontSize: 32, color: palette.inkTertiary }} />}
                description="No devices yet"
                style={{ padding: '32px 0' }}
              />
            ), }}
        />

      <DeviceRegisterDrawer
        open={registering}
        onClose={() => setRegistering(false)}
        onSubmit={(values) => { if (!organizationId) return
          registerDevice.mutate(
            { ...values, organization_id: organizationId },
            { onSuccess: (result) => { setRegistering(false)
                if (result?.token) setIssuedToken({ name: result.device?.name ?? values.name, token: result.token }) },
              onError: (error) => message.error(getErrorMessage(error)), },
          ) }}
        submitting={registerDevice.isPending}
      />

      <Drawer
        title={`${issuedToken?.name ?? 'Device'} token`}
        open={issuedToken !== null}
        onClose={() => setIssuedToken(null)}
      >
        <Alert
          type="warning"
          showIcon
          title="This device token is shown only once"
          description="Copy it now. The local backend uses it to authenticate device-protocol calls (heartbeat, run claim). It is never shown again."
          style={{ marginBottom: 16 }}
        />
        <Typography.Paragraph>
          <Typography.Text copyable={{ icon: <CopyOutlined /> }} code>
            {issuedToken?.token}
          </Typography.Text>
        </Typography.Paragraph>
      </Drawer>
    </div>
  ) }

function DeviceRegisterDrawer({ open,
  onClose,
  onSubmit,
  submitting, }: { open: boolean
  onClose: () => void
  onSubmit: (values: Omit<DeviceRegisterInput, 'organization_id'>) => void
  submitting: boolean }) { const [form] = Form.useForm<Omit<DeviceRegisterInput, 'organization_id'>>()

  useEffect(() => { if (open) form.setFieldsValue({ name: '', platform: '', app_version: '' }) }, [open, form])

  return (
    <Drawer
      title="Register device"
      open={open}
      onClose={onClose}
      destroyOnHidden
      extra={ <Button type="primary" loading={submitting} onClick={() => form.submit()}>
          Register
        </Button> }
    >
      <Form form={form} layout="vertical" onFinish={onSubmit}>
        <Form.Item name="name" label="Name" rules={[{ required: true, message: 'Required' }]}>
          <Input placeholder="Alice's laptop" />
        </Form.Item>
        <Form.Item name="platform" label="Platform">
          <Input placeholder="darwin, linux, windows" />
        </Form.Item>
        <Form.Item name="app_version" label="App version">
          <Input placeholder="1.4.0" />
        </Form.Item>
      </Form>
    </Drawer>
  ) }
