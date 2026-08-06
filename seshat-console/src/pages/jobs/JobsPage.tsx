import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { Button,
  DatePicker,
  Drawer,
  Empty,
  Form,
  Input,
  InputNumber,
  message,
  Popconfirm,
  Select,
  Space,
  Switch,
  Tag,
  Typography, } from 'antd'
import type { TableProps } from 'antd'
import dayjs from 'dayjs'
import { PlusOutlined, DeleteOutlined, EditOutlined, PlayCircleOutlined, ScheduleOutlined, HistoryOutlined } from '@ant-design/icons'
import { useJobsList,
  useCreateJob,
  useUpdateJob,
  useDeleteJob,
  useSetJobPaused,
  useTriggerJobNow,
  type Job,
  type JobInput, } from '@/api/jobs'
import { useDevicesList } from '@/api/devices'
import { getErrorMessage } from '@/api/errors'
import { PageHeader } from '@/components/PageHeader'
import { ConsoleTable } from '@/components/ConsoleTable'
import { useScopedOrganizationId } from '@/hooks/useOrganizationScope'
import { palette } from '@/theme/tokens'
import { presentDateTime } from '@/lib/present'

const STATUS_COLORS: Record<string, string> = { queued: 'default',
  claimed: 'blue',
  running: 'processing',
  completed: 'green',
  failed: 'red',
  cancelled: 'default', }

export function JobsPage() { const organizationId = useScopedOrganizationId()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const deviceIdFilter = searchParams.get('device_id') ?? undefined
  const [editing, setEditing] = useState<Job | 'new' | null>(null)

  const { data, isLoading, error } = useJobsList(organizationId ?? undefined)
  const filteredData = deviceIdFilter ? (data ?? []).filter((job) => job.target_device_id === deviceIdFilter) : data
  const createJob = useCreateJob()
  const updateJob = useUpdateJob()
  const deleteJob = useDeleteJob()
  const setPaused = useSetJobPaused()
  const triggerNow = useTriggerJobNow()

  const columns: TableProps<Job>['columns'] = [
    { title: 'Name',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record) => (
        <div>
          <div style={{ fontWeight: 500 }}>{name}</div>
          <Typography.Text style={{ fontSize: 12, color: palette.inkTertiary }}>
            {record.trigger_type} · {record.execution_target}
          </Typography.Text>
        </div>
      ), },
    { title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => (status === 'active' ? <Tag color="green">Active</Tag> : <Tag>Paused</Tag>), },
    { title: 'Last run',
      dataIndex: 'last_run_status',
      key: 'last_run_status',
      width: 120,
      render: (status: string | null) => (status ? <Tag color={STATUS_COLORS[status]}>{status}</Tag> : 'Never run'), },
    { title: 'Next run',
      dataIndex: 'next_run_at',
      key: 'next_run_at',
      render: (v: string | null) => presentDateTime(v, 'No upcoming run'), },
    { title: '',
      key: 'actions',
      width: 190,
      render: (_, record) => (
        <Space>
          <Button
            size="small"
            icon={<PlayCircleOutlined />}
            aria-label={`Run ${record.name} now`}
            onClick={() =>
              triggerNow.mutate(record.id!, { onSuccess: () => message.success('Run queued'),
                onError: (error) => message.error(getErrorMessage(error)), }) }
          />
          <Switch
            size="small"
            checked={record.status === 'active'}
            onChange={(checked) =>
              setPaused.mutate(
                { id: record.id!, paused: !checked },
                { onError: (error) => message.error(getErrorMessage(error)) },
              ) }
          />
          <Button
            size="small"
            icon={<HistoryOutlined />}
            aria-label={`View runs for ${record.name}`}
            onClick={() => navigate(organizationId ? `/orgs/${organizationId}/automation/runs?job_id=${record.id}` : `/runs?job_id=${record.id}`)}
          />
          <Button size="small" icon={<EditOutlined />} onClick={() => setEditing(record)} aria-label={`Edit ${record.name}`} />
          <Popconfirm
            title={`Delete ${record.name}?`}
            onConfirm={() => deleteJob.mutate(record.id!, { onError: (error) => message.error(getErrorMessage(error)) })}
          >
            <Button size="small" danger icon={<DeleteOutlined />} aria-label={`Delete ${record.name}`} />
          </Popconfirm>
        </Space>
      ), },
  ]

  return (
    <div>
      <PageHeader
        title="Jobs"
        description={deviceIdFilter ? 'Jobs targeting this device.' : 'Scheduled and on-demand automations.'}
        actions={ <Space>
            {deviceIdFilter && <Button onClick={() => setSearchParams({})}>Clear device filter</Button>}
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setEditing('new')}
              disabled={!organizationId}
            >
              New job
            </Button>
          </Space> }
      />

      <ConsoleTable<Job>
          rowKey="id"
          columns={columns}
          dataSource={filteredData ?? []}
          loading={isLoading}
          queryError={error}
          pagination={false}
          locale={{ emptyText: (
              <Empty
                image={<ScheduleOutlined style={{ fontSize: 32, color: palette.inkTertiary }} />}
                description="No jobs yet"
                style={{ padding: '32px 0' }}
              />
            ), }}
        />

      <JobFormDrawer
        job={editing === 'new' ? null : editing}
        organizationId={organizationId}
        open={editing !== null}
        onClose={() => setEditing(null)}
        onSubmit={(values) => { if (!organizationId) return
          if (editing === 'new') { createJob.mutate(
              { ...values, organization_id: organizationId },
              { onSuccess: () => setEditing(null), onError: (error) => message.error(getErrorMessage(error)) },
            ) } else if (editing) { updateJob.mutate(
              { id: editing.id!, body: values },
              { onSuccess: () => setEditing(null), onError: (error) => message.error(getErrorMessage(error)) },
            ) } }}
        submitting={createJob.isPending || updateJob.isPending}
      />
    </div>
  ) }

