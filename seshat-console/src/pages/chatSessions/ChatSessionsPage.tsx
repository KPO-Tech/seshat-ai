import { useState } from 'react'
import { Empty, Typography } from 'antd'
import type { TableProps } from 'antd'
import { MessageOutlined } from '@ant-design/icons'
import { useParams } from 'react-router'
import { useWorkspaceChatSessionsList, type WorkspaceChatSessionSummary } from '@/api/workspaceChatSessions'
import { PageHeader } from '@/components/PageHeader'
import { ConsoleTable } from '@/components/ConsoleTable'
import { palette } from '@/theme/tokens'

const PAGE_SIZE = 20

// Metadata only (who, when, how many messages) - no message content. This
// page is the admin-visibility surface for what's otherwise a personal
// experimentation screen (Workspace > Chat); a specific conversation's
// actual messages are never fetched here, only by the owning member
// themselves via that other screen.
export function ChatSessionsPage() {
  const { organizationId } = useParams<{ organizationId: string }>()
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState<{ field: string; order: 'asc' | 'desc' }>({ field: 'updated_at', order: 'desc' })

  const { data, isLoading, isFetching, error } = useWorkspaceChatSessionsList(organizationId, {
    sort: sort.field,
    order: sort.order,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  })

  const handleTableChange: TableProps<WorkspaceChatSessionSummary>['onChange'] = (_pagination, _filters, sorter) => {
    const single = Array.isArray(sorter) ? sorter[0] : sorter
    if (single?.field && single.order) {
      setSort({ field: String(single.field), order: single.order === 'ascend' ? 'asc' : 'desc' })
    }
  }

  const columns: TableProps<WorkspaceChatSessionSummary>['columns'] = [
    {
      title: 'Title',
      dataIndex: 'title',
      key: 'title',
      sorter: true,
      render: (title: string) => title || <Typography.Text type="secondary">Untitled</Typography.Text>,
    },
    {
      title: 'Member',
      key: 'member',
      render: (_, record) => (
        <div>
          <div style={{ fontWeight: 500 }}>{record.user_display_name}</div>
          <Typography.Text style={{ fontSize: 12, color: palette.inkTertiary }}>{record.user_email}</Typography.Text>
        </div>
      ),
    },
    { title: 'Messages', dataIndex: 'message_count', key: 'message_count', width: 110 },
    {
      title: 'Last active',
      dataIndex: 'updated_at',
      key: 'updated_at',
      width: 180,
      sorter: true,
      render: (value: string | undefined) => (value ? new Date(value).toLocaleString() : '—'),
    },
    {
      title: 'Started',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 180,
      sorter: true,
      render: (value: string | undefined) => (value ? new Date(value).toLocaleString() : '—'),
    },
  ]

  return (
    <div>
      <PageHeader
        description="Workspace Chat activity across this organization's members - metadata only, not message content."
      />

      <ConsoleTable<WorkspaceChatSessionSummary>
        rowKey="id"
        columns={columns}
        dataSource={data?.sessions ?? []}
        loading={isLoading || isFetching}
        queryError={error}
        onChange={handleTableChange}
        locale={{
          emptyText: (
            <Empty
              image={<MessageOutlined style={{ fontSize: 32, color: palette.inkTertiary }} />}
              description="No chat sessions yet"
              style={{ padding: '32px 0' }}
            />
          ),
        }}
        pagination={{
          current: page,
          pageSize: PAGE_SIZE,
          total: data?.total ?? 0,
          onChange: setPage,
          showTotal: (total) => `${total} sessions`,
        }}
      />
    </div>
  )
}
