import { useEffect, useState } from 'react'
import { Caution, FileText, Left, LoadingOne, Plus, Search, Upload } from '@icon-park/react'
import { WindowCloseIcon } from '@/components/ui/WindowControlIcon'
import type { Corpus } from '@/api/types'
import type { CorpusDetail } from '../api/types'
import { fileExtension } from '../lib/preview'
import { formatDate } from '../lib/status'
import { KnowledgeDocumentPreview } from './KnowledgeDocumentPreview'
import { KnowledgeFileIcon } from './KnowledgeFileIcon'
import { StatusBadge } from './StatusBadge'

export function CollectionsWorkspace({
  corpora,
  selectedCorpus,
  selectedScope,
  detail,
  readyFiles,
  activeJobs,
  totalChunks,
  uploading,
  uploadError,
  processing,
  processError,
  newCorpusName,
  creatingCorpus,
  corporaError,
  onNewCorpusNameChange,
  onCreateCorpus,
  onBrowsePublic,
  onUpload,
  onSelectCorpus,
  onTestSearch,
  onProcessMissing,
  onProcessAll,
  onRetryDetail,
}: {
  corpora: Corpus[]
  selectedCorpus: Corpus | null
  selectedScope: string
  detail: CorpusDetail
  readyFiles: number
  activeJobs: number
  totalChunks: number
  uploading: boolean
  uploadError: string | null
  processing: boolean
  processError: string | null
  newCorpusName: string
  creatingCorpus: boolean
  corporaError: string | null
  onNewCorpusNameChange: (value: string) => void
  onCreateCorpus: () => void
  onBrowsePublic: () => void
  onUpload: () => void
  onSelectCorpus: (id: string) => void
  onTestSearch: (query: string, corpusId: string) => void
  onProcessMissing: (corpusId: string) => void
  onProcessAll: (corpusId: string) => void
  onRetryDetail: (corpusId: string) => void
}) {
  const [openedCorpusId, setOpenedCorpusId] = useState<string | null>(null)
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null)
  const [testQuery, setTestQuery] = useState('')
  const openedCorpus = openedCorpusId ? corpora.find((corpus) => corpus.id === openedCorpusId) ?? null : null
  const selectedFile = selectedFileId ? detail.files.find((file) => file.file_id === selectedFileId) ?? null : null

  useEffect(() => {
    if (!openedCorpus || detail.loading) return
    setSelectedFileId((current) => {
      if (current && detail.files.some((file) => file.file_id === current)) return current
      return null
    })
  }, [detail.files, detail.loading, openedCorpus])

  if (openedCorpus) {
    return (
      <div className="k-collections-page detail">
        {uploadError && <div className="k-page-error">{uploadError}</div>}
        {processError && <div className="k-page-error">{processError}</div>}

        <section className="k-collection-detail-grid">
          <main className="k-hub-panel">
            <div className="k-panel-title">
              <span className="k-file-heading">
                <button type="button" className="k-back-action" onClick={() => setOpenedCorpusId(null)} aria-label="Back to collections">
                  <Left size={14} />
                </button>
                Files
              </span>
              <div className="k-panel-actions">
                <button type="button" className="k-mini-action" onClick={onUpload} disabled={uploading}>
                  <Upload size={13} /> {uploading ? 'Uploading...' : 'Import files'}
                </button>
                <button
                  type="button"
                  className="k-mini-action"
                  onClick={() => onProcessMissing(openedCorpus.id)}
                  disabled={processing}
                >
                  <LoadingOne size={13} className={processing ? 'spin' : undefined} /> Process missing
                </button>
                <button
                  type="button"
                  className="k-mini-action primary"
                  onClick={() => onProcessAll(openedCorpus.id)}
                  disabled={processing}
                >
                  <LoadingOne size={13} className={processing ? 'spin' : undefined} /> Process all
                </button>
              </div>
            </div>
            <div className="k-detail-files">
              {detail.loading ? (
                <div className="k-preview-empty">
                  <LoadingOne size={18} className="spin" />
                  <span>Loading files...</span>
                </div>
              ) : detail.error ? (
                <div className="k-preview-empty error">
                  <Caution size={20} />
                  <span>{detail.error}</span>
                  <button type="button" className="k-mini-action" onClick={() => onRetryDetail(openedCorpus.id)}>
                    Retry
                  </button>
                </div>
              ) : detail.files.length === 0 ? (
                <button type="button" className="k-upload-drop large" onClick={onUpload} disabled={uploading}>
                  <Upload size={20} />
                  <span>{uploading ? 'Uploading...' : 'Import documents into this collection'}</span>
                </button>
              ) : detail.files.map((file) => (
                <button
                  key={file.file_id}
                  type="button"
                  className={`k-detail-file-row${selectedFile?.file_id === file.file_id ? ' active' : ''}`}
                  onClick={() => setSelectedFileId(file.file_id)}
                >
                  <KnowledgeFileIcon filename={file.filename} />
                  <span>
                    <strong>{file.filename}</strong>
                    <small>{file.chunk_count} chunks</small>
                  </span>
                  <StatusBadge status={file.status} />
                </button>
              ))}
            </div>
          </main>

          <aside className="k-detail-side">
            <section className="k-hub-panel k-preview-panel">
              <div className="k-panel-title">
                {selectedFile ? (
                  <>
                    <strong>{fileExtension(selectedFile.filename).toUpperCase() || 'FILE'}</strong>
                    <button type="button" className="k-preview-close" onClick={() => setSelectedFileId(null)} aria-label="Close preview">
                      <WindowCloseIcon />
                    </button>
                  </>
                ) : (
                  <>
                    <span>Test Search</span>
                    <strong>{openedCorpus.chunk_count} chunks</strong>
                  </>
                )}
              </div>
              <div className="k-preview-body">
                {selectedFile ? (
                  <KnowledgeDocumentPreview file={selectedFile} />
                ) : (
                  <form
                    className="k-test-search k-test-search-full"
                    onSubmit={(e) => {
                      e.preventDefault()
                      onTestSearch(testQuery, openedCorpus.id)
                    }}
                  >
                    <Search size={14} />
                    <input value={testQuery} onChange={(e) => setTestQuery(e.target.value)} placeholder="Try a query..." />
                    <button type="submit" disabled={!testQuery.trim()}>Test</button>
                  </form>
                )}
              </div>
            </section>
          </aside>
        </section>
      </div>
    )
  }

  return (
    <div className="k-collections-page">
      <section className="k-collections-top">
        <div>
          <h2>Manage knowledge bases</h2>
        </div>
        <div className="k-hero-actions">
          <div className="k-inline-create">
            <input
              value={newCorpusName}
              onChange={(e) => onNewCorpusNameChange(e.target.value)}
              placeholder="New collection name"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  onCreateCorpus()
                }
              }}
            />
          </div>
          <button type="button" className="k-secondary-action" onClick={onBrowsePublic}>
            <Search size={14} /> Public library
          </button>
          <button type="button" className="k-primary-action" onClick={onCreateCorpus} disabled={!newCorpusName.trim() || creatingCorpus}>
            <Plus size={14} /> New collection
          </button>
        </div>
      </section>
      {corporaError && <div className="k-page-error">{corporaError}</div>}

      <section className="k-management-grid">
        <div className="k-hub-panel">
          <div className="k-panel-title">
            <span>Collections</span>
            <strong>{corpora.length} · {totalChunks} chunks</strong>
          </div>
          {corpora.length === 0 ? (
            <div className="k-dashboard-empty">Create your first collection.</div>
          ) : (
            <div className="k-collection-table">
              {corpora.map((corpus) => (
                <button
                  key={corpus.id}
                  type="button"
                  className={`k-collection-row ${selectedCorpus?.id === corpus.id ? 'active' : ''}`}
                  onClick={() => onSelectCorpus(corpus.id)}
                  onDoubleClick={() => {
                    onSelectCorpus(corpus.id)
                    setOpenedCorpusId(corpus.id)
                  }}
                >
                  <FileText size={15} />
                  <span>
                    <strong>{corpus.name}</strong>
                    <small>{corpus.workspace_id ? 'Organization' : 'Personal'} · updated {formatDate(corpus.updated_at)}</small>
                  </span>
                  <em>{corpus.chunk_count} chunks</em>
                </button>
              ))}
            </div>
          )}
        </div>

        <aside className="k-hub-panel k-collection-summary">
          <div className="k-panel-title">
            <span>{selectedCorpus ? selectedCorpus.name : 'Selection'}</span>
            <strong>{selectedCorpus ? selectedScope : 'None'}</strong>
          </div>
          {!selectedCorpus ? (
            <div className="k-dashboard-empty">Select a collection, double-click to open.</div>
          ) : (
            <div className="k-detail-card-body">
              <div className="k-summary-lines">
                <div><span>Files</span><strong>{readyFiles}/{detail.files.length} ready</strong></div>
                <div><span>Jobs</span><strong>{activeJobs} active</strong></div>
                <div><span>Chunks</span><strong>{selectedCorpus.chunk_count}</strong></div>
              </div>
              <form
                className="k-test-search"
                onSubmit={(e) => {
                  e.preventDefault()
                  onTestSearch(testQuery, selectedCorpus.id)
                }}
              >
                <Search size={14} />
                <input value={testQuery} onChange={(e) => setTestQuery(e.target.value)} placeholder="Test this collection..." />
                <button type="submit" disabled={!testQuery.trim()}>Test</button>
              </form>
              <button type="button" className="k-secondary-action k-wide-action" onClick={() => setOpenedCorpusId(selectedCorpus.id)}>
                Open collection
              </button>
            </div>
          )}
        </aside>
      </section>
    </div>
  )
}