function JobFormDrawer({ job,
  organizationId,
  open,
  onClose,
  onSubmit,
  submitting, }: { job: Job | null
  organizationId: string | null
  open: boolean
  onClose: () => void
  onSubmit: (values: Omit<JobInput, 'organization_id'>) => void
  submitting: boolean }) { const [form] = Form.useForm<Omit<JobInput, 'organization_id'> & { run_at_picker?: dayjs.Dayjs }>()
  const triggerType = Form.useWatch('trigger_type', form)
  const executionTarget = Form.useWatch('execution_target', form)
  const { data: devices } = useDevicesList(organizationId ?? undefined)

  useEffect(() => { if (open) { form.setFieldsValue(
        job
          ? { name: job.name,
              description: job.description,
              trigger_type: job.trigger_type,
              cron_expr: job.cron_expr,
              interval_seconds: job.interval_seconds,
              execution_target: job.execution_target,
              target_device_id: job.target_device_id,
              prompt: job.prompt,
              model_override: job.model_override,
              run_at_picker: job.run_at ? dayjs(job.run_at) : undefined, }
          : { name: '', trigger_type: 'cron', execution_target: 'cloud', prompt: '', cron_expr: '0 0 * * *' },
      ) } }, [open, job, form])

  return (
    <Drawer
      title={job ? `Edit ${job.name}` : 'New job'}
      open={open}
      onClose={onClose}
      destroyOnHidden
      size={480}
      extra={ <Button type="primary" loading={submitting} onClick={() => form.submit()}>
          Save
        </Button> }
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={(values) => { const { run_at_picker, ...rest } = values
          onSubmit({ ...rest, run_at: run_at_picker ? run_at_picker.toISOString() : undefined }) }}
      >
        <Form.Item name="name" label="Name" rules={[{ required: true, message: 'Required' }]}>
          <Input />
        </Form.Item>
        <Form.Item name="description" label="Description">
          <Input.TextArea rows={2} />
        </Form.Item>
        <Form.Item name="trigger_type" label="Trigger" rules={[{ required: true }]}>
          <Select
            options={[
              { value: 'cron', label: 'Cron schedule' },
              { value: 'interval', label: 'Interval' },
              { value: 'once', label: 'One-off' },
            ]}
            // Only the field matching the newly selected trigger stays
            // visible, but antd keeps an unmounted Form.Item's value in the
            // form's internal state — without this, switching e.g. cron ->
            // once while editing a job silently carries the old cron_expr
            // along in the submitted payload next to the new run_at. Server
            // validation only reads the fields matching the current
            // trigger_type/execution_target (see automation/jobs_test.go),
            // so this was tolerated rather than rejected — but relying on
            // that leniency staying that way is fragile.
            onChange={() => form.setFieldsValue({ cron_expr: undefined, interval_seconds: undefined, run_at_picker: undefined })}
          />
        </Form.Item>
        {triggerType === 'cron' && (
          <Form.Item name="cron_expr" label="Cron expression" rules={[{ required: true, message: 'Required' }]}>
            <Input placeholder="0 0 * * *" />
          </Form.Item>
        )}
        {triggerType === 'interval' && (
          <Form.Item name="interval_seconds" label="Interval (seconds)" rules={[{ required: true, message: 'Required' }]}>
            <InputNumber min={60} style={{ width: '100%' }} />
          </Form.Item>
        )}
        {triggerType === 'once' && (
          <Form.Item name="run_at_picker" label="Run at" rules={[{ required: true, message: 'Required' }]}>
            <DatePicker showTime style={{ width: '100%' }} />
          </Form.Item>
        )}
        <Form.Item name="execution_target" label="Execution target" rules={[{ required: true }]}>
          <Select
            options={[
              { value: 'cloud', label: 'Cloud' },
              { value: 'device', label: 'Device' },
            ]}
            // Same reasoning as trigger_type's onChange above, for the other
            // pair of mutually-exclusive fields.
            onChange={() => form.setFieldsValue({ target_device_id: undefined, model_override: undefined })}
          />
        </Form.Item>
        {executionTarget === 'device' && (
          <Form.Item name="target_device_id" label="Target device" rules={[{ required: true, message: 'Required' }]}>
            <Select
              showSearch
              optionFilterProp="label"
              options={(devices ?? []).map((d) => ({ value: d.id, label: d.name }))}
            />
          </Form.Item>
        )}
        {executionTarget === 'cloud' && (
          <Form.Item
            name="model_override"
            label="Model"
            rules={[{ required: true, message: 'Required' }]}
            extra='Format "provider:model", e.g. "anthropic:claude-sonnet-5". It must match a configured provider setting.'
          >
            <Input placeholder="anthropic:claude-sonnet-5" />
          </Form.Item>
        )}
        <Form.Item name="prompt" label="Prompt" rules={[{ required: true, message: 'Required' }]}>
          <Input.TextArea rows={5} placeholder="Instructions for the model to run each time this job executes." />
        </Form.Item>
      </Form>
    </Drawer>
  ) }
