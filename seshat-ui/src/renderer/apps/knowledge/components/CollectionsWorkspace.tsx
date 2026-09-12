import { useEffect, useState } from 'react'
import { Caution, Delete, Edit, FileText, LoadingOne, More, Search, Upload } from '@icon-park/react'
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
  openedCorpusId,
  selectedScope,
  detail,
  readyFiles,
  activeJobs,
  totalChunks,
  uploading,
  uploadError,
  processing,
  processError,
  corporaError,
  onUpload,
  onSelectCorpus,
  onOpenCorpus,
  onTestSearch,
  onRenameCorpus,
  onDeleteCorpus,
  onProcessAll,
  onRetryDetail,
}: {
  corpora: Corpus[]
  selectedCorpus: Corpus | null
  openedCorpusId: string | null
  selectedScope: string
  detail: CorpusDetail
  readyFiles: number
  activeJobs: number
  totalChunks: number
  uploading: boolean
  uploadError: string | null
  processing: boolean
  processError: string | null
  corporaError: string | null
  onUpload: () => void
  onSelectCorpus: (id: string) => void
  onOpenCorpus: (id: string) => void
  onTestSearch: (query: string, corpusId: string) => void
  onRenameCorpus: (corpusId: string, name: string) => Promise<void>
  onDeleteCorpus: (corpusId: string) => Promise<void>
  onProcessAll: (corpusId: string) => void
  onRetryDetail: (corpusId: string) => void
}) {
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null)
  const [testQuery, setTestQuery] = useState('')
  const [collectionFilter, setCollectionFilter] = useState('')
  const [menuCorpusId, setMenuCorpusId] = useState<string | null>(null)
  const [renamingCorpus, setRenamingCorpus] = useState<Corpus | null>(null)
  const [renameName, setRenameName] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [deletingCorpus, setDeletingCorpus] = useState<Corpus | null>(null)
  const [deleting, setDeleting] = useState(false)

  const openedCorpus = openedCorpusId ? corpora.find((corpus) => corpus.id === openedCorpusId) ?? null : null
  const selectedFile = selectedFileId ? detail.files.find((file) => file.file_id === selectedFileId) ?? null : null
  const normalizedFilter = collectionFilter.trim().toLowerCase()
  const visibleCorpora = normalizedFilter
    ? corpora.filter((corpus) => {
      const scope = corpus.workspace_id ? 'organization' : 'personal'
      return `${corpus.name} ${scope} ${formatDate(corpus.updated_at)}`.toLowerCase().includes(normalizedFilter)
    })
    : corpora
  const failedFiles = detail.files.filter((file) => file.status === 'failed').length
  const pendingFiles = detail.files.filter((file) => file.status !== 'ingested' && file.status !== 'failed').length
  const organizationCorpora = corpora.filter((corpus) => corpus.workspace_id).length
  const selectedHealth = !selectedCorpus
    ? 'No selection'
    : failedFiles > 0
      ? `${failedFiles} failed`
      : activeJobs > 0 || pendingFiles > 0
        ? 'Processing'
        : selectedCorpus.chunk_count > 0
          ? 'Ready'
          : 'Empty'

  useEffect(() => {
    if (!openedCorpus || detail.loading) return
    setSelectedFileId((current) => {
      if (current && detail.files.some((file) => file.file_id === current)) return current
      return null
    })
  }, [detail.files, detail.loading, openedCorpus])

  useEffect(() => {
    if (!menuCorpusId) return
    function closeOnOutsideEvent(event: MouseEvent | KeyboardEvent) {
      if (event instanceof KeyboardEvent) {
        if (event.key === 'Escape') setMenuCorpusId(null)
        return
      }
      const target = event.target as HTMLElement
      if (target.closest('.k-collection-menu') || target.closest('.k-collection-menu-trigger')) return
      setMenuCorpusId(null)
    }
    document.addEventListener('mousedown', closeOnOutsideEvent)
    document.addEventListener('keydown', closeOnOutsideEvent)
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideEvent)
      document.removeEventListener('keydown', closeOnOutsideEvent)
    }
  }, [menuCorpusId])

  async function submitRename() {
    if (!renamingCorpus) return
    const nextName = renameName.trim()
    if (!nextName) return
    setRenaming(true)
    try {
      await onRenameCorpus(renamingCorpus.id, nextName)
      setRenamingCorpus(null)
      setRenameName('')
    } finally {
      setRenaming(false)
    }
  }

  async function submitDelete() {
    if (!deletingCorpus) return
    setDeleting(true)
    try {
      await onDeleteCorpus(deletingCorpus.id)
      setDeletingCorpus(null)
    } finally {
      setDeleting(false)
    }
  }

  if (openedCorpus) {
    return (
      <div className="k-collections-page detail k-collections-console">
        {uploadError && <div className="k-page-error">{uploadError}</div>}
        {processError && <div className="k-page-error">{processError}</div>}

        <section className="k-collection-detail-grid">
          <main className="k-hub-panel">
            <div className="k-panel-title">
              <span className="k-file-heading">Files</span>
              <strong>{readyFiles}/{detail.files.length} ready</strong>
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
    <div className="k-collections-page k-collections-console">
      {corporaError && <div className="k-page-error">{corporaError}</div>}

      <section className="k-collection-stats">
        <div><span>Total collections</span><strong>{corpora.length}</strong></div>
        <div><span>Indexed chunks</span><strong>{totalChunks.toLocaleString()}</strong></div>
        <div><span>Org collections</span><strong>{organizationCorpora}</strong></div>
        <div><span>Active jobs</span><strong>{activeJobs}</strong></div>
      </section>

      <section className="k-management-grid">
        <div className="k-hub-panel k-collection-registry">
          <div className="k-panel-title">
            <span>Corpus registry</span>
            <div className="k-registry-filter">
              <Search size={13} />
              <input
                value={collectionFilter}
                onChange={(event) => setCollectionFilter(event.target.value)}
                placeholder="Filter collections..."
              />
            </div>
            <strong>{visibleCorpora.length}/{corpora.length} total</strong>
          </div>
          {corpora.length === 0 ? (
            <div className="k-dashboard-empty">Create your first collection.</div>
          ) : visibleCorpora.length === 0 ? (
            <div className="k-dashboard-empty">No collection matches this filter.</div>
          ) : (
            <div className="k-collection-table">
              {visibleCorpora.map((corpus) => (
                <div
                  key={corpus.id}
                  role="button"
                  tabIndex={0}
                  className={`k-collection-row ${selectedCorpus?.id === corpus.id ? 'active' : ''}`}
                  onClick={() => onSelectCorpus(corpus.id)}
                  onDoubleClick={() => {
                    onSelectCorpus(corpus.id)
                    onOpenCorpus(corpus.id)
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') onSelectCorpus(corpus.id)
                  }}
                >
                  <span className="k-collection-row-icon">
                    <FileText size={15} />
                  </span>
                  <span className="k-collection-row-main">
                    <strong>{corpus.name}</strong>
                    <small>{corpus.chunk_count > 0 ? `${corpus.chunk_count.toLocaleString()} indexed chunks` : 'No indexed chunks yet'}</small>
                    <span className="k-collection-row-meta">
                      <em>{corpus.workspace_id ? 'Organization' : 'Personal'}</em>
                      <em>{formatDate(corpus.updated_at)}</em>
                    </span>
                  </span>
                  <em className={`k-collection-state ${corpus.chunk_count > 0 ? 'ready' : 'empty'}`}>
                    {corpus.chunk_count > 0 ? 'Ready' : 'Empty'}
                  </em>
                  <button
                    type="button"
                    className="k-collection-menu-trigger"
                    aria-label={`Actions for ${corpus.name}`}
                    aria-expanded={menuCorpusId === corpus.id}
                    onClick={(event) => {
                      event.stopPropagation()
                      setMenuCorpusId((current) => (current === corpus.id ? null : corpus.id))
                    }}
                  >
                    <More size={15} />
                  </button>
                  {menuCorpusId === corpus.id && (
                    <div className="k-collection-menu" role="menu" onClick={(event) => event.stopPropagation()}>
                      <button type="button" role="menuitem" onClick={() => { setMenuCorpusId(null); onOpenCorpus(corpus.id) }}>
                        <FileText size={12} /> Open collection
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setMenuCorpusId(null)
                          setRenamingCorpus(corpus)
                          setRenameName(corpus.name)
                        }}
                      >
                        <Edit size={12} /> Rename
                      </button>
                      <button type="button" role="menuitem" onClick={() => { setMenuCorpusId(null); onSelectCorpus(corpus.id); onUpload() }}>
                        <Upload size={12} /> Import documents
                      </button>
                      <button type="button" role="menuitem" onClick={() => { setMenuCorpusId(null); onProcessAll(corpus.id) }} disabled={processing}>
                        <LoadingOne size={12} className={processing ? 'spin' : undefined} /> Reprocess
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className="danger"
                        onClick={() => { setMenuCorpusId(null); setDeletingCorpus(corpus) }}
                      >
                        <Delete size={12} /> Delete
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <aside className="k-hub-panel k-collection-summary">
          <div className="k-panel-title">
            <span>{selectedCorpus ? selectedCorpus.name : 'Selection'}</span>
            <strong>{selectedHealth}</strong>
          </div>
          {!selectedCorpus ? (
            <div className="k-dashboard-empty">Select a collection, double-click to open.</div>
          ) : (
            <div className="k-detail-card-body">
              <div className="k-summary-lines">
                <div><span>Files</span><strong>{readyFiles}/{detail.files.length} ready</strong></div>
                <div><span>Jobs</span><strong>{activeJobs} active</strong></div>
                <div><span>Chunks</span><strong>{selectedCorpus.chunk_count.toLocaleString()}</strong></div>
              </div>
              <div className="k-summary-lines compact">
                <div><span>Scope</span><strong>{selectedScope}</strong></div>
                <div><span>Updated</span><strong>{formatDate(selectedCorpus.updated_at)}</strong></div>
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
              <button type="button" className="k-secondary-action k-wide-action" onClick={() => onOpenCorpus(selectedCorpus.id)}>
                Open collection
              </button>
              <div className="k-mini-file-list">
                {detail.loading ? (
                  <span>Loading files...</span>
                ) : detail.files.length === 0 ? (
                  <span>No files indexed yet.</span>
                ) : detail.files.slice(0, 4).map((file) => (
                  <div key={file.file_id}>
                    <KnowledgeFileIcon filename={file.filename} />
                    <strong>{file.filename}</strong>
                    <StatusBadge status={file.status} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>
      </section>
      {renamingCorpus && (
        <div
          className="k-modal-backdrop"
          role="presentation"
          onMouseDown={() => {
            if (!renaming) setRenamingCorpus(null)
          }}
        >
          <form
            className="k-create-collection-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Rename collection"
            onMouseDown={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault()
              void submitRename()
            }}
          >
            <div className="k-create-collection-head">
              <span className="k-create-collection-icon">
                <Edit size={18} />
              </span>
              <div>
                <h2>Rename collection</h2>
                <p>Update the corpus name used in collection lists and retrieval scope.</p>
              </div>
            </div>
            <label className="k-create-collection-field">
              <span>Collection name</span>
              <input autoFocus value={renameName} onChange={(event) => setRenameName(event.target.value)} />
            </label>
            <div className="k-create-collection-actions">
              <button type="button" className="k-settings-btn" onClick={() => setRenamingCorpus(null)} disabled={renaming}>
                Cancel
              </button>
              <button type="submit" className="k-settings-btn primary" disabled={!renameName.trim() || renaming}>
                {renaming ? 'Renaming...' : 'Rename collection'}
              </button>
            </div>
          </form>
        </div>
      )}
      {deletingCorpus && (
        <div
          className="k-modal-backdrop"
          role="presentation"
          onMouseDown={() => {
            if (!deleting) setDeletingCorpus(null)
          }}
        >
          <form
            className="k-create-collection-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Delete collection"
            onMouseDown={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault()
              void submitDelete()
            }}
          >
            <div className="k-create-collection-head">
              <span className="k-create-collection-icon danger">
                <Delete size={18} />
              </span>
              <div>
                <h2>Delete collection</h2>
                <p>Delete “{deletingCorpus.name}”? This removes its files from the collection and cannot be undone.</p>
              </div>
            </div>
            <div className="k-create-collection-actions">
              <button type="button" className="k-settings-btn" onClick={() => setDeletingCorpus(null)} disabled={deleting}>
                Cancel
              </button>
              <button type="submit" className="k-settings-btn danger" disabled={deleting}>
                {deleting ? 'Deleting...' : 'Delete collection'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
