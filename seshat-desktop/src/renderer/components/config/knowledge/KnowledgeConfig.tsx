import { useCallback, useEffect, useState } from 'react'
import { DoclingCard } from './DoclingCard'
import { EmbedderCard } from './EmbedderCard'
import { KnowledgeStatus } from './KnowledgeStatus'
import { RerankerCard } from './RerankerCard'
import { StorageAndCorporaCard } from './StorageAndCorporaCard'
import { fetchKnowledgeSnapshot, type KnowledgeSnapshot } from './knowledgeApi'

const emptySnapshot: KnowledgeSnapshot = {
  corpora: [],
  embedder: null,
  reranker: null,
  docling: null,
  storage: null
}

export function KnowledgeConfig() {
  const [snapshot, setSnapshot] = useState<KnowledgeSnapshot>(emptySnapshot)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const next = await fetchKnowledgeSnapshot()
      setSnapshot(next)
    } catch (err) {
      setError((err as { message?: string })?.message ?? 'Failed to load knowledge configuration.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-4">
        <div className="text-[13px] font-semibold text-[var(--text-muted)]">
          {loading ? 'Loading knowledge pipeline...' : 'Knowledge pipeline'}
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-md border border-[var(--border-soft)] bg-[var(--surface-muted)] px-3 py-1.5 text-[12px] font-semibold text-[var(--text-primary)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface-panel)]"
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-md border border-[var(--accent-danger)]/35 bg-[var(--accent-danger)]/10 px-3 py-2 text-[12px] font-semibold text-[var(--accent-danger)]">
          {error}
        </div>
      )}

      <KnowledgeStatus
        corpora={snapshot.corpora}
        embedder={snapshot.embedder}
        reranker={snapshot.reranker}
        docling={snapshot.docling}
        storage={snapshot.storage}
      />

      <EmbedderCard config={snapshot.embedder} onSaved={(embedder) => setSnapshot((current) => ({ ...current, embedder }))} />
      <RerankerCard config={snapshot.reranker} onSaved={(reranker) => setSnapshot((current) => ({ ...current, reranker }))} />
      <DoclingCard config={snapshot.docling} onSaved={(docling) => setSnapshot((current) => ({ ...current, docling }))} />
      <StorageAndCorporaCard storage={snapshot.storage} corpora={snapshot.corpora} />
    </div>
  )
}
