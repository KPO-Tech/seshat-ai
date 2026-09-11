import type { ReactNode } from 'react'
import { CheckOne, Caution, DatabaseSearch, FileText, Lightning, Message, Refresh, Search, Shield } from '@icon-park/react'
import type { Corpus, DoclingConfig, EmbedderConfig, IngestionJob } from '@/api/types'
import { formatDate, isJobActive } from '../lib/status'
import type { KnowledgeView } from '../api/types'

type OverviewAction = 'search' | 'chat' | 'collections' | 'sources'

export function OverviewWorkspace({
  corpora,
  selectedCorpus,
  selectedCorpusId,
  selectedJobs,
  totalChunks,
  embedder,
  docling,
  corporaError,
  onNavigate,
  onRefresh,
}: {
  corpora: Corpus[]
  selectedCorpus: Corpus | null
  selectedCorpusId: string
  selectedJobs: IngestionJob[]
  totalChunks: number
  embedder: EmbedderConfig | null
  docling: DoclingConfig | null
  corporaError: string | null
  onNavigate: (view: KnowledgeView) => void
  onRefresh: () => void
}) {
  const organizationCorpora = corpora.filter((corpus) => corpus.workspace_id).length
  const activeJobs = selectedJobs.filter(isJobActive)
  const failedJobs = selectedJobs.filter((job) => job.status === 'failed')
  const embedderReady = Boolean(embedder?.enabled && embedder.is_configured)
  const doclingReady = docling?.enabled !== false
  const indexedDocsLabel = totalChunks > 0 ? totalChunks.toLocaleString() : '0'
  const healthScore = corpora.length === 0
    ? 0
    : Math.max(0, Math.round(((corpora.length - Math.min(failedJobs.length, corpora.length)) / corpora.length) * 100))
  const pipelineState = embedderReady && doclingReady
    ? 'Ready'
    : embedderReady || doclingReady
      ? 'Partial'
      : 'Setup needed'
  const recentCorpora = [...corpora].sort((a, b) => b.updated_at - a.updated_at).slice(0, 5)
  const activityJobs = [...selectedJobs].sort((a, b) => b.updated_at - a.updated_at).slice(0, 5)

  const quickActions: Array<{ id: OverviewAction; title: string; caption: string; icon: ReactNode }> = [
    { id: 'search', title: 'Search', caption: 'Find sourced chunks', icon: <Search size={15} /> },
    { id: 'chat', title: 'Chat RAG', caption: 'Ask with citations', icon: <Message size={15} /> },
    { id: 'collections', title: 'Collections', caption: 'Manage corpora', icon: <FileText size={15} /> },
    { id: 'sources', title: 'Sources', caption: 'Connect data flows', icon: <DatabaseSearch size={15} /> },
  ]

  return (
    <div className="k-overview-page">
      <section className="k-overview-hero">
        <div>
          <span className="k-overview-kicker">Governance v0.1</span>
          <h1>Vue d'ensemble de la Connaissance</h1>
          <p>Etat de sante, couverture documentaire et fraicheur des corpus disponibles pour le RAG.</p>
        </div>
        <div className="k-overview-actions">
          <button type="button" className="k-mini-action" onClick={onRefresh}>
            <Refresh size={13} /> Refresh
          </button>
          <button type="button" className="k-mini-action primary" onClick={() => onNavigate('search')}>
            <Search size={13} /> Search
          </button>
        </div>
      </section>

      {corporaError && (
        <div className="k-page-error">{corporaError}</div>
      )}

      <section className="k-overview-metrics">
        <MetricCard label="Index global" value={indexedDocsLabel} tone={totalChunks > 0 ? 'ok' : 'warn'} detail={`${corpora.length} collections`} />
        <MetricCard label="Corpus org" value={organizationCorpora.toString()} tone="info" detail={`${corpora.length - organizationCorpora} personal`} />
        <MetricCard label="Pipeline" value={pipelineState} tone={embedderReady && doclingReady ? 'ok' : 'warn'} detail={`${embedder?.model || 'embedder'} / docling ${doclingReady ? 'on' : 'off'}`} />
        <MetricCard label="Health" value={`${healthScore}%`} tone={failedJobs.length === 0 ? 'ok' : 'bad'} detail={`${activeJobs.length} active jobs`} />
      </section>

      <section className="k-overview-grid">
        <main className="k-overview-panel">
          <div className="k-panel-title">
              <span>Activite d'ingestion & corpus</span>
            <strong>{selectedCorpusId === 'all' ? 'All knowledge' : selectedCorpus?.name}</strong>
          </div>
          <div className="k-overview-table">
            <div className="k-overview-table-head">
              <span>Corpus</span>
              <span>Chunks</span>
              <span>Scope</span>
              <span>Updated</span>
            </div>
            {recentCorpora.length === 0 ? (
              <div className="k-dashboard-empty">Create or connect a collection to start indexing knowledge.</div>
            ) : recentCorpora.map((corpus) => (
              <button key={corpus.id} type="button" className="k-overview-row" onClick={() => onNavigate('collections')}>
                <span>
                  <FileText size={14} />
                  <strong>{corpus.name}</strong>
                </span>
                <em>{corpus.chunk_count.toLocaleString()}</em>
                <em>{corpus.workspace_id ? 'Organization' : 'Personal'}</em>
                <em>{formatDate(corpus.updated_at)}</em>
              </button>
            ))}
          </div>
        </main>

        <aside className="k-overview-side">
          <section className="k-overview-panel">
            <div className="k-panel-title">
              <span>Alertes & Actions</span>
              <strong>{failedJobs.length} issues</strong>
            </div>
            <div className="k-alert-stack">
              {!embedderReady && (
                <AlertItem tone="bad" icon={<Caution size={14} />} title="Embedder not configured" text="Vector search needs an enabled embedding model." />
              )}
              {failedJobs.slice(0, 2).map((job) => (
                <AlertItem key={job.id} tone="bad" icon={<Caution size={14} />} title={job.filename} text={job.last_error || 'Ingestion failed.'} />
              ))}
              {embedderReady && failedJobs.length === 0 && (
                <AlertItem tone="ok" icon={<CheckOne size={14} />} title="Knowledge pipeline healthy" text="No failed ingestion job in the selected scope." />
              )}
            </div>
          </section>

          <section className="k-overview-panel">
            <div className="k-panel-title">
              <span>Acces rapides</span>
              <strong>{quickActions.length}</strong>
            </div>
            <div className="k-quick-grid">
              {quickActions.map((action) => (
                <button key={action.id} type="button" onClick={() => onNavigate(action.id)}>
                  {action.icon}
                  <strong>{action.title}</strong>
                  <span>{action.caption}</span>
                </button>
              ))}
            </div>
          </section>
        </aside>
      </section>

      <section className="k-overview-panel">
        <div className="k-panel-title">
          <span>Sessions recentes</span>
          <strong>{activityJobs.length} jobs</strong>
        </div>
        <div className="k-job-timeline">
          {activityJobs.length === 0 ? (
            <div className="k-dashboard-empty">No ingestion activity in the current selection.</div>
          ) : activityJobs.map((job) => (
            <div key={job.id} className="k-job-timeline-row">
              <Lightning size={14} />
              <span>
                <strong>{job.filename}</strong>
                <small>{job.status} - {job.chunk_count} chunks - attempt {job.attempt_count}/{job.max_attempts}</small>
              </span>
              <em>{formatDate(job.updated_at)}</em>
            </div>
          ))}
        </div>
      </section>

      <section className="k-overview-capabilities">
        <CapabilityCard icon={<Shield size={16} />} title="Grounded answers" value={embedderReady ? 'Enabled' : 'Waiting'} />
        <CapabilityCard icon={<DatabaseSearch size={16} />} title="Document conversion" value={doclingReady ? 'Enabled' : 'Disabled'} />
        <CapabilityCard icon={<Message size={16} />} title="Knowledge chat" value="Ready" />
      </section>
    </div>
  )
}

function MetricCard({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: 'ok' | 'warn' | 'bad' | 'info' }) {
  return (
    <article className={`k-overview-metric ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  )
}

function AlertItem({ icon, title, text, tone }: { icon: ReactNode; title: string; text: string; tone: 'ok' | 'bad' }) {
  return (
    <article className={`k-alert-item ${tone}`}>
      {icon}
      <span>
        <strong>{title}</strong>
        <small>{text}</small>
      </span>
    </article>
  )
}

function CapabilityCard({ icon, title, value }: { icon: ReactNode; title: string; value: string }) {
  return (
    <article className="k-capability-card">
      {icon}
      <span>{title}</span>
      <strong>{value}</strong>
    </article>
  )
}
