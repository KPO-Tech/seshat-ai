import { Button, Empty, Popconfirm, Typography, message } from 'antd'
import type { TableProps } from 'antd'
import { DeleteOutlined, DatabaseOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useDeleteCorpus, type Corpus } from '@/api/knowledge'
import { getErrorMessage } from '@/api/errors'
import { ConsoleTable } from '@/components/ConsoleTable'
import { palette } from '@/theme/tokens'

// Shared between CorporaPage (unfiled corpora) and FolderDetailPage (a
// folder's corpora) - same columns/row behavior either way, only the
// dataSource/emptyDescription differ per caller.
export function CorporaTable({
  organizationId,
  corpora,
  loading,
  emptyDescription,
  pagination,
}: {
  organizationId: string | null
  corpora: Corpus[]
  loading: boolean
  emptyDescription: string
  pagination?: TableProps<Corpus>['pagination']
}) {
  const navigate = useNavigate()
  const deleteCorpus = useDeleteCorpus()

  const columns: TableProps<Corpus>['columns'] = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record) => (
        <div>
          <div style={{ fontWeight: 500 }}>{name}</div>
          {record.description && (
            <Typography.Text style={{ fontSize: 12, color: palette.inkTertiary }}>
              {record.description}
            </Typography.Text>
          )}
        </div>
      ),
    },
    { title: 'Chunks', dataIndex: 'chunk_count', key: 'chunk_count', width: 100 },
    {
      title: '',
      key: 'actions',
      width: 64,
      render: (_, record) => (
        <Popconfirm
          title={`Delete ${record.name}?`}
          description="Removes its files, ingestion jobs, and vector data."
          onConfirm={(event) => {
            event?.stopPropagation()
            deleteCorpus.mutate(record.id!, {
              onError: (error) => message.error(getErrorMessage(error)),
            })
          }}
        >
          <Button
            size="small"
            danger
            icon={<DeleteOutlined />}
            onClick={(event) => event.stopPropagation()}
            aria-label={`Delete ${record.name}`}
          />
        </Popconfirm>
      ),
    },
  ]

  return (
    <ConsoleTable<Corpus>
      rowKey="id"
      columns={columns}
      dataSource={corpora}
      loading={loading}
      onRow={(record) => {
        const targetOrganizationId = record.organization_id ?? organizationId
        if (!record.id || !targetOrganizationId) return {}
        return {
          onClick: () => navigate(`/orgs/${targetOrganizationId}/knowledge/corpora/${record.id}`),
          style: { cursor: 'pointer' },
        }
      }}
      locale={{
        emptyText: (
          <Empty
            image={<DatabaseOutlined style={{ fontSize: 32, color: palette.inkTertiary }} />}
            description={emptyDescription}
            style={{ padding: '32px 0' }}
          />
        ),
      }}
      pagination={pagination ?? false}
    />
  )
}
