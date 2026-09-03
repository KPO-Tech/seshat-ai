import { useState } from 'react'
import { Alert, Button, Empty, Form, Input, InputNumber, Modal, Select, Space, Switch, Tag, Typography, message } from 'antd'
import type { TableProps } from 'antd'
import { CompassOutlined, PlusOutlined, ReloadOutlined, ShopOutlined } from '@ant-design/icons'
import { useSweepArea, useSweepBusinesses, useSweepsList, type Business, type Sweep, type SweepAreaInput, type SweepBusinessesFilters } from '@/api/prospecting'
import { getErrorMessage } from '@/api/errors'
import { PageHeader } from '@/components/PageHeader'
import { ConsoleTable } from '@/components/ConsoleTable'
import { useScopedOrganizationId } from '@/hooks/useOrganizationScope'
import { palette } from '@/theme/tokens'

const STATUS_COLOR: Record<string, string> = {
  running: 'processing',
  partial: 'gold',
  completed: 'success',
  failed: 'error',
}

export function SweepsPage() {
  const organizationId = useScopedOrganizationId()
  const [creating, setCreating] = useState(false)
  const [businessesSweep, setBusinessesSweep] = useState<Sweep | null>(null)
  const { data, isLoading, error } = useSweepsList(organizationId ?? undefined)
  const sweepArea = useSweepArea()

  const columns: TableProps<Sweep>['columns'] = [
    {
      title: 'Area',
      key: 'area',
      render: (_, record) => (
        <div>
          <div style={{ fontWeight: 500 }}>{record.area_label || record.area_query}</div>
          <Typography.Text style={{ fontSize: 12, color: palette.inkTertiary }}>
            {record.country} · {(record.sectors ?? []).join(', ')}
          </Typography.Text>
        </div>
      ),
    },
    {
      title: 'Status',
      key: 'status',
      width: 130,
      render: (_, record) => <Tag color={STATUS_COLOR[record.status ?? '']}>{record.status}</Tag>,
    },
    {
      title: 'Progress',
      key: 'progress',
      width: 120,
      render: (_, record) => `${record.next_unit_index ?? 0} / ${record.total_units ?? 0}`,
    },
    {
      title: 'Businesses',
      dataIndex: 'businesses_found',
      key: 'businesses_found',
      width: 110,
    },
    {
      title: '',
      key: 'actions',
      width: 220,
      render: (_, record) => (
        <Space size={4}>
          <Button size="small" icon={<ShopOutlined />} onClick={() => setBusinessesSweep(record)}>
            View businesses
          </Button>
          {record.status !== 'completed' && record.status !== 'failed' && (
            <Button
              size="small"
              icon={<ReloadOutlined />}
              loading={sweepArea.isPending}
              onClick={() =>
                sweepArea.mutate(
                  { sweep_id: record.id, organization_id: organizationId ?? '', area: '', country: '' },
                  { onError: (error) => message.error(getErrorMessage(error)) },
                )
              }
            >
              Continue
            </Button>
          )}
        </Space>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        description="Business-discovery sweeps over an area."
        actions={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)} disabled={!organizationId}>
            New sweep
          </Button>
        }
      />

      <ConsoleTable<Sweep>
        rowKey="id"
        columns={columns}
        dataSource={data?.sweeps ?? []}
        loading={isLoading}
        queryError={error}
        pagination={false}
        locale={{
          emptyText: (
            <Empty
              image={<CompassOutlined style={{ fontSize: 32, color: palette.inkTertiary }} />}
              description="No sweeps yet"
              style={{ padding: '32px 0' }}
            />
          ),
        }}
      />

      <NewSweepModal
        open={creating}
        organizationId={organizationId}
        onClose={() => setCreating(false)}
        onCreated={() => setCreating(false)}
      />

      <SweepBusinessesModal sweep={businessesSweep} onClose={() => setBusinessesSweep(null)} />
    </div>
  )
}

