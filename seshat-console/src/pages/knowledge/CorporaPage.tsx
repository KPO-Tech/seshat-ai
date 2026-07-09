import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, Button, Drawer, Empty, Form, Input, message, Popconfirm, Space, Table, Typography } from 'antd'
import type { TableProps } from 'antd'
import { PlusOutlined, DeleteOutlined, DatabaseOutlined } from '@ant-design/icons'
import {
  useCorporaList,
  useCreateCorpus,
  useDeleteCorpus,
  type Corpus,
  type CorpusInput,
} from '@/api/knowledge'
import { getErrorMessage } from '@/api/errors'
import { PageHeader } from '@/components/PageHeader'
import { OrganizationPicker } from '@/components/OrganizationPicker'
import { useConsoleOrgStore } from '@/store/consoleOrg'
import { palette } from '@/theme/tokens'

const PAGE_SIZE = 20

export function CorporaPage() {
  const navigate = useNavigate()
  const organizationId = useConsoleOrgStore((s) => s.organizationId)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)

  const { data, isLoading, isFetching } = useCorporaList(organizationId ?? undefined, {
    q: search || undefined,
    sort: 'name',
    order: 'asc',
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  })
  const createCorpus = useCreateCorpus()
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
            <Typography.Text style={{ fontSize: 12, color: palette.inkTertiary }}>{record.description}</Typography.Text>
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
          onConfirm={(e) => {
            e?.stopPropagation()
            deleteCorpus.mutate(record.id!, { onError: (error) => message.error(getErrorMessage(error)) })
          }}
        >
          <Button size="small" danger icon={<DeleteOutlined />} onClick={(e) => e.stopPropagation()} aria-label={`Delete ${record.name}`} />
        </Popconfirm>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Corpora"
        description="RAG document collections — upload files, watch ingestion, and search."
        actions={
          <Space>
            <OrganizationPicker />
            <Input.Search
              placeholder="Search corpora"
              allowClear
              onSearch={(value) => {
                setPage(1)
                setSearch(value)
              }}
              style={{ width: 220 }}
              disabled={!organizationId}
            />
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)} disabled={!organizationId}>
              New corpus
            </Button>
          </Space>
        }
      />

      {!organizationId ? (
        <Alert type="info" showIcon title="Pick an organization above to see its corpora." />
      ) : (
        <Table<Corpus>
          rowKey="id"
          columns={columns}
          dataSource={data?.corpora ?? []}
          loading={isLoading || isFetching}
          onRow={(record) => ({ onClick: () => navigate(`/corpora/${record.id}`), style: { cursor: 'pointer' } })}
          locale={{
            emptyText: (
              <Empty
                image={<DatabaseOutlined style={{ fontSize: 32, color: palette.inkTertiary }} />}
                description={search ? 'No corpora match your search' : 'No corpora yet'}
                style={{ padding: '32px 0' }}
              />
            ),
          }}
          pagination={{
            current: page,
            pageSize: PAGE_SIZE,
            total: data?.total ?? 0,
            onChange: setPage,
            showTotal: (total) => `${total} ${total === 1 ? 'corpus' : 'corpora'}`,
          }}
        />
      )}

      <CorpusFormDrawer
        open={creating}
        onClose={() => setCreating(false)}
        onSubmit={(values) => {
          if (!organizationId) return
          createCorpus.mutate(
            { ...values, organization_id: organizationId },
            {
              onSuccess: () => setCreating(false),
              onError: (error) => message.error(getErrorMessage(error)),
            },
          )
        }}
        submitting={createCorpus.isPending}
      />
    </div>
  )
}

function CorpusFormDrawer({
  open,
  onClose,
  onSubmit,
  submitting,
}: {
  open: boolean
  onClose: () => void
  onSubmit: (values: Omit<CorpusInput, 'organization_id'>) => void
  submitting: boolean
}) {
  const [form] = Form.useForm<CorpusInput>()

  useEffect(() => {
    if (open) form.setFieldsValue({ name: '', description: '' })
  }, [open, form])

  return (
    <Drawer
      title="New corpus"
      open={open}
      onClose={onClose}
      destroyOnHidden
      extra={
        <Button type="primary" loading={submitting} onClick={() => form.submit()}>
          Save
        </Button>
      }
    >
      <Form<CorpusInput> form={form} layout="vertical" onFinish={onSubmit}>
        <Form.Item name="name" label="Name" rules={[{ required: true, message: 'Required' }]}>
          <Input placeholder="Supplier Policies" />
        </Form.Item>
        <Form.Item name="description" label="Description">
          <Input.TextArea rows={3} placeholder="What this corpus is for" />
        </Form.Item>
      </Form>
    </Drawer>
  )
}
