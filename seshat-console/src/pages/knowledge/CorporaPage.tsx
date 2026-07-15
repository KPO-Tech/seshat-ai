import { useMemo, useState } from 'react'
import { Button, Card, Input, Space, message } from 'antd'
import { PlusOutlined, FolderAddOutlined } from '@ant-design/icons'
import {
  useCorporaList,
  useCorpusFoldersList,
  useCreateCorpus,
  useCreateCorpusFolder,
} from '@/api/knowledge'
import { getErrorMessage } from '@/api/errors'
import { PageHeader } from '@/components/PageHeader'
import { CorporaTable } from '@/components/knowledge/CorporaTable'
import { CorpusFormDrawer } from '@/components/knowledge/CorpusFormDrawer'
import { CorpusFolderFormDrawer } from '@/components/knowledge/CorpusFolderFormDrawer'
import { FolderCard } from '@/components/knowledge/FolderCard'
import { useScopedOrganizationId } from '@/hooks/useOrganizationScope'

// No server-side pagination here - folder corpus counts and the "unfiled"
// split are computed client-side from one fetch, so a generous limit
// stands in for "everything" rather than a paged view. Fine for the corpus
// counts an organization actually has today; revisit if that stops holding.
const FETCH_LIMIT = 500

export function CorporaPage() {
  const organizationId = useScopedOrganizationId()
  const [search, setSearch] = useState('')
  const [creatingCorpus, setCreatingCorpus] = useState(false)
  const [creatingFolder, setCreatingFolder] = useState(false)

  const { data, isLoading, isFetching } = useCorporaList(organizationId ?? undefined, {
    q: search || undefined,
    sort: 'name',
    order: 'asc',
    limit: FETCH_LIMIT,
  })
  const folders = useCorpusFoldersList(organizationId ?? undefined)
  const createCorpus = useCreateCorpus()
  const createFolder = useCreateCorpusFolder()

  const allCorpora = data?.corpora
  const unfiledCorpora = useMemo(() => (allCorpora ?? []).filter((corpus) => !corpus.folder_id), [allCorpora])
  const corpusCountByFolder = useMemo(() => {
    const counts = new Map<string, number>()
    for (const corpus of allCorpora ?? []) {
      if (corpus.folder_id) counts.set(corpus.folder_id, (counts.get(corpus.folder_id) ?? 0) + 1)
    }
    return counts
  }, [allCorpora])

  return (
    <div>
      <PageHeader
        title="Corpora"
        description="RAG document collections, organized into folders. Upload files, watch ingestion, and search."
        actions={
          <Space>
            <Input.Search
              placeholder="Search corpora"
              allowClear
              onSearch={setSearch}
              style={{ width: 220 }}
              disabled={!organizationId}
            />
            <Button icon={<FolderAddOutlined />} onClick={() => setCreatingFolder(true)} disabled={!organizationId}>
              New folder
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreatingCorpus(true)} disabled={!organizationId}>
              New corpus
            </Button>
          </Space>
        }
      />

      {(folders.data?.length ?? 0) > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 16,
            marginBottom: 24,
          }}
        >
          {folders.data!.map((folder) => (
            <FolderCard key={folder.id} folder={folder} corpusCount={corpusCountByFolder.get(folder.id!) ?? 0} />
          ))}
        </div>
      )}

      <Card title="Unfiled corpora" styles={{ body: { padding: 0 } }}>
        <CorporaTable
          organizationId={organizationId}
          corpora={unfiledCorpora}
          loading={isLoading || isFetching}
          emptyDescription={search ? 'No corpora match your search' : 'No unfiled corpora'}
        />
      </Card>

      <CorpusFormDrawer
        open={creatingCorpus}
        onClose={() => setCreatingCorpus(false)}
        folders={folders.data ?? []}
        onSubmit={(values) => {
          if (!organizationId) return
          createCorpus.mutate(
            { ...values, organization_id: organizationId },
            {
              onSuccess: () => setCreatingCorpus(false),
              onError: (error) => message.error(getErrorMessage(error)),
            },
          )
        }}
        submitting={createCorpus.isPending}
      />

      <CorpusFolderFormDrawer
        folder={null}
        open={creatingFolder}
        onClose={() => setCreatingFolder(false)}
        onSubmit={(values) => {
          if (!organizationId) return
          createFolder.mutate(
            { ...values, organization_id: organizationId },
            {
              onSuccess: () => setCreatingFolder(false),
              onError: (error) => message.error(getErrorMessage(error)),
            },
          )
        }}
        submitting={createFolder.isPending}
      />
    </div>
  )
}
