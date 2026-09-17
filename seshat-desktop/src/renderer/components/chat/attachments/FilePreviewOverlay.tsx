import { useEffect, useState } from 'react'
import { usePreviewStore, type PreviewMode } from '@renderer/stores/preview'
import type { MessageAttachment } from '../lib/chatTypes'
import { downloadAttachment } from './attachmentApi'
import { AttachmentIcon } from './AttachmentIcon'
import { attachmentKind, formatFileSize } from './attachmentTypes'
import { DocxPreview } from './previews/DocxPreview'
import { PdfPreview } from './previews/PdfPreview'
import { PptxPreview } from './previews/PptxPreview'
import { XlsxPreview } from './previews/XlsxPreview'
import { CsvPreview } from './previews/CsvPreview'

export function FilePreviewOverlay() {
  const item = usePreviewStore((state) => state.item)
  const mode = usePreviewStore((state) => state.mode)
  const close = usePreviewStore((state) => state.close)
  const setMode = usePreviewStore((state) => state.setMode)
  const [url, setUrl] = useState('')
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [approvedLargeId, setApprovedLargeId] = useState('')

  const deferred = Boolean(item?.attachment && shouldDeferPreview(item.attachment) && approvedLargeId !== item.attachment.id)

  useEffect(() => {
    if (!item) return
    let active = true
    setUrl(item.url ?? '')
    setText('')
    setError('')
    setLoading(false)
    if (item.attachment && shouldDeferPreview(item.attachment) && approvedLargeId !== item.attachment.id) return
    if (item.url) {
      if (item.attachment && needsTextContent(item.title, item.attachment)) {
        setLoading(true)
        void fetch(item.url).then((response) => response.text()).then((content) => { if (active) setText(content) }).catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : 'Preview failed.') }).finally(() => { if (active) setLoading(false) })
      }
      return () => { active = false }
    }
    if (!item.attachment) return
    setLoading(true)
    void downloadAttachment(item.attachment)
      .then(async (nextUrl) => {
        if (!active) return
        setUrl(nextUrl)
        if (needsTextContent(item.title, item.attachment!)) {
          const content = await fetch(nextUrl).then((response) => response.text())
          if (active) setText(content)
        }
      })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : 'Preview failed.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [approvedLargeId, item])

  useEffect(() => {
    if (!item) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [close, item])

  if (!item) return null
  const kind = item.attachment ? attachmentKind(item.attachment) : item.kind === 'image' ? 'image' : 'file'
  const panelClass = mode === 'fullscreen'
    ? 'fixed inset-x-0 bottom-0 top-12'
    : mode === 'side'
      ? 'fixed bottom-0 right-0 top-12 w-[min(720px,56vw)] border-l border-[var(--border-soft)]'
      : 'relative h-[min(820px,86vh)] w-[min(1120px,88vw)] rounded-lg border border-[var(--border-soft)] shadow-[0_28px_90px_rgba(0,0,0,0.45)]'

  return (
    <div className={`z-50 ${mode === 'center' ? 'fixed inset-0 flex items-center justify-center bg-black/55 p-8 backdrop-blur-sm' : ''}`} onMouseDown={(event) => { if (mode === 'center' && event.target === event.currentTarget) close() }}>
      <section className={`${panelClass} flex min-h-0 flex-col overflow-hidden bg-[var(--surface-root)]`}>
        <header className="flex h-12 shrink-0 items-center gap-3 border-b border-[var(--border-soft)] px-3">
          <span className="flex size-7 items-center justify-center rounded-md bg-[var(--surface-muted)] text-[var(--text-secondary)]"><AttachmentIcon kind={kind} size={16} /></span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12px] font-semibold text-[var(--text-primary)]">{item.title}</div>
            {item.attachment && <div className="text-[10px] text-[var(--text-muted)]">{formatFileSize(item.attachment.size)}</div>}
          </div>
          {url && item.kind !== 'artifact' && <a href={url} download={item.title} className="flex size-8 items-center justify-center rounded-md text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]" title="Download"><DownloadIcon /></a>}
          <ModeButton mode="side" current={mode} onClick={setMode} />
          <ModeButton mode="center" current={mode} onClick={setMode} />
          <ModeButton mode="fullscreen" current={mode} onClick={setMode} />
          <button type="button" onClick={close} className="flex size-8 items-center justify-center rounded-md text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]" aria-label="Close preview"><CloseIcon /></button>
        </header>
        <div className="min-h-0 flex-1 overflow-hidden bg-[var(--surface-panel)]">
          {deferred && item.attachment ? <DeferredPreview attachment={item.attachment} onLoad={() => setApprovedLargeId(item.attachment!.id)} />
            : loading ? <PreviewState label="Loading preview" />
            : error ? <PreviewState label={error} danger />
              : <PreviewContent kind={kind} url={url} text={text} title={item.title} artifact={item.kind === 'artifact'} />}
        </div>
      </section>
    </div>
  )
}

