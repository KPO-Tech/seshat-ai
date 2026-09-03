import { useState } from 'react'
import { Empty, Input, Space, Tag, Typography } from 'antd'
import type { TableProps } from 'antd'
import { FileSearchOutlined } from '@ant-design/icons'
import { useParams } from 'react-router'
import { useAuditEventsList, type AuditEvent } from '@/api/auditEvents'
import { PageHeader } from '@/components/PageHeader'
import { ConsoleTable } from '@/components/ConsoleTable'
import { palette, monoStack } from '@/theme/tokens'

const PAGE_SIZE = 30

export function AuditEventsPage() { const { organizationId } = useParams<{ organizationId: string }>()
  const [page, setPage] = useState(1)
  const [action, setAction] = useState('')

  const { data, isLoading, isFetching, error } = useAuditEventsList(
    { organizationId: organizationId ?? undefined, action: action || undefined },
    { sort: 'created_at', order: 'desc', limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE },
  )

  const columns: TableProps<AuditEvent>['columns'] = [
    { title: 'When',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 180,
      render: (v: string) => new Date(v).toLocaleString(), },
    { title: 'Action',
      dataIndex: 'action',
      key: 'action',
      render: (a: string) => <Tag style={{ fontFamily: monoStack }}>{a}</Tag>, },
    { title: 'Resource',
      key: 'resource',
      render: (_, record) => (
        <Space size={4}>
          <Typography.Text style={{ color: palette.inkSecondary }}>{record.resource_type}</Typography.Text>
          <Typography.Text code style={{ fontSize: 12 }}>
            {record.resource_id}
          </Typography.Text>
        </Space>
      ), },
    { title: 'Actor',
      dataIndex: 'actor_user_id',
      key: 'actor_user_id',
      render: (v: string) => <Typography.Text code>{v || 'system'}</Typography.Text>, },
  ]

  return (
    <div>
      <PageHeader
        description={ organizationId
            ? 'Recent changes in this organization.'
            : 'Recent changes across the platform.' }
        actions={ <Input
            placeholder="Filter by action (e.g. login.succeeded)"
            allowClear
            style={{ width: 260 }}
            onChange={(e) => { setPage(1)
              setAction(e.target.value) }}
          /> }
      />

      <ConsoleTable<AuditEvent>
        rowKey="id"
        columns={columns}
        dataSource={data?.audit_events ?? []}
        loading={isLoading || isFetching}
        queryError={error}
        locale={{ emptyText: (
            <Empty
              image={<FileSearchOutlined style={{ fontSize: 32, color: palette.inkTertiary }} />}
              description="No audit events"
              style={{ padding: '32px 0' }}
            />
          ), }}
        pagination={{ current: page,
          pageSize: PAGE_SIZE,
          total: data?.total ?? 0,
          onChange: setPage,
          showTotal: (total) => `${total} events`, }}
      />
    </div>
  ) }