function NewSweepModal({
  open,
  organizationId,
  onClose,
  onCreated,
}: {
  open: boolean
  organizationId: string | null
  onClose: () => void
  onCreated: (sweep: Sweep) => void
}) {
  const sweepArea = useSweepArea()
  const [form] = Form.useForm<SweepAreaInput>()

  return (
    <Modal title="New sweep" open={open} onCancel={onClose} centered destroyOnHidden footer={
      <Button type="primary" loading={sweepArea.isPending} onClick={() => form.submit()}>
        Start sweep
      </Button>
    }>
      <Form<SweepAreaInput>
        form={form}
        layout="vertical"
        onFinish={(values) => {
          if (!organizationId) return
          sweepArea.mutate(
            { ...values, organization_id: organizationId },
            {
              onSuccess: (sweep) => onCreated(sweep),
              onError: (error) => message.error(getErrorMessage(error)),
            },
          )
        }}
      >
        <Form.Item name="area" label="Area" rules={[{ required: true, message: 'Required' }]} extra="Free-text, e.g. &quot;Lyon, France&quot; - geocoded automatically.">
          <Input placeholder="Lyon, France" />
        </Form.Item>
        <Form.Item name="country" label="Country" rules={[{ required: true, message: 'Required' }]}>
          <Input placeholder="FR" />
        </Form.Item>
        <Form.Item name="sectors" label="Sectors" extra="Business categories to search for.">
          <Select mode="tags" placeholder="restaurant, plumber, ..." open={false} />
        </Form.Item>
        <Form.Item name="radius_km" label="Radius (km)">
          <InputNumber min={0.5} step={0.5} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="max_tiles" label="Max tiles this call" extra="Caps how much of the area this call covers - continue the sweep afterward for the rest.">
          <InputNumber min={1} style={{ width: '100%' }} />
        </Form.Item>
      </Form>
    </Modal>
  )
}

function SweepBusinessesModal({ sweep, onClose }: { sweep: Sweep | null; onClose: () => void }) {
  const [filters, setFilters] = useState<SweepBusinessesFilters>({ limit: 20, offset: 0 })
  const { data, isLoading, error } = useSweepBusinesses(sweep?.id, filters)

  const columns: TableProps<Business>['columns'] = [
    { title: 'Name', dataIndex: 'name', key: 'name' },
    { title: 'City', dataIndex: 'city', key: 'city', width: 140 },
    { title: 'Phone', dataIndex: 'phone', key: 'phone', width: 140, render: (v) => v || '—' },
    { title: 'Rating', dataIndex: 'rating', key: 'rating', width: 90, render: (v: number | undefined) => (v ? v.toFixed(1) : '—') },
    { title: 'Score', dataIndex: 'reachability_score', key: 'reachability_score', width: 90 },
  ]

  return (
    <Modal open={Boolean(sweep)} onCancel={onClose} footer={null} centered width={900} title={`Businesses — ${sweep?.area_label ?? sweep?.area_query ?? ''}`} destroyOnHidden>
      <Space style={{ marginBottom: 12 }} wrap>
        <Input.Search
          placeholder="Filter by sector"
          allowClear
          style={{ width: 200 }}
          onSearch={(value) => setFilters((prev) => ({ ...prev, sector: value || undefined, offset: 0 }))}
        />
        <InputNumber
          placeholder="Min score"
          min={0}
          max={100}
          onChange={(value) => setFilters((prev) => ({ ...prev, minScore: value ?? undefined, offset: 0 }))}
        />
        <Space size={4}>
          <Typography.Text type="secondary">Has phone</Typography.Text>
          <Switch onChange={(checked) => setFilters((prev) => ({ ...prev, hasPhone: checked || undefined, offset: 0 }))} />
        </Space>
      </Space>
      {error && <Alert type="warning" showIcon message="Couldn't load businesses" description={getErrorMessage(error)} style={{ marginBottom: 12 }} />}
      <ConsoleTable<Business>
        rowKey="id"
        size="small"
        columns={columns}
        dataSource={data?.businesses ?? []}
        loading={isLoading}
        pagination={{
          pageSize: filters.limit ?? 20,
          total: data?.total ?? 0,
          current: Math.floor((filters.offset ?? 0) / (filters.limit ?? 20)) + 1,
          onChange: (page, pageSize) => setFilters((prev) => ({ ...prev, limit: pageSize, offset: (page - 1) * pageSize })),
        }}
        locale={{ emptyText: <Empty description="No businesses match these filters" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
      />
    </Modal>
  )
}
