import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { Button, Drawer, Empty, Popconfirm, Select, Space, Tag, Typography, message } from 'antd'
import type { TableProps } from 'antd'
import { StopOutlined, PlayCircleOutlined } from '@ant-design/icons'
import { useRunsList, useCancelRun, type Run, type RunStatus } from '@/api/runs'
import { getErrorMessage } from '@/api/errors'
import { PageHeader } from '@/components/PageHeader'
import { ConsoleTable } from '@/components/ConsoleTable'
import { useScopedOrganizationId } from '@/hooks/useOrganizationScope'
import { palette, monoStack } from '@/theme/tokens'
import { presentDateTime } from '@/lib/present'

const PAGE_SIZE = 20

const STATUS_COLORS: Record<string, string> = { queued: 'default',
  claimed: 'blue',
  running: 'processing',
  completed: 'green',
  failed: 'red',
  cancelled: 'default', }

const CANCELLABLE = new Set(['queued', 'claimed', 'running'])

export function RunsPage() { const organizationId = useScopedOrganizationId()
  const [searchParams, setSearchParams] = useSearchParams()
  const jobIdFilter = searchParams.get('job_id') ?? undefined
  const [status, setStatus] = useState<RunStatus | undefined>(undefined)
  const [page, setPage] = useState(1)
  const [detail, setDetail] = useState<Run | null>(null)

  const { data, isLoading, isFetching } = useRunsList(
    organizationId ?? undefined,
    { jobId: jobIdFilter, status },
    { sort: 'queued_at', order: 'desc', limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE },
  )
  const cancelRun = useCancelRun()

  const columns: TableProps<Run>['columns'] = [
    { title: 'Job',
      dataIndex: 'job_id',
      key: 'job_id',
      render: (v: string) => <Typography.Text code>{v}</Typography.Text>, },
    { title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (s: string) => <Tag color={STATUS_COLORS[s]}>{s}</Tag>, },
    { title: 'Target', dataIndex: 'execution_target', key: 'execution_target', width: 100 },
    { title: 'Queued',
      dataIndex: 'queued_at',
      key: 'queued_at',
      render: (v: string) => new Date(v).toLocaleString(), },
    { title: 'Finished',
      dataIndex: 'finished_at',
      key: 'finished_at',
      render: (v: string | null) => presentDateTime(v, 'Still running'), },
    { title: '',
      key: 'actions',
      width: 64,
      render: (_, record) =>
        CANCELLABLE.has(record.status!) ? (
          <Popconfirm
            title="Cancel this run?"
            onConfirm={(e) => { e?.stopPropagation()
              cancelRun.mutate(record.id!, { onError: (error) => message.error(getErrorMessage(error)) }) }}
          >
            <Button size="small" danger icon={<StopOutlined />} onClick={(e) => e.stopPropagation()} aria-label="Cancel run" />
          </Popconfirm>
        ) : null, },
  ]

  return (
    <div>
      <PageHeader
        title="Runs"
        description={jobIdFilter ? `Executions of job ${jobIdFilter}.` : 'Every job execution across this organization.'}
        actions={ <Space>
            {jobIdFilter && (
              <Button onClick={() => setSearchParams({})}>Clear job filter</Button>
            )}
            <Select
              allowClear
              placeholder="Status"
              style={{ width: 140 }}
              value={status}
              onChange={(v) => { setPage(1)
                setStatus(v as RunStatus | undefined) }}
              options={['queued', 'claimed', 'running', 'completed', 'failed', 'cancelled'].map((s) => ({ value: s,
                label: s, }))}
            />
          </Space> }
      />

      <ConsoleTable<Run>
          rowKey="id"
          columns={columns}
          dataSource={data?.runs ?? []}
          loading={isLoading || isFetching}
          onRow={(record) => ({ onClick: () => setDetail(record), style: { cursor: 'pointer' } })}
          locale={{ emptyText: (
              <Empty
                image={<PlayCircleOutlined style={{ fontSize: 32, color: palette.inkTertiary }} />}
                description="No runs yet"
                style={{ padding: '32px 0' }}
              />
            ), }}
          pagination={{ current: page,
            pageSize: PAGE_SIZE,
            total: data?.total ?? 0,
            onChange: setPage,
            showTotal: (total) => `${total} runs`, }}
        />

      <Drawer title="Run detail" open={detail !== null} onClose={() => setDetail(null)} size={480}>
        {detail && (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <div>
              <Typography.Text strong>Status</Typography.Text>
              <div>
                <Tag color={STATUS_COLORS[detail.status!]}>{detail.status}</Tag>
              </div>
            </div>
            {detail.exit_reason && (
              <div>
                <Typography.Text strong>Exit reason</Typography.Text>
                <Typography.Paragraph style={{ marginTop: 4 }}>{detail.exit_reason}</Typography.Paragraph>
              </div>
            )}
            {detail.output_text && (
              <div>
                <Typography.Text strong>Output</Typography.Text>
                <pre style={{ fontFamily: monoStack, fontSize: 12, whiteSpace: 'pre-wrap', marginTop: 4 }}>
                  {detail.output_text}
                </pre>
              </div>
            )}
            {detail.error_text && (
              <div>
                <Typography.Text strong type="danger">
                  Error
                </Typography.Text>
                <pre style={{ fontFamily: monoStack, fontSize: 12, whiteSpace: 'pre-wrap', marginTop: 4 }}>
                  {detail.error_text}
                </pre>
              </div>
            )}
          </Space>
        )}
      </Drawer>
    </div>
  ) }
