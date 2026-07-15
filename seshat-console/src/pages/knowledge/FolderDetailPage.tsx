import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button, Popconfirm, Space, message } from 'antd'
import { ArrowLeftOutlined, DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons'
import {
  useCorpusFoldersList,
  useCorporaList,
  useCreateCorpus,
  useUpdateCorpusFolder,
  useDeleteCorpusFolder,
  useSearchFolder,
} from '@/api/knowledge'
import { getErrorMessage } from '@/api/errors'
import { PageHeader } from '@/components/PageHeader'
import { CorporaTable } from '@/components/knowledge/CorporaTable'
import { CorpusFormDrawer } from '@/components/knowledge/CorpusFormDrawer'
import { CorpusFolderFormDrawer } from '@/components/knowledge/CorpusFolderFormDrawer'
import { FolderIcon } from '@/components/knowledge/FolderIcon'
import { SearchTestCard } from '@/components/knowledge/SearchTestCard'
import { useScopedOrganizationId } from '@/hooks/useOrganizationScope'

const FETCH_LIMIT = 500

export function FolderDetailPage() {
  const { folderId } = useParams<{ folderId: string }>()
  const navigate = useNavigate()
  const organizationId = useScopedOrganizationId()
  const [editingFolder, setEditingFolder] = useState(false)
  const [creatingCorpus, setCreatingCorpus] = useState(false)

  const folders = useCorpusFoldersList(organizationId ?? undefined)
  const folder = folders.data?.find((candidate) => candidate.id === folderId) ?? null

  const { data, isLoading, isFetching } = useCorporaList(organizationId ?? undefined, {
    folderId,
    sort: 'name',
    order: 'asc',
    limit: FETCH_LIMIT,
  })
  const createCorpus = useCreateCorpus()
  const updateFolder = useUpdateCorpusFolder()
  const deleteFolder = useDeleteCorpusFolder()
  const searchFolder = useSearchFolder(folderId ?? '')

  const corporaPath = organizationId ? `/orgs/${organizationId}/knowledge/corpora` : null

  if (!folderId) return null

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
        {folder && <FolderIcon folderId={folder.id!} emoji={folder.icon || '📁'} size={48} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <PageHeader
            title={folder?.name ?? 'Folder'}
            description={folder?.description || 'Corpora filed under this folder.'}
            actions={
              <Space>
                <Button icon={<ArrowLeftOutlined />} onClick={() => corporaPath && navigate(corporaPath)} disabled={!corporaPath}>
                  Back to corpora
                </Button>
                <Button icon={<EditOutlined />} onClick={() => setEditingFolder(true)} disabled={!folder}>
                  Rename
                </Button>
                <Popconfirm
                  title={`Delete ${folder?.name ?? 'this folder'}?`}
                  description="Corpora inside are unfiled, not deleted."
                  onConfirm={() =>
                    deleteFolder.mutate(folderId, {
                      onSuccess: () => corporaPath && navigate(corporaPath),
                      onError: (error) => message.error(getErrorMessage(error)),
                    })
                  }
                >
                  <Button danger icon={<DeleteOutlined />} disabled={!folder}>
                    Delete
                  </Button>
                </Popconfirm>
                <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreatingCorpus(true)} disabled={!organizationId}>
                  New corpus
                </Button>
              </Space>
            }
          />
        </div>
      </div>

      <CorporaTable
        organizationId={organizationId}
        corpora={data?.corpora ?? []}
        loading={isLoading || isFetching}
        emptyDescription="No corpora in this folder yet"
      />

      {(data?.corpora?.length ?? 0) > 0 && (
        <div style={{ marginTop: 20 }}>
          <SearchTestCard
            title="Try a search across this folder"
            placeholder="Ask something any corpus in this folder should be able to answer"
            showCorpusName
            search={searchFolder}
          />
        </div>
      )}

      <CorpusFormDrawer
        open={creatingCorpus}
        onClose={() => setCreatingCorpus(false)}
        folders={folders.data ?? []}
        defaultFolderId={folderId}
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
        folder={folder}
        open={editingFolder}
        onClose={() => setEditingFolder(false)}
        onSubmit={(values) => {
          updateFolder.mutate(
            { id: folderId, body: values },
            {
              onSuccess: () => setEditingFolder(false),
              onError: (error) => message.error(getErrorMessage(error)),
            },
          )
        }}
        submitting={updateFolder.isPending}
      />
    </div>
  )
}
