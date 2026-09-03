import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { Alert, Button, Card, Empty, Input, message, Modal, Popconfirm, Space, Tag, Typography, Upload } from 'antd'
import type { TableProps, UploadProps } from 'antd'
import {
  ArrowLeftOutlined,
  DeleteOutlined,
  EditOutlined,
  HistoryOutlined,
  LoadingOutlined,
  ThunderboltOutlined,
  UploadOutlined,
} from '@ant-design/icons'
import {
  useCorpus,
  useCorpusFiles,
  useUpdateCorpus,
  useDeleteCorpus,
  useUploadCorpusFile,
  useDetachCorpusFile,
  useIngestCorpusFile,
  useIngestionJobs,
  useSearchCorpus,
  type CorpusFile,
  type IngestionJob,
} from '@/api/knowledge'
import { getErrorMessage } from '@/api/errors'
import { PageHeader } from '@/components/PageHeader'
import { palette } from '@/theme/tokens'
import { ConsoleTable } from '@/components/ConsoleTable'
import { CorpusFormDrawer } from '@/components/knowledge/CorpusFormDrawer'
import { SearchTestCard } from '@/components/knowledge/SearchTestCard'

const STATUS_COLOR: Record<string, string> = {
  pending: 'default',
  ingested: 'success',
  completed: 'success',
  failed: 'error',
  queued: 'processing',
  running: 'processing',
}

const IN_PROGRESS_JOB_STATUSES = new Set(['queued', 'running'])

