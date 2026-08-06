import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { Alert, Button, Card, Empty, message, Popconfirm, Space, Tag, Upload } from 'antd'
import type { TableProps, UploadProps } from 'antd'
import { ArrowLeftOutlined, DeleteOutlined, EditOutlined, ReloadOutlined, UploadOutlined } from '@ant-design/icons'
import {
  useCorpus,
  useCorpusFiles,
  useUpdateCorpus,
  useDeleteCorpus,
  useUploadCorpusFile,
  useDetachCorpusFile,
  useIngestionJobs,
  useRetryIngestionJob,
  useSearchCorpus,
  type CorpusFile,
  type IngestionJob,
} from '@/api/knowledge'
import { getErrorMessage } from '@/api/errors'
import { PageHeader } from '@/components/PageHeader'
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

export function CorpusDetailPage() {
  const { organizationId, corpusId } = useParams<{ organizationId: string; corpusId: string }>()
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)
  const { data: corpus, error: corpusError } = useCorpus(corpusId)
  const { data: files, isLoading: filesLoading, error: filesError } = useCorpusFiles(corpusId)
  const { data: jobs, error: jobsError } = useIngestionJobs(corpusId)
  const uploadFile = useUploadCorpusFile(corpusId ?? '')
  const detachFile = useDetachCorpusFile(corpusId ?? '')
  const retryJob = useRetryIngestionJob(corpusId ?? '')
  const updateCorpus = useUpdateCorpus()
  const deleteCorpus = useDeleteCorpus()
  const searchCorpus = useSearchCorpus(corpusId ?? '')

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
        <PageHeader title="Corpus" description="" />
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
          onConfirm={() =>
            detachFile.mutate(record.id!, {
              onError: (error) => message.error(getErrorMessage(error)),
            })
          }
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
    { title: 'Attempts', key: 'attempts', width: 100, render: (_, record) => `${record.attempt_count}/${record.max_attempts}` },
    { title: 'Error', dataIndex: 'last_error', key: 'last_error', ellipsis: true, render: (value) => value || 'No error' },
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
            onClick={() =>
              retryJob.mutate(record.id!, {
                onError: (error) => message.error(getErrorMessage(error)),
              })
            }
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

      <Space orientation="vertical" size={20} style={{ width: '100%' }}>
        <Card title="Files" size="small">
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

        {jobsError && (
          <Alert type="error" showIcon message="Couldn't load ingestion jobs" description={getErrorMessage(jobsError)} />
        )}

        {jobs && jobs.length > 0 && (
          <Card title="Ingestion jobs" size="small">
            <ConsoleTable<IngestionJob>
              rowKey="id"
              size="small"
              columns={jobColumns}
              dataSource={jobs}
              pagination={false}
            />
          </Card>
        )}

        <SearchTestCard placeholder="Ask something this corpus should be able to answer" search={searchCorpus} />
      </Space>

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
