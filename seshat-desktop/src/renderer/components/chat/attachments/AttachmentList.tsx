import { useEffect, useState } from 'react'
import { usePreviewStore } from '@renderer/stores/preview'
import type { MessageAttachment } from '../lib/chatTypes'
import { downloadAttachment } from './attachmentApi'
import { AttachmentIcon } from './AttachmentIcon'
import { attachmentKind, attachmentTypeLabel, formatFileSize } from './attachmentTypes'

const previewCache = new Map<string, string>()

export function AttachmentList({ attachments, align = 'start' }: { attachments: MessageAttachment[]; align?: 'start' | 'end' }) {
  const images = attachments.filter((item) => attachmentKind(item) === 'image')
  const files = attachments.filter((item) => attachmentKind(item) !== 'image')

  return (
    <div className={`flex max-w-full flex-col gap-2 ${align === 'end' ? 'items-end' : 'items-start'}`}>
      {images.length > 0 && (
        <div className={`grid max-w-full grid-cols-[repeat(auto-fit,minmax(72px,88px))] gap-2 ${align === 'end' ? 'justify-end' : ''}`}>
          {images.map((attachment) => <ImageAttachment key={attachment.id} attachment={attachment} />)}
        </div>
      )}
      {files.length > 0 && (
        <div className={`flex max-w-[568px] flex-wrap gap-2 ${align === 'end' ? 'justify-end' : ''}`}>
          {files.map((attachment) => <FileAttachment key={attachment.id} attachment={attachment} />)}
        </div>
      )}
    </div>
  )
}

function ImageAttachment({ attachment }: { attachment: MessageAttachment }) {
  const open = usePreviewStore((state) => state.open)
  const [url, setUrl] = useState(attachment.preview_url || previewCache.get(attachment.id) || '')

  useEffect(() => {
    if (url) return
    let active = true
    void downloadAttachment(attachment).then((next) => {
      previewCache.set(attachment.id, next)
      if (active) setUrl(next)
    }).catch(() => undefined)
    return () => { active = false }
  }, [attachment, url])

  return (
    <button
      type="button"
      onClick={() => open({ kind: 'file', title: attachment.filename, attachment, url: url || attachment.preview_url, contentType: attachment.content_type })}
      className="flex size-[88px] items-center justify-center overflow-hidden rounded-lg border border-[var(--border-soft)] bg-[var(--surface-panel)] text-[var(--text-muted)] hover:border-[var(--border-strong)]"
      title={attachment.filename}
    >
      {url ? <img src={url} alt={attachment.filename} className="size-full object-cover" /> : <AttachmentIcon kind="image" size={22} />}
    </button>
  )
}

function FileAttachment({ attachment }: { attachment: MessageAttachment }) {
  const open = usePreviewStore((state) => state.open)
  const kind = attachmentKind(attachment)
  const meta = [attachmentTypeLabel(attachment), formatFileSize(attachment.size)].filter(Boolean).join(' | ')
  return (
    <button
      type="button"
      onClick={() => open({ kind: 'file', title: attachment.filename, attachment, contentType: attachment.content_type })}
      className="group flex h-[54px] w-[280px] min-w-0 items-center gap-2 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-panel)] px-2.5 text-left hover:bg-[var(--surface-muted)]"
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-[var(--surface-muted)] text-[var(--text-secondary)]"><AttachmentIcon kind={kind} /></span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12px] font-medium text-[var(--text-primary)]">{attachment.filename}</span>
        <span className="mt-0.5 block text-[10px] text-[var(--text-muted)]">{meta}</span>
      </span>
      <span className="flex size-6 shrink-0 items-center justify-center rounded-md border border-[var(--border-soft)] text-[var(--text-muted)] opacity-0 group-hover:opacity-100"><EyeIcon /></span>
    </button>
  )
}

function EyeIcon() {
  return <svg width="14" height="14" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2.5 9s2.4-4 6.5-4 6.5 4 6.5 4-2.4 4-6.5 4-6.5-4-6.5-4Z" /><circle cx="9" cy="9" r="1.8" /></svg>
}
