import { useEffect, useState } from 'react'
import { Button, Drawer, Empty, Form, Input, message, Popconfirm, Space, Tag, Typography } from 'antd'
import type { TableProps } from 'antd'
import { PlusOutlined, DeleteOutlined, EditOutlined, SafetyOutlined } from '@ant-design/icons'
import { useRolesList, useCreateRole, useUpdateRole, useDeleteRole, type Role, type RoleInput } from '@/api/roles'
import { getErrorMessage } from '@/api/errors'
import { PageHeader } from '@/components/PageHeader'
import { ConsoleTable } from '@/components/ConsoleTable'
import { useScopedOrganizationId } from '@/hooks/useOrganizationScope'
import { PermissionChecklist } from '@/components/PermissionChecklist'
import { palette } from '@/theme/tokens'

export function RolesPage() { const organizationId = useScopedOrganizationId()
  const [editing, setEditing] = useState<Role | 'new' | null>(null)

  const { data, isLoading } = useRolesList(organizationId ?? undefined)
  const createRole = useCreateRole()
  const updateRole = useUpdateRole()
  const deleteRole = useDeleteRole()

  const columns: TableProps<Role>['columns'] = [
    { title: 'Role',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record) => (
        <div>
          <div style={{ fontWeight: 500 }}>{name}</div>
          <Typography.Text style={{ fontSize: 12, color: palette.inkTertiary }}>{record.code}</Typography.Text>
        </div>
      ), },
    { title: 'Kind',
      dataIndex: 'system',
      key: 'system',
      width: 100,
      render: (system: boolean) => (system ? <Tag>System</Tag> : <Tag color="orange">Custom</Tag>), },
    { title: 'Permissions',
      dataIndex: 'permissions',
      key: 'permissions',
      width: 110,
      render: (permissions: string[]) => permissions?.length ?? 0, },
    { title: '',
      key: 'actions',
      width: 96,
      render: (_, record) =>
        record.system ? null : (
          <Space>
            <Button
              size="small"
              icon={<EditOutlined />}
              onClick={() => setEditing(record)}
              aria-label={`Edit ${record.name}`}
            />
            <Popconfirm
              title={`Delete ${record.name}?`}
              description="Blocked while any membership or active invitation still uses this role."
              onConfirm={() =>
                deleteRole.mutate(
                  { code: record.code!, organizationId: organizationId! },
                  { onError: (error) => message.error(getErrorMessage(error)) },
                ) }
            >
              <Button size="small" danger icon={<DeleteOutlined />} aria-label={`Delete ${record.name}`} />
            </Popconfirm>
          </Space>
        ), },
  ]

  return (
    <div>
      <PageHeader
        title="Roles"
        description="System roles (owner/admin/member/viewer) plus custom roles defined for an organization."
        actions={ <Space>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setEditing('new')}
              disabled={!organizationId}
            >
              New role
            </Button>
          </Space> }
      />

      <ConsoleTable<Role>
          rowKey="code"
          columns={columns}
          dataSource={data?.roles ?? []}
          loading={isLoading}
          pagination={false}
          locale={{ emptyText: (
              <Empty
                image={<SafetyOutlined style={{ fontSize: 32, color: palette.inkTertiary }} />}
                description="No roles"
                style={{ padding: '32px 0' }}
              />
            ), }}
        />

      <RoleFormDrawer
        role={editing === 'new' ? null : editing}
        open={editing !== null}
        onClose={() => setEditing(null)}
        onSubmit={(values) => { if (!organizationId) return
          if (editing === 'new') { createRole.mutate(
              { ...values, organization_id: organizationId },
              { onSuccess: () => setEditing(null),
                onError: (error) => message.error(getErrorMessage(error)), },
            ) } else if (editing) { updateRole.mutate(
              { code: editing.code!, body: { ...values, organization_id: organizationId } },
              { onSuccess: () => setEditing(null),
                onError: (error) => message.error(getErrorMessage(error)), },
            ) } }}
        submitting={createRole.isPending || updateRole.isPending}
      />
    </div>
  ) }

function RoleFormDrawer({ role,
  open,
  onClose,
  onSubmit,
  submitting, }: { role: Role | null
  open: boolean
  onClose: () => void
  onSubmit: (values: Omit<RoleInput, 'organization_id'>) => void
  submitting: boolean }) { const [form] = Form.useForm<Omit<RoleInput, 'organization_id'>>()

  useEffect(() => { if (open) { form.setFieldsValue(
        role
          ? { code: role.code, name: role.name!, description: role.description, permissions: role.permissions }
          : { code: '', name: '', description: '', permissions: [] },
      ) } }, [open, role, form])

  return (
    <Drawer
      title={role ? `Edit ${role.name}` : 'New role'}
      open={open}
      onClose={onClose}
      destroyOnHidden
      size={480}
      extra={ <Button type="primary" loading={submitting} onClick={() => form.submit()}>
          Save
        </Button> }
    >
      <Form form={form} layout="vertical" onFinish={onSubmit}>
        <Form.Item
          name="code"
          label="Code"
          extra={role ? 'Renaming cascades to every membership, invitation and policy binding using it.' : undefined}
          rules={[{ required: true, pattern: /^[a-z0-9][a-z0-9_-]{0,63}$/, message: 'Lowercase letters, digits, hyphen or underscore' }]}
        >
          <Input />
        </Form.Item>
        <Form.Item name="name" label="Name" rules={[{ required: true, message: 'Required' }]}>
          <Input />
        </Form.Item>
        <Form.Item name="description" label="Description">
          <Input.TextArea rows={2} />
        </Form.Item>
        <Form.Item name="permissions" label="Permissions">
          <PermissionChecklist />
        </Form.Item>
      </Form>
    </Drawer>
  ) }
