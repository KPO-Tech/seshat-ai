import type { Corpus, DoclingConfig, EmbedderConfig, RerankerConfig, StorageStatus } from './knowledgeTypes'

export function KnowledgeStatus({ corpora, embedder, reranker, docling, storage }: {
  corpora: Corpus[]
  embedder: EmbedderConfig | null
  reranker: RerankerConfig | null
  docling: DoclingConfig | null
  storage: StorageStatus | null
}) {
  const chunks = corpora.reduce((total, corpus) => total + (corpus.chunk_count ?? 0), 0)
  const items = [
    {
      label: 'Embedding',
      value: embedder?.is_configured ? 'Ready' : 'Review',
      detail: embedder?.model || 'No model selected',
      tone: embedder?.is_configured ? 'text-[var(--accent-success)]' : 'text-[var(--accent-primary)]'
    },
    {
      label: 'Reranker',
      value: reranker?.is_configured ? 'Ready' : 'Off',
      detail: reranker?.model || 'Optional',
      tone: reranker?.is_configured ? 'text-[var(--accent-success)]' : 'text-[var(--text-primary)]'
    },
    {
      label: 'Conversion',
      value: docling?.enabled === false ? 'Off' : 'On',
      detail: docling?.base_url || 'Auto/local',
      tone: docling?.enabled === false ? 'text-[var(--text-primary)]' : 'text-[var(--accent-success)]'
    },
    {
      label: 'Knowledge',
      value: String(corpora.length),
      detail: `${chunks} chunks`,
      tone: 'text-[var(--text-primary)]'
    },
    {
      label: 'Storage',
      value: storage?.active_provider || 'local',
      detail: storage?.restart_required ? 'Restart required' : 'Active',
      tone: storage?.restart_required ? 'text-[var(--accent-primary)]' : 'text-[var(--accent-success)]'
    }
  ]

  return (
    <section className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
      {items.map((item) => (
        <article key={item.label} className="min-w-0 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-panel)] px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="truncate text-[11px] font-semibold text-[var(--text-muted)]">{item.label}</div>
            <span className={['size-1.5 rounded-full', item.tone.includes('success') ? 'bg-[var(--accent-success)]' : item.tone.includes('primary') ? 'bg-[var(--accent-primary)]' : 'bg-[var(--text-faint)]'].join(' ')} />
          </div>
          <div className={['mt-1.5 truncate text-[16px] font-semibold leading-none', item.tone].join(' ')}>{item.value}</div>
          <div className="mt-1.5 truncate text-[11px] text-[var(--text-muted)]">{item.detail}</div>
        </article>
      ))}
    </section>
  )
}