export function CorpusDetailPage() {
  const { organizationId, corpusId } = useParams<{ organizationId: string; corpusId: string }>()
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)
  const [errorModalFile, setErrorModalFile] = useState<CorpusFile | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historySearch, setHistorySearch] = useState('')
  const { data: corpus, error: corpusError } = useCorpus(corpusId)
  const { data: files, isLoading: filesLoading, error: filesError } = useCorpusFiles(corpusId)
  const { data: jobs, error: jobsError } = useIngestionJobs(corpusId)
  const uploadFile = useUploadCorpusFile(corpusId ?? '')
  const detachFile = useDetachCorpusFile(corpusId ?? '')
  const ingestFile = useIngestCorpusFile(corpusId ?? '')
  const updateCorpus = useUpdateCorpus()
  const deleteCorpus = useDeleteCorpus()
  const searchCorpus = useSearchCorpus(corpusId ?? '')

  // jobs comes back newest-created-first per file (see ListIngestionJobs),
  // so the first match per corpus_file_id is that file's latest attempt -
  // what the merged Files row's Attempts/error-popup should reflect. Old
  // superseded attempts (e.g. a transient failure before a successful
  // retry) still show up in the History modal, just not on the main row.
  const latestJobByFileId = useMemo(() => {
    const map = new Map<string, IngestionJob>()
    for (const job of jobs ?? []) {
      if (job.corpus_file_id && !map.has(job.corpus_file_id)) {
        map.set(job.corpus_file_id, job)
      }
    }
    return map
  }, [jobs])

  const filteredHistory = useMemo(() => {
    const q = historySearch.trim().toLowerCase()
    if (!q) return jobs ?? []
    return (jobs ?? []).filter((job) => job.filename?.toLowerCase().includes(q))
  }, [jobs, historySearch])

  const canonicalOrganizationId = corpus?.organization_id ?? organizationId
  const corporaPath = canonicalOrganizationId ? `/orgs/${canonicalOrganizationId}/knowledge/corpora` : null
  const corpusDetailPath =
    canonicalOrganizationId && corpus?.id
      ? `/orgs/${canonicalOrganizationId}/knowledge/corpora/${corpus.id}`
      : null

  useEffect(() => {
    if (!corpusId || !corpusDetailPath) return
    if (organizationId === canonicalOrganizationId) return
    navigate(corpusDetailPath, { replace: true })
  }, [canonicalOrganizationId, corpusDetailPath, corpusId, navigate, organizationId])

  if (!corpusId) return null

  // A failed corpus fetch (403 on a corpus belonging to another org, 404, a
  // transient 5xx) must never render as if the corpus just has no files/jobs
  // yet — canonicalOrganizationId falls back to the URL's own org id when
  // `corpus` is undefined, which used to let the page render past this point
  // looking like an empty-but-otherwise-normal corpus. See the 2026-08-06
  // audit: this was the illustrating example for the "failed fetch renders
  // as empty" finding across the console.
  if (corpusError) {
    return (
      <div>
        <PageHeader />
        <Alert
          type="error"
          showIcon
          message="Couldn't load this corpus"
          description={getErrorMessage(corpusError)}
          action={
            corporaPath ? (
              <Button size="small" onClick={() => navigate(corporaPath)}>
                Back to corpora
              </Button>
            ) : undefined
          }
        />
      </div>
    )
  }

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
      key: 'status',
      width: 130,
      render: (_, record) => {
        const job = record.id ? latestJobByFileId.get(record.id) : undefined
        if (job && IN_PROGRESS_JOB_STATUSES.has(job.status ?? '')) {
          return (
            <Tag icon={<LoadingOutlined spin />} color="processing">
              {job.status}
            </Tag>
          )
        }
        if (record.status === 'failed') {
          return (
            <Tag
              color="error"
              style={{ cursor: 'pointer' }}
              onClick={() => setErrorModalFile(record)}
              title="Click to see the error"
            >
              failed
            </Tag>
          )
        }
        return <Tag color={STATUS_COLOR[record.status ?? '']}>{record.status}</Tag>
      },
    },
    {
      title: 'Attempts',
      key: 'attempts',
      width: 90,
      render: (_, record) => {
        const job = record.id ? latestJobByFileId.get(record.id) : undefined
        return job ? `${job.attempt_count}/${job.max_attempts}` : '—'
      },
    },
    { title: 'Chunks', dataIndex: 'chunk_count', key: 'chunk_count', width: 90 },
    { title: 'Size', dataIndex: 'size', key: 'size', width: 100, render: (size: number) => formatBytes(size) },
    {
      title: '',
      key: 'actions',
      width: 96,
      render: (_, record) => (
        <Space size={4}>
          <Button
            size="small"
            icon={<ThunderboltOutlined />}
            loading={ingestFile.isPending}
            title="Re-ingest, upgrades to real vectors once an embedder is configured"
            onClick={() =>
              ingestFile.mutate(record.id!, {
                onSuccess: () => message.success(`Queued ${record.filename} for ingestion`),
                onError: (error) => message.error(getErrorMessage(error)),
              })
            }
            aria-label={`Re-ingest ${record.filename}`}
          />
          <Popconfirm
            title={`Remove ${record.filename}?`}
            description="Deletes its ingested vector chunks too."
            onConfirm={() =>
              detachFile.mutate(record.id!, {
                onError: (error) => message.error(getErrorMessage(error)),
              })
            }
          >
            <Button size="small" danger icon={<DeleteOutlined />} aria-label={`Remove ${record.filename}`} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const historyColumns: TableProps<IngestionJob>['columns'] = [
    { title: 'File', dataIndex: 'filename', key: 'filename' },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status: string) => <Tag color={STATUS_COLOR[status]}>{status}</Tag>,
    },
    { title: 'Attempts', key: 'attempts', width: 100, render: (_, record) => `${record.attempt_count}/${record.max_attempts}` },
    { title: 'Error', dataIndex: 'last_error', key: 'last_error', ellipsis: true, render: (value) => value || 'No error' },
    {
      title: 'When',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 170,
      render: (value: string | undefined) => (value ? new Date(value).toLocaleString() : '—'),
    },
  ]

  return (
    <div>
      <PageHeader
        actions={
          <Space>
            <Button icon={<ArrowLeftOutlined />} onClick={() => corporaPath && navigate(corporaPath)} disabled={!corporaPath}>
              Back to corpora
            </Button>
            <Button icon={<EditOutlined />} onClick={() => setEditing(true)} disabled={!corpus}>
              Edit
            </Button>
            <Popconfirm
              title={`Delete ${corpus?.name ?? 'this corpus'}?`}
              description="Deletes its files, ingestion jobs, and entire vector namespace."
              onConfirm={() =>
                deleteCorpus.mutate(corpusId, {
                  onSuccess: () => corporaPath && navigate(corporaPath),
                  onError: (error) => message.error(getErrorMessage(error)),
                })
              }
            >
              <Button danger icon={<DeleteOutlined />} disabled={!corpus}>
                Delete
              </Button>
            </Popconfirm>
            <Upload {...uploadProps}>
              <Button type="primary" icon={<UploadOutlined />} loading={uploadFile.isPending}>
                Upload file
              </Button>
            </Upload>
          </Space>
        }
      />

      {/* The corpus's own name/description - unlike every other page's
          PageHeader description (removed 2026-09-03, pure boilerplate), this
          is the one piece of identifying info nothing else on screen shows:
          the breadcrumb/subnav above only ever say "Knowledge"/"Corpora". */}
      <div style={{ marginBottom: 20 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          {corpus?.name ?? 'Corpus'}
        </Typography.Title>
        <Typography.Text style={{ color: palette.inkSecondary, fontSize: 13.5 }}>
          {corpus?.description || `${corpus?.chunk_count ?? 0} chunks ingested`}
        </Typography.Text>
      </div>

      <Space orientation="vertical" size={20} style={{ width: '100%' }}>
        <Card
          title="Files"
          size="small"
          extra={
            <Button
              size="small"
              icon={<HistoryOutlined />}
              onClick={() => setHistoryOpen(true)}
              disabled={!jobs || jobs.length === 0}
            >
              History
            </Button>
          }
        >
          {jobsError && (
            <Alert
              type="warning"
              showIcon
              message="Couldn't load ingestion attempts. Status still reflects each file's own record."
              description={getErrorMessage(jobsError)}
              style={{ marginBottom: 12 }}
            />
          )}
          <ConsoleTable<CorpusFile>
            rowKey="id"
            size="small"
            columns={fileColumns}
            dataSource={files ?? []}
            loading={filesLoading}
            queryError={filesError}
            pagination={false}
            locale={{ emptyText: <Empty description="No files uploaded yet" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
          />
        </Card>

        <SearchTestCard placeholder="Ask something this corpus should be able to answer" search={searchCorpus} />
      </Space>

      <Modal
        open={Boolean(errorModalFile)}
        onCancel={() => setErrorModalFile(null)}
        footer={null}
        centered
        title={`Ingestion error — ${errorModalFile?.filename ?? ''}`}
      >
        <Alert
          type="error"
          showIcon
          message={
            (errorModalFile?.id ? latestJobByFileId.get(errorModalFile.id)?.last_error : undefined) ||
            'No error message recorded for this attempt.'
          }
        />
      </Modal>

      <Modal
        open={historyOpen}
        onCancel={() => setHistoryOpen(false)}
        footer={null}
        centered
        width={800}
        title="Ingestion history"
      >
        <Input.Search
          placeholder="Filter by filename"
          allowClear
          value={historySearch}
          onChange={(e) => setHistorySearch(e.target.value)}
          style={{ marginBottom: 12 }}
        />
        <ConsoleTable<IngestionJob>
          rowKey="id"
          size="small"
          columns={historyColumns}
          dataSource={filteredHistory}
          pagination={{ pageSize: 8, hideOnSinglePage: true }}
          locale={{ emptyText: <Empty description="No ingestion attempts match" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
        />
      </Modal>

      {corpus && (
        <CorpusFormDrawer
          corpus={corpus}
          open={editing}
          onClose={() => setEditing(false)}
          onSubmit={(values) => {
            updateCorpus.mutate(
              { id: corpus.id!, body: values },
              {
                onSuccess: () => setEditing(false),
                onError: (error) => message.error(getErrorMessage(error)),
              },
            )
          }}
          submitting={updateCorpus.isPending}
        />
      )}
    </div>
  )
}

function formatBytes(bytes: number): string {
  if (bytes === undefined || bytes === null) return 'Unknown size'
  if (bytes === 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
