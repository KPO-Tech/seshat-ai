import { CloudStorage, DatabaseSearch } from '@icon-park/react'
import type { Corpus } from '@/api/types'
import {
  DriveConnectorCard,
  SharePointConnectorCard,
  StaticAccountConnectorCard,
  S3ConnectForm,
  AzureBlobConnectForm,
} from '@/components/connectors/KnowledgeConnectorCards'

// Sources: governed connection of external systems into a Knowledge corpus
// (docs/produits/platforms/knowledge/knowledge-app-pages.md, Page 4).
// Confluence and OneDrive are left out for now - both are registered as
// sync-capable connectors backend-side, but reaching them today would need
// new backend OAuth wiring (like Drive/SharePoint's dedicated routes),
// which is out of scope for this pass; see the plan's "explicitly out of
// scope" section.
//
// This page is corpus-scoped (one target corpus at a time, matching how
// Collections already works) - every card below gets `lockedCorpusId` so
// connect/sync actions apply directly to it, with no per-account corpus
// dropdown (unlike the same cards reused in Settings > Connectors, which
// isn't corpus-scoped).
export function SourcesWorkspace({
  corpora,
  selectedCorpusId,
  onSelectCorpus,
}: {
  corpora: Corpus[]
  selectedCorpusId: string
  onSelectCorpus: (id: string) => void
}) {
  const selectedCorpus = corpora.find((c) => c.id === selectedCorpusId) ?? null

  return (
    <div className="k-sources">
      <style>{SOURCES_CSS}</style>

      <div className="k-sources-target">
        <div className="k-sources-target-label">
          <DatabaseSearch size={14} />
          <span>Sync into</span>
        </div>
        <select
          className="k-sources-corpus-select"
          value={selectedCorpusId}
          onChange={(e) => onSelectCorpus(e.target.value)}
        >
          <option value="" disabled>Select a collection…</option>
          {corpora.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {!selectedCorpus ? (
        <div className="k-sources-empty">
          <DatabaseSearch size={22} />
          <p>Pick or create a collection first - every connected source syncs its documents into one.</p>
        </div>
      ) : (
        <>
          <DriveConnectorCard corpora={corpora} lockedCorpusId={selectedCorpusId} />
          <SharePointConnectorCard corpora={corpora} lockedCorpusId={selectedCorpusId} />
          <StaticAccountConnectorCard
            kind="s3"
            title="S3-compatible storage"
            subtitle="Sync business documents from a bucket (AWS S3, MinIO, R2, Backblaze)"
            icon={<CloudStorage size={15} />}
            corpora={corpora}
            lockedCorpusId={selectedCorpusId}
            renderConnectForm={(props) => <S3ConnectForm {...props} />}
          />
          <StaticAccountConnectorCard
            kind="azureblob"
            title="Azure Blob Storage"
            subtitle="Sync business documents from an Azure Storage container"
            icon={<CloudStorage size={15} />}
            corpora={corpora}
            lockedCorpusId={selectedCorpusId}
            renderConnectForm={(props) => <AzureBlobConnectForm {...props} />}
          />
        </>
      )}
    </div>
  )
}

const SOURCES_CSS = `
.k-sources { display: flex; flex-direction: column; gap: 16px; max-width: 720px; }
.k-sources-target {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: var(--color-surface);
}
.k-sources-target-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 700;
  color: var(--color-text-secondary);
  flex-shrink: 0;
}
.k-sources-corpus-select {
  flex: 1;
  border: 1px solid var(--color-border);
  background: var(--color-bg);
  color: var(--color-text);
  border-radius: 7px;
  padding: 7px 9px;
  font-size: 12px;
  font-family: inherit;
}
.k-sources-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 48px 24px;
  color: var(--color-text-secondary);
  text-align: center;
  border: 1px dashed var(--color-border);
  border-radius: 12px;
}
.k-sources-empty p { margin: 0; font-size: 13px; max-width: 380px; }
`
