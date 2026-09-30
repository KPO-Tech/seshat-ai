import { useEffect, useState } from 'react'
import { Button, Card, Drawer, Empty, Form, message, Popconfirm, Select, Space, Switch, Table, Tag, Typography } from 'antd'
import type { TableProps } from 'antd'
import { PlusOutlined, DeleteOutlined, EditOutlined, SafetyCertificateOutlined } from '@ant-design/icons'
import { useDesktopPolicyCatalog,
  useDesktopPolicyBindingsList,
  useSetDesktopPolicyBinding,
  useDeleteDesktopPolicyBinding,
  type DesktopPolicy,
  type DesktopPolicyBinding,
  type DesktopPolicyBindingInput, } from '@/api/desktopPolicies'
import { useGroupsList } from '@/api/groups'
import { useRolesList } from '@/api/roles'
import { getErrorMessage } from '@/api/errors'
import { PageHeader } from '@/components/PageHeader'
import { ConsoleTable } from '@/components/ConsoleTable'
import { useScopedOrganizationId } from '@/hooks/useOrganizationScope'
import { UserSelect } from '@/components/UserSelect'
import { palette } from '@/theme/tokens'

// "group" is the wire value (matches the backend's SubjectType enum) - the
// console calls this concept "Team" everywhere else, same convention as
// PolicyBindingsPage.
const SUBJECT_TYPE_LABELS: Record<string, string> = {
  org: 'Whole organization',
  user: 'User',
  group: 'Team',
  role: 'Role',
}

export function DesktopPoliciesPage() {
  const organizationId = useScopedOrganizationId()
  const [editing, setEditing] = useState<DesktopPolicyBinding | 'new' | null>(null)

  const { data: catalogData, isLoading: catalogLoading } = useDesktopPolicyCatalog()
  const { data: bindingsData, isLoading, isFetching, error } = useDesktopPolicyBindingsList(organizationId ?? undefined)
  const setBinding = useSetDesktopPolicyBinding()
  const deleteBinding = useDeleteDesktopPolicyBinding()

  const catalog = catalogData?.desktop_policies ?? []
  const catalogByCode = new Map(catalog.map((policy) => [policy.code, policy]))

  const columns: TableProps<DesktopPolicyBinding>['columns'] = [
    { title: 'Policy',
      dataIndex: 'policy_code',
      key: 'policy_code',
      render: (code: string) => {
        const policy = catalogByCode.get(code)
        return (
          <div>
            <div style={{ fontWeight: 500 }}>{code}</div>
            {policy && <Typography.Text style={{ fontSize: 12, color: palette.inkTertiary }}>{policy.admin_description}</Typography.Text>}
          </div>
        ) }, },
    { title: 'Subject',
      key: 'subject',
      render: (_, record) => (
        <Space>
          <Tag>{SUBJECT_TYPE_LABELS[record.subject_type ?? ''] ?? record.subject_type}</Tag>
          {record.subject_id && <Typography.Text code>{record.subject_id}</Typography.Text>}
        </Space>
      ), },
    { title: 'Value',
      dataIndex: 'value',
      key: 'value',
      width: 110,
      render: (value: boolean) => (value ? <Tag color="green">Allowed</Tag> : <Tag color="red">Blocked</Tag>), },
    { title: '',
      key: 'actions',
      width: 96,
      render: (_, record) => (
        <Space>
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => setEditing(record)}
            aria-label={`Edit binding for ${record.policy_code}`}
          />
          <Popconfirm
            title="Delete this binding?"
            description="The affected subject falls back to whatever else applies, or the catalog default."
            onConfirm={() =>
              deleteBinding.mutate(record.id!, { onError: (error) => message.error(getErrorMessage(error)) }) }
          >
            <Button size="small" danger icon={<DeleteOutlined />} aria-label={`Delete binding for ${record.policy_code}`} />
          </Popconfirm>
        </Space>
      ), },
  ]

  return (
    <div>
      <PageHeader
        actions={ <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing('new')} disabled={!organizationId}>
            New binding
          </Button> }
      />

      <Card
        size="small"
        style={{ marginBottom: 16 }}
        loading={catalogLoading}
        title={ <Space>
            <SafetyCertificateOutlined />
            <span>Policy catalog</span>
          </Space> }
      >
        <Table<DesktopPolicy>
          size="small"
          rowKey="code"
          pagination={false}
          dataSource={catalog}
          columns={[
            { title: 'Code', dataIndex: 'code', key: 'code', render: (code: string) => <Typography.Text code>{code}</Typography.Text> },
            { title: 'What it controls', dataIndex: 'admin_description', key: 'admin_description' },
            { title: 'Message when blocked', dataIndex: 'user_blocked_message', key: 'user_blocked_message' },
          ]}
        />
      </Card>

      <ConsoleTable<DesktopPolicyBinding>
          rowKey="id"
          columns={columns}
          dataSource={bindingsData?.desktop_policy_bindings ?? []}
          loading={isLoading || isFetching}
          queryError={error}
          locale={{ emptyText: (
              <Empty
                image={<SafetyCertificateOutlined style={{ fontSize: 32, color: palette.inkTertiary }} />}
                description="No desktop policy bindings yet - every policy is at its default (allowed)"
                style={{ padding: '32px 0' }}
              />
            ), }}
        />

      <DesktopPolicyBindingFormDrawer
        binding={editing === 'new' ? null : editing}
        organizationId={organizationId}
        catalog={catalog}
        open={editing !== null}
        onClose={() => setEditing(null)}
        onSubmit={(values) => { if (!organizationId) return
          setBinding.mutate(
            { ...values, organization_id: organizationId } as DesktopPolicyBindingInput,
            { onSuccess: () => setEditing(null),
              onError: (error) => message.error(getErrorMessage(error)), },
          ) }}
        submitting={setBinding.isPending}
      />
    </div>
  ) }

