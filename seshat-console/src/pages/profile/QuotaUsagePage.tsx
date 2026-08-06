import { Card, Empty, Space, Tag, Typography } from 'antd'
import { BarChartOutlined } from '@ant-design/icons'
import { useMyQuotaUsage } from '@/api/quotaUsage'
import { PageHeader } from '@/components/PageHeader'
import { ConsoleTable } from '@/components/ConsoleTable'
import type { components } from '@/api/schema'
import type { TableProps } from 'antd'
import { presentDateTime } from '@/lib/present'
import { palette } from '@/theme/tokens'

type UsageEntry = components['schemas']['UsageEntry']

export function QuotaUsagePage() {
  const { data, isLoading, error } = useMyQuotaUsage()
  const entries = data?.entries ?? []

  const columns: TableProps<UsageEntry>['columns'] = [
    {
      title: 'Metric',
      dataIndex: 'metric',
      key: 'metric',
      render: (value: string | undefined) => <Tag>{value ?? 'unknown'}</Tag>,
    },
    { title: 'Period', dataIndex: 'period', key: 'period', width: 120 },
    { title: 'Key', dataIndex: 'period_key', key: 'period_key', width: 140 },
    { title: 'Count', dataIndex: 'count', key: 'count', width: 120 },
    {
      title: 'Updated',
      dataIndex: 'updated_at',
      key: 'updated_at',
      render: (value: string | undefined) => presentDateTime(value, 'Unknown'),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Usage Counters"
        description="Personal usage counters attached to your account. These are informational only and never become platform-wide defaults or shared organization settings."
      />

      <Card style={{ marginBottom: 24 }}>
        <Space orientation="vertical" size={6}>
          <Typography.Text strong>Total entries</Typography.Text>
          <Typography.Text style={{ fontSize: 24 }}>{entries.length}</Typography.Text>
          <Typography.Text type="secondary">
            Counts are tracked per metric and per period key. They are not editable from this screen.
          </Typography.Text>
        </Space>
      </Card>

      <ConsoleTable<UsageEntry>
        rowKey={(record) => `${record.metric}-${record.period}-${record.period_key}`}
        columns={columns}
        dataSource={entries}
        loading={isLoading}
        queryError={error}
        pagination={false}
        locale={{
          emptyText: (
            <Empty
              image={<BarChartOutlined style={{ fontSize: 32, color: palette.inkTertiary }} />}
              description="No usage counters yet"
              style={{ padding: '32px 0' }}
            />
          ),
        }}
      />
    </div>
  )
}