function DeferredPreview({ attachment, onLoad }: { attachment: MessageAttachment; onLoad: () => void }) {
  const kind = attachmentKind(attachment)
  return (
    <div className="flex size-full items-center justify-center p-8">
      <div className="flex max-w-[420px] flex-col items-center text-center">
        <span className="flex size-12 items-center justify-center rounded-lg border border-[var(--border-soft)] bg-[var(--surface-muted)] text-[var(--text-secondary)]"><AttachmentIcon kind={kind} size={22} /></span>
        <div className="mt-4 text-[13px] font-semibold text-[var(--text-primary)]">Large document</div>
        <div className="mt-1 text-[12px] leading-5 text-[var(--text-muted)]">
          {attachment.filename} is {formatFileSize(attachment.size)}. Loading its preview may temporarily use additional memory.
        </div>
        <button type="button" onClick={onLoad} className="mt-4 h-8 rounded-md border border-[var(--border-soft)] bg-[var(--surface-muted)] px-3 text-[11.5px] font-semibold text-[var(--text-primary)] hover:border-[var(--accent-primary)]/50 hover:bg-[var(--surface-panel)]">
          Load preview
        </button>
      </div>
    </div>
  )
}

function needsTextContent(title: string, attachment?: MessageAttachment) {
  if (!attachment || attachmentKind(attachment) !== 'text') return false
  const extension = title.split('.').pop()?.toLowerCase()
  return extension !== 'csv' && extension !== 'tsv'
}

function shouldDeferPreview(attachment: MessageAttachment) {
  const size = attachment.size ?? 0
  const extension = attachment.filename.split('.').pop()?.toLowerCase() ?? ''
  if (['docx', 'pptx', 'xlsx', 'csv', 'tsv'].includes(extension)) return size > 15 * 1024 * 1024
  if (extension === 'pdf') return size > 40 * 1024 * 1024
  if (attachmentKind(attachment) === 'video') return size > 80 * 1024 * 1024
  return size > 50 * 1024 * 1024
}

function PreviewContent({ kind, url, text, title, artifact }: { kind: string; url: string; text: string; title: string; artifact: boolean }) {
  const extension = title.split('.').pop()?.toLowerCase() ?? ''
  if (artifact && url) return <iframe src={url} title={title} sandbox="allow-scripts allow-forms allow-modals allow-popups allow-downloads" className="size-full border-0 bg-white" />
  if (kind === 'image' && url) return <div className="flex size-full items-center justify-center overflow-auto p-6"><img src={url} alt={title} className="max-h-full max-w-full object-contain" /></div>
  if (kind === 'audio' && url) return <div className="flex size-full items-center justify-center p-8"><audio controls src={url} className="w-full max-w-[620px]" /></div>
  if (kind === 'video' && url) return <div className="flex size-full items-center justify-center bg-black p-4"><video controls src={url} className="max-h-full max-w-full" /></div>
  if (kind === 'pdf' && url) return <PdfPreview url={url} filename={title} />
  if (extension === 'docx' && url) return <DocxPreview url={url} filename={title} />
  if (extension === 'pptx' && url) return <PptxPreview url={url} filename={title} />
  if (extension === 'xlsx' && url) return <XlsxPreview url={url} filename={title} />
  if ((extension === 'csv' || extension === 'tsv') && url) return <CsvPreview url={url} filename={title} />
  if (kind === 'text' && text) return <pre className="no-scrollbar size-full overflow-auto p-5 font-mono text-[12px] leading-6 text-[var(--text-secondary)]">{text}</pre>
  if (['doc', 'ppt', 'xls'].includes(extension)) return <PreviewState label="This legacy Office format needs conversion to DOCX, PPTX, or XLSX before it can be previewed." />
  return <PreviewState label="Preview is not available for this file type." />
}

function PreviewState({ label, danger = false }: { label: string; danger?: boolean }) {
  return <div className={`flex size-full items-center justify-center px-8 text-center text-[12px] ${danger ? 'text-[var(--accent-danger)]' : 'text-[var(--text-muted)]'}`}>{label}</div>
}

function ModeButton({ mode, current, onClick }: { mode: PreviewMode; current: PreviewMode; onClick: (mode: PreviewMode) => void }) {
  return <button type="button" onClick={() => onClick(mode)} className={`flex size-8 items-center justify-center rounded-md ${current === mode ? 'bg-[var(--surface-muted)] text-[var(--text-primary)]' : 'text-[var(--text-muted)] hover:bg-[var(--surface-muted)]'}`} title={`${mode} view`}><ModeIcon mode={mode} /></button>
}

function ModeIcon({ mode }: { mode: PreviewMode }) {
  if (mode === 'side') return <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="2.5" y="3" width="13" height="12" rx="1.5" /><path d="M9.5 3v12" /></svg>
  if (mode === 'fullscreen') return <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><path d="M3 7V3h4M11 3h4v4M15 11v4h-4M7 15H3v-4" /></svg>
  return <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="4" y="4" width="10" height="10" rx="1.5" /></svg>
}

function DownloadIcon() {
  return <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 3v8M6 8l3 3 3-3M4 15h10" /></svg>
}

function CloseIcon() {
  return <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><path d="m4 4 10 10M14 4 4 14" /></svg>
}