function DesktopPolicyBindingFormDrawer({ binding,
  organizationId,
  catalog,
  open,
  onClose,
  onSubmit,
  submitting, }: { binding: DesktopPolicyBinding | null
  organizationId: string | null
  catalog: DesktopPolicy[]
  open: boolean
  onClose: () => void
  onSubmit: (values: Omit<DesktopPolicyBindingInput, 'organization_id'>) => void
  submitting: boolean }) {
  const [form] = Form.useForm<Omit<DesktopPolicyBindingInput, 'organization_id'>>()
  const subjectType = Form.useWatch('subject_type', form)
  const { data: groupsData } = useGroupsList(organizationId ?? undefined, { limit: 200 })
  const { data: rolesData } = useRolesList(organizationId ?? undefined)

  useEffect(() => { if (open) { form.setFieldsValue(
        binding ?? { policy_code: catalog[0]?.code, subject_type: 'org', subject_id: '', value: false },
      ) } }, [open, binding, form, catalog])

  return (
    <Drawer
      title={binding ? 'Edit desktop policy binding' : 'New desktop policy binding'}
      open={open}
      onClose={onClose}
      destroyOnHidden
      size={420}
      extra={ <Button type="primary" loading={submitting} onClick={() => form.submit()}>
          Save
        </Button> }
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={(values) => onSubmit({ ...values, subject_id: values.subject_type === 'org' ? '' : values.subject_id })}
      >
        <Form.Item name="policy_code" label="Policy" rules={[{ required: true }]}>
          <Select
            options={catalog.map((policy) => ({ value: policy.code, label: policy.code }))}
            optionRender={(option) => { const policy = catalog.find((p) => p.code === option.value)
              return (
                <div>
                  <div>{option.data.label}</div>
                  {policy && <Typography.Text style={{ fontSize: 12, color: palette.inkTertiary }}>{policy.admin_description}</Typography.Text>}
                </div>
              ) }}
          />
        </Form.Item>
        <Form.Item name="subject_type" label="Applies to" rules={[{ required: true }]}>
          <Select
            options={[
              { value: 'org', label: 'Whole organization' },
              { value: 'role', label: 'Role' },
              { value: 'user', label: 'User' },
              { value: 'group', label: 'Team' },
            ]}
            onChange={() => form.setFieldValue('subject_id', '')}
          />
        </Form.Item>
        {subjectType && subjectType !== 'org' && (
          <Form.Item name="subject_id" label="Subject" rules={[{ required: true, message: 'Required' }]}>
            {subjectType === 'group' ? (
              <Select
                showSearch
                optionFilterProp="label"
                options={(groupsData?.groups ?? []).map((g) => ({ value: g.id, label: g.name }))}
              />
            ) : subjectType === 'role' ? (
              <Select
                showSearch
                optionFilterProp="label"
                options={(rolesData?.roles ?? []).map((r) => ({ value: r.code,
                  label: r.system ? `${r.name} (system)` : r.name, }))}
              />
            ) : (
              <UserSelect />
            )}
          </Form.Item>
        )}
        <Form.Item
          name="value"
          label="Value"
          valuePropName="checked"
          tooltip="Blocking here overrides a more permissive binding elsewhere - once anything applicable says blocked, it stays blocked."
        >
          <Switch checkedChildren="Allowed" unCheckedChildren="Blocked" />
        </Form.Item>
      </Form>
    </Drawer>
  ) }
