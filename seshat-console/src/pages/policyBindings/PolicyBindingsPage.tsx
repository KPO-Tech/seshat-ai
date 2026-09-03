import { useEffect, useState } from 'react'
import { Button, Drawer, Empty, Form, Input, message, Popconfirm, Select, Space, Tag, Typography } from 'antd'
import type { TableProps } from 'antd'
import { PlusOutlined, DeleteOutlined, EditOutlined, LockOutlined } from '@ant-design/icons'
import { usePolicyBindingsList,
  useCreatePolicyBinding,
  useUpdatePolicyBinding,
  useDeletePolicyBinding,
  type PolicyBinding,
  type PolicyBindingInput, } from '@/api/policyBindings'
import { useGroupsList } from '@/api/groups'
import { useRolesList } from '@/api/roles'
import { useCorporaList } from '@/api/knowledge'
import { useProviderSettingsList } from '@/api/providerSettings'
import { getErrorMessage } from '@/api/errors'
import { PageHeader } from '@/components/PageHeader'
import { ConsoleTable } from '@/components/ConsoleTable'
import { useScopedOrganizationId } from '@/hooks/useOrganizationScope'
import { PermissionChecklist } from '@/components/PermissionChecklist'
import { UserSelect } from '@/components/UserSelect'
import { palette } from '@/theme/tokens'

const PAGE_SIZE = 20
const DESCRIPTION_MAX_LENGTH = 200

// "group" is the wire value (matches the backend's SubjectType enum) - the
// console calls this concept "Team", see docs/seshat-console-target-ia.md.
const SUBJECT_TYPE_LABELS: Record<string, string> = {
  user: 'User',
  group: 'Team',
  role: 'Role',
}

// Matches iam.knownResourceTypes on the backend - a binding scoped to one of
// these narrows it to that single resource instead of the whole
// organization (see each service's own resource-scope tests for what that
// unlocks: per-corpus sharing, per-member/team provider access control).
const RESOURCE_TYPE_LABELS: Record<string, string> = {
  corpus: 'Corpus',
  provider_setting: 'Provider setting',
}

export function PolicyBindingsPage() { const organizationId = useScopedOrganizationId()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<PolicyBinding | 'new' | null>(null)

  const { data, isLoading, isFetching, error } = usePolicyBindingsList(organizationId ?? undefined, { q: search || undefined,
    sort: 'name',
    order: 'asc',
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE, })
  const createBinding = useCreatePolicyBinding()
  const updateBinding = useUpdatePolicyBinding()
  const deleteBinding = useDeletePolicyBinding()

  const columns: TableProps<PolicyBinding>['columns'] = [
    { title: 'Name',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record) => (
        <div>
          <div style={{ fontWeight: 500 }}>{name}</div>
          {record.description && (
            <Typography.Text style={{ fontSize: 12, color: palette.inkTertiary }}>{record.description}</Typography.Text>
          )}
        </div>
      ), },
    { title: 'Subject',
      key: 'subject',
      render: (_, record) => (
        <Space>
          <Tag>{SUBJECT_TYPE_LABELS[record.subject_type ?? ''] ?? record.subject_type}</Tag>
          <Typography.Text code>{record.subject_id}</Typography.Text>
        </Space>
      ), },
    { title: 'Permissions',
      dataIndex: 'permission_codes',
      key: 'permission_codes',
      width: 110,
      render: (codes: string[]) => codes?.length ?? 0, },
    { title: 'Scope',
      key: 'scope',
      width: 160,
      render: (_, record) =>
        record.resource_type ? (
          <Tag color="blue">{RESOURCE_TYPE_LABELS[record.resource_type] ?? record.resource_type}</Tag>
        ) : (
          <Typography.Text style={{ color: palette.inkTertiary }}>Organization-wide</Typography.Text>
        ), },
    { title: '',
      key: 'actions',
      width: 96,
      render: (_, record) => (
        <Space>
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => setEditing(record)}
            aria-label={`Edit ${record.name}`}
          />
          <Popconfirm
            title={`Delete ${record.name}?`}
            onConfirm={() =>
              deleteBinding.mutate(record.id!, { onError: (error) => message.error(getErrorMessage(error)) }) }
          >
            <Button size="small" danger icon={<DeleteOutlined />} aria-label={`Delete ${record.name}`} />
          </Popconfirm>
        </Space>
      ), },
  ]

  return (
    <div>
      <PageHeader
        actions={ <Space>
            <Input.Search
              placeholder="Search bindings"
              allowClear
              onSearch={(value) => { setPage(1)
                setSearch(value) }}
              style={{ width: 220 }}
              disabled={!organizationId}
            />
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setEditing('new')}
              disabled={!organizationId}
            >
              New binding
            </Button>
          </Space> }
      />

      <ConsoleTable<PolicyBinding>
          rowKey="id"
          columns={columns}
          dataSource={data?.policy_bindings ?? []}
          loading={isLoading || isFetching}
          queryError={error}
          locale={{ emptyText: (
              <Empty
                image={<LockOutlined style={{ fontSize: 32, color: palette.inkTertiary }} />}
                description={search ? 'No bindings match your search' : 'No policy bindings yet'}
                style={{ padding: '32px 0' }}
              />
            ), }}
          pagination={{ current: page,
            pageSize: PAGE_SIZE,
            total: data?.total ?? 0,
            onChange: setPage,
            showTotal: (total) => `${total} policy bindings`, }}
        />

      <PolicyBindingFormDrawer
        binding={editing === 'new' ? null : editing}
        organizationId={organizationId}
        open={editing !== null}
        onClose={() => setEditing(null)}
        onSubmit={(values) => { if (!organizationId) return
          if (editing === 'new') { createBinding.mutate(
              { ...values, organization_id: organizationId } as PolicyBindingInput,
              { onSuccess: () => setEditing(null),
                onError: (error) => message.error(getErrorMessage(error)), },
            ) } else if (editing) { updateBinding.mutate(
              { id: editing.id!, body: values },
              { onSuccess: () => setEditing(null),
                onError: (error) => message.error(getErrorMessage(error)), },
            ) } }}
        submitting={createBinding.isPending || updateBinding.isPending}
      />
    </div>
  ) }

