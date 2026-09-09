import { WindowCloseIcon } from '@/components/ui/WindowControlIcon'
import type { Corpus, DoclingConfig, EmbedderConfig } from '@/api/types'

export function KnowledgeAdvancedPanel({
  corpora,
  selectedCorpusId,
  embedder,
  docling,
  topK,
  minChunkSize,
  onTopKChange,
  onMinChunkSizeChange,
  onSelectCorpus,
  onClose,
}: {
  corpora: Corpus[]
  selectedCorpusId: string
  embedder: EmbedderConfig | null
  docling: DoclingConfig | null
  topK: number
  minChunkSize: number
  onTopKChange: (value: number) => void
  onMinChunkSizeChange: (value: number) => void
  onSelectCorpus: (value: string) => void
  onClose: () => void
}) {
  const embedderReady = Boolean(embedder?.is_configured && embedder.enabled)
  const doclingReady = docling?.enabled !== false

  return (
    <div className="k-drawer-backdrop" role="presentation" onMouseDown={onClose}>
      <aside className="k-advanced-drawer" role="dialog" aria-modal="true" aria-label="Knowledge advanced settings" onMouseDown={(e) => e.stopPropagation()}>
        <header className="k-drawer-head">
          <div>
            <h2>Advanced</h2>
            <span>Knowledge search settings</span>
          </div>
          <button type="button" onClick={onClose} aria-label="Close advanced settings">
            <WindowCloseIcon size={14} />
          </button>
        </header>

        <section className="k-drawer-section">
          <h3>Search Scope</h3>
          <label className="k-field">
            <span>Collection</span>
            <select value={selectedCorpusId} onChange={(e) => onSelectCorpus(e.target.value)}>
              <option value="all">All included knowledge</option>
              {corpora.map((corpus) => (
                <option key={corpus.id} value={corpus.id}>{corpus.name}</option>
              ))}
            </select>
          </label>
          <p>Use one collection for focused answers, or all included knowledge for broader search.</p>
        </section>

        <section className="k-drawer-section">
          <h3>Retrieval</h3>
          <label className="k-field">
            <span>Matching chunks</span>
            <input
              type="range"
              min="3"
              max="20"
              value={topK}
              onChange={(e) => onTopKChange(Number(e.target.value))}
            />
          </label>
          <div className="k-range-value">{topK} results</div>
        </section>

        <section className="k-drawer-section">
          <h3>Chunking</h3>
          <label className="k-field">
            <span>Minimum chunk size</span>
            <input
              type="range"
              min="100"
              max="2000"
              step="100"
              value={minChunkSize}
              onChange={(e) => onMinChunkSizeChange(Number(e.target.value))}
            />
          </label>
          <div className="k-range-value">{minChunkSize} characters</div>
          <p>This is ready for the UI, but needs a backend setting before it can affect future ingestion.</p>
        </section>

        <section className="k-drawer-section">
          <h3>Pipeline</h3>
          <div className="k-setting-row">
            <span>Embedding</span>
            <strong className={embedderReady ? 'ok' : 'warn'}>{embedderReady ? 'Ready' : 'Setup required'}</strong>
          </div>
          <div className="k-setting-row">
            <span>Docling</span>
            <strong className={doclingReady ? 'ok' : 'warn'}>{doclingReady ? 'On' : 'Off'}</strong>
          </div>
        </section>

        <section className="k-drawer-section muted">
          <h3>Coming Next</h3>
          <div className="k-setting-row">
            <span>Public sources</span>
            <strong>Opt-in</strong>
          </div>
          <div className="k-setting-row">
            <span>Company defaults</span>
            <strong>Server policy</strong>
          </div>
        </section>
      </aside>
    </div>
  )
}
