import { useState } from 'react'
import { Button, Empty, Input, Select, Space, Spin, message } from 'antd'
import { PlusOutlined, SortAscendingOutlined, SortDescendingOutlined } from '@ant-design/icons'
import { useCorporaList, useCreateCorpus } from '@/api/knowledge'
import { getErrorMessage } from '@/api/errors'
import { PageHeader } from '@/components/PageHeader'
import { CorpusCard } from '@/components/knowledge/CorpusCard'
import { CorpusFormDrawer } from '@/components/knowledge/CorpusFormDrawer'
import { useScopedOrganizationId } from '@/hooks/useOrganizationScope'

// No server-side pagination here - a generous limit stands in for
// "everything" rather than a paged view. Fine for the corpus counts an
// organization actually has today; revisit if that stops holding.
const FETCH_LIMIT = 500

// A card grid, not a table (see CorpusCard below) - no columns to attach
// antd's sorter icons to, so sort field/order are a plain control instead,
// same backend sortFields (name/created_at/updated_at) Organizations'
// column sorter picks from.
const CORPUS_SORT_OPTIONS = [
  { value: 'name', label: 'Name' },
  { value: 'created_at', label: 'Created' },
  { value: 'updated_at', label: 'Updated' },
]

export function CorporaPage() {
  const organizationId = useScopedOrganizationId()
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<{ field: string; order: 'asc' | 'desc' }>({ field: 'name', order: 'asc' })
  const [creatingCorpus, setCreatingCorpus] = useState(false)

  const { data, isLoading, isFetching } = useCorporaList(organizationId ?? undefined, {
    q: search || undefined,
    sort: sort.field,
    order: sort.order,
    limit: FETCH_LIMIT,
  })
  const createCorpus = useCreateCorpus()

  const corpora = data?.corpora ?? []

  return (
    <div>
      <PageHeader
        actions={
          <Space>
            <Input.Search
              placeholder="Search corpora"
              allowClear
              onSearch={setSearch}
              style={{ width: 220 }}
              disabled={!organizationId}
            />
            <Select
              value={sort.field}
              onChange={(field) => setSort((current) => ({ ...current, field }))}
              options={CORPUS_SORT_OPTIONS}
              style={{ width: 120 }}
              disabled={!organizationId}
              aria-label="Sort corpora by"
            />
            <Button
              icon={sort.order === 'asc' ? <SortAscendingOutlined /> : <SortDescendingOutlined />}
              onClick={() => setSort((current) => ({ ...current, order: current.order === 'asc' ? 'desc' : 'asc' }))}
              disabled={!organizationId}
              aria-label={sort.order === 'asc' ? 'Sort ascending' : 'Sort descending'}
            />
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreatingCorpus(true)} disabled={!organizationId}>
              New corpus
            </Button>
          </Space>
        }
      />

      {isLoading || isFetching ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
          <Spin />
        </div>
      ) : corpora.length === 0 ? (
        <Empty description={search ? 'No corpora match your search' : 'No corpora yet'} />
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
            gap: 16,
          }}
        >
          {corpora.map((corpus) => (
            <CorpusCard key={corpus.id} corpus={corpus} />
          ))}
        </div>
      )}

      <CorpusFormDrawer
        open={creatingCorpus}
        onClose={() => setCreatingCorpus(false)}
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
    </div>
  )
}