function PolicyBindingFormDrawer({ binding,
  organizationId,
  open,
  onClose,
  onSubmit,
  submitting, }: { binding: PolicyBinding | null
  organizationId: string | null
  open: boolean
  onClose: () => void
  onSubmit: (values: Omit<PolicyBindingInput, 'organization_id'>) => void
  submitting: boolean }) { const [form] = Form.useForm<Omit<PolicyBindingInput, 'organization_id'>>()
  const subjectType = Form.useWatch('subject_type', form)
  const resourceType = Form.useWatch('resource_type', form)
  const { data: groupsData } = useGroupsList(organizationId ?? undefined, { limit: 200 })
  const { data: rolesData } = useRolesList(organizationId ?? undefined)
  const { data: corporaData } = useCorporaList(organizationId ?? undefined, { limit: 200 })
  const { data: providerSettingsData } = useProviderSettingsList(organizationId ?? undefined)

  useEffect(() => { if (open) { form.setFieldsValue(
        binding ?? { name: '', description: '', subject_type: 'user', subject_id: '',
          permission_codes: [], resource_type: undefined, resource_id: undefined, },
      ) } }, [open, binding, form])

  return (
    <Drawer
      title={binding ? `Edit ${binding.name}` : 'New policy binding'}
      open={open}
      onClose={onClose}
      destroyOnHidden
      size={480}
      extra={ <Button type="primary" loading={submitting} onClick={() => form.submit()}>
          Save
        </Button> }
    >
      <Form form={form} layout="vertical" onFinish={onSubmit}>
        <Form.Item name="name" label="Name" rules={[{ required: true, message: 'Required' }]}>
          <Input />
        </Form.Item>
        <Form.Item name="description" label="Description">
          <Input.TextArea rows={2} maxLength={DESCRIPTION_MAX_LENGTH} showCount />
        </Form.Item>
        <Form.Item name="subject_type" label="Subject type" rules={[{ required: true }]}>
          <Select
            options={[
              { value: 'user', label: 'User' },
              { value: 'group', label: 'Team' },
              { value: 'role', label: 'Role' },
            ]}
            onChange={() => form.setFieldValue('subject_id', '')}
          />
        </Form.Item>
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
        <Form.Item name="permission_codes" label="Permissions">
          <PermissionChecklist />
        </Form.Item>
        <Form.Item
          name="resource_type"
          label="Scope"
          tooltip="Leave as organization-wide unless you're restricting access to one specific corpus or provider setting."
        >
          <Select
            allowClear
            placeholder="Organization-wide"
            options={Object.entries(RESOURCE_TYPE_LABELS).map(([value, label]) => ({ value, label }))}
            onChange={() => form.setFieldValue('resource_id', undefined)}
          />
        </Form.Item>
        {resourceType && (
          <Form.Item name="resource_id" label={RESOURCE_TYPE_LABELS[resourceType] ?? 'Resource'} rules={[{ required: true, message: 'Required' }]}>
            {resourceType === 'provider_setting' ? (
              <Select
                showSearch
                optionFilterProp="label"
                options={(providerSettingsData ?? []).map((p) => ({ value: p.id, label: `${p.provider} (${p.default_model})` }))}
              />
            ) : (
              <Select
                showSearch
                optionFilterProp="label"
                options={(corporaData?.corpora ?? []).map((c) => ({ value: c.id, label: c.name }))}
              />
            )}
          </Form.Item>
        )}
      </Form>
    </Drawer>
  ) }
