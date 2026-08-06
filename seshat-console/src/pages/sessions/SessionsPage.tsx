import { useState } from 'react'
import { Button, Empty, message, Popconfirm, Typography } from 'antd'
import type { TableProps } from 'antd'
import { StopOutlined, KeyOutlined } from '@ant-design/icons'
import { useSessionsList, useRevokeSession, type SessionInfo } from '@/api/sessions'
import { getErrorMessage } from '@/api/errors'
import { PageHeader } from '@/components/PageHeader'
import { ConsoleTable } from '@/components/ConsoleTable'
import { palette } from '@/theme/tokens'

const PAGE_SIZE = 20

export function SessionsPage() { const [page, setPage] = useState(1)

  const { data, isLoading, isFetching, error } = useSessionsList(undefined, { sort: 'created_at',
    order: 'desc',
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE, })
  const revokeSession = useRevokeSession()

  const columns: TableProps<SessionInfo>['columns'] = [
    { title: 'User',
      dataIndex: 'user_email',
      key: 'user_email',
      render: (email: string, record) => (
        <div>
          <div style={{ fontWeight: 500 }}>{record.user_display_name || email}</div>
          <Typography.Text style={{ fontSize: 12, color: palette.inkTertiary }}>{email}</Typography.Text>
        </div>
      ), },
    { title: 'Created', dataIndex: 'created_at', key: 'created_at', render: (v: string) => new Date(v).toLocaleString() },
    { title: 'Expires', dataIndex: 'expires_at', key: 'expires_at', render: (v: string) => new Date(v).toLocaleString() },
    { title: '',
      key: 'actions',
      width: 64,
      render: (_, record) => (
        <Popconfirm
          title="Revoke this session?"
          onConfirm={() =>
            revokeSession.mutate(record.id!, { onError: (error) => message.error(getErrorMessage(error)) }) }
        >
          <Button size="small" danger icon={<StopOutlined />} aria-label="Revoke session" />
        </Popconfirm>
      ), },
  ]

  return (
    <div>
      <PageHeader
        title="Sessions"
        description="Active platform sessions."
      />

      <ConsoleTable<SessionInfo>
        rowKey="id"
        columns={columns}
        dataSource={data?.sessions ?? []}
        loading={isLoading || isFetching}
        queryError={error}
        locale={{ emptyText: (
            <Empty
              image={<KeyOutlined style={{ fontSize: 32, color: palette.inkTertiary }} />}
              description="No sessions"
              style={{ padding: '32px 0' }}
            />
          ), }}
        pagination={{ current: page,
          pageSize: PAGE_SIZE,
          total: data?.total ?? 0,
          onChange: setPage,
          showTotal: (total) => `${total} sessions`, }}
      />
    </div>
  ) }
