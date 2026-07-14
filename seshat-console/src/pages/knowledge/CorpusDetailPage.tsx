import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Alert,
  Button,
  Card,
  Empty,
  Input,
  message,
  Popconfirm,
  Space,
  Table,
  Tag,
  Typography,
  Upload,
} from 'antd'
import type { TableProps, UploadProps } from 'antd'
import { ArrowLeftOutlined, DeleteOutlined, ReloadOutlined, SearchOutlined, UploadOutlined } from '@ant-design/icons'
import {
  useCorpus,
  useCorpusFiles,
  useUploadCorpusFile,
  useDetachCorpusFile,
  useIngestionJobs,
  useRetryIngestionJob,
  useSearchCorpus,
  type CorpusFile,
  type IngestionJob,
  type SearchResponse,
} from '@/api/knowledge'
import { getErrorMessage } from '@/api/errors'
import { PageHeader } from '@/components/PageHeader'
import { palette, monoStack } from '@/theme/tokens'

const STATUS_COLOR: Record<string, string> = {
  pending: 'default',
  ingested: 'success',
  completed: 'success',
  failed: 'error',
  queued: 'processing',
  running: 'processing',
}

export function CorpusDetailPage() {
  const { corpusId } = useParams<{ corpusId: string }>()
  const navigate = useNavigate()
  const { data: corpus } = useCorpus(corpusId)
  const { data: files, isLoading: filesLoading } = useCorpusFiles(corpusId)
  const { data: jobs } = useIngestionJobs(corpusId)
  const uploadFile = useUploadCorpusFile(corpusId ?? '')
  const detachFile = useDetachCorpusFile(corpusId ?? '')
  const retryJob = useRetryIngestionJob(corpusId ?? '')

  if (!corpusId) return null

  const uploadProps: UploadProps = {
    multiple: true,
    showUploadList: false,
    customRequest: ({ file, onSuccess, onError }) => {
      uploadFile.mutate(file as File, {
        onSuccess: (data) => {
          onSuccess?.(data)
          message.success(`${(file as File).name} uploaded`)
        },
        onError: (error) => {
          onError?.(error as Error)
          message.error(getErrorMessage(error))
        },
      })
    },
  }

  const fileColumns: TableProps<CorpusFile>['columns'] = [
    { title: 'Filename', dataIndex: 'filename', key: 'filename' },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status: string) => <Tag color={STATUS_COLOR[status]}>{status}</Tag>,
    },
    { title: 'Chunks', dataIndex: 'chunk_count', key: 'chunk_count', width: 90 },
    { title: 'Size', dataIndex: 'size', key: 'size', width: 100, render: (size: number) => formatBytes(size) },
    {
      title: '',
      key: 'actions',
      width: 64,
      render: (_, record) => (
        <Popconfirm
          title={`Remove ${record.filename}?`}
          description="Deletes its ingested vector chunks too."
          onConfirm={() => detachFile.mutate(record.id!, { onError: (error) => message.error(getErrorMessage(error)) })}
        >
          <Button size="small" danger icon={<DeleteOutlined />} aria-label={`Remove ${record.filename}`} />
        </Popconfirm>
      ),
    },
  ]

  const jobColumns: TableProps<IngestionJob>['columns'] = [
    { title: 'File', dataIndex: 'filename', key: 'filename' },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status: string) => <Tag color={STATUS_COLOR[status]}>{status}</Tag>,
    },
    { title: 'Attempts', key: 'attempts', width: 100, render: (_, r) => `${r.attempt_count}/${r.max_attempts}` },
    { title: 'Error', dataIndex: 'last_error', key: 'last_error', ellipsis: true, render: (v) => v || '—' },
    {
      title: '',
      key: 'actions',
      width: 64,
      render: (_, record) =>
        record.status === 'failed' && (
          <Button
            size="small"
            icon={<ReloadOutlined />}
            loading={retryJob.isPending}
            onClick={() => retryJob.mutate(record.id!, { onError: (error) => message.error(getErrorMessage(error)) })}
            aria-label={`Retry ${record.filename}`}
          />
        ),
    },
  ]

  return (
    <div>
      <PageHeader
        title={corpus?.name ?? 'Corpus'}
        description={corpus?.description || `${corpus?.chunk_count ?? 0} chunks ingested`}
        actions={
          <Space>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/corpora')}>
              Back to corpora
            </Button>
            <Upload {...uploadProps}>
              <Button type="primary" icon={<UploadOutlined />} loading={uploadFile.isPending}>
                Upload file
              </Button>
            </Upload>
          </Space>
        }
      />

      <Space orientation="vertical" size={20} style={{ width: '100%' }}>
        <Card title="Files" size="small">
          <Table<CorpusFile>
            rowKey="id"
            size="small"
            columns={fileColumns}
            dataSource={files ?? []}
            loading={filesLoading}
            pagination={false}
            locale={{ emptyText: <Empty description="No files uploaded yet" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
          />
        </Card>

        {jobs && jobs.length > 0 && (
          <Card title="Ingestion jobs" size="small">
            <Table<IngestionJob>
              rowKey="id"
              size="small"
              columns={jobColumns}
              dataSource={jobs}
              pagination={false}
            />
          </Card>
        )}

        <SearchTestCard corpusId={corpusId} />
      </Space>
    </div>
  )
}

function SearchTestCard({ corpusId }: { corpusId: string }) {
  const [query, setQuery] = useState('')
  const [result, setResult] = useState<SearchResponse | null>(null)
  const search = useSearchCorpus(corpusId)

  const runSearch = () => {
    if (!query.trim()) return
    search.mutate(
      { query },
      {
        onSuccess: (data) => setResult(data ?? null),
        onError: (error) => message.error(getErrorMessage(error)),
      },
    )
  }

  return (
    <Card title="Try a search" size="small">
      <Space.Compact style={{ width: '100%', marginBottom: 12 }}>
        <Input
          placeholder="Ask something this corpus should be able to answer"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onPressEnter={runSearch}
        />
        <Button type="primary" icon={<SearchOutlined />} loading={search.isPending} onClick={runSearch}>
          Search
        </Button>
      </Space.Compact>

      {search.isError && (
        <Alert type="warning" showIcon title="Search failed" description={getErrorMessage(search.error)} />
      )}

      {result && (result.results?.length ?? 0) === 0 && (
        <Empty description="No matching chunks found" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      )}

      {result && (result.results?.length ?? 0) > 0 && (
        <Space orientation="vertical" size={12} style={{ width: '100%' }}>
          {result.results!.map((item, index) => (
            <div key={index} style={{ paddingBottom: 12, borderBottom: `1px solid ${palette.border}` }}>
              <Space style={{ marginBottom: 4 }}>
                <Tag style={{ fontFamily: monoStack, margin: 0 }}>score {item.score?.toFixed(3)}</Tag>
                {item.metadata?.filename && (
                  <Typography.Text style={{ fontSize: 12, color: palette.inkTertiary }}>
                    {item.metadata.filename}
                  </Typography.Text>
                )}
              </Space>
              <Typography.Paragraph style={{ margin: 0, fontSize: 13 }} ellipsis={{ rows: 3, expandable: true }}>
                {item.text}
              </Typography.Paragraph>
            </div>
          ))}
        </Space>
      )}
    </Card>
  )
}

function formatBytes(bytes: number): string {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
