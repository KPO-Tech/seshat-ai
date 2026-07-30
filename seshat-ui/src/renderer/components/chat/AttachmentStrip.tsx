import { useState } from 'react'
import { Close, PreviewOpen } from '@icon-park/react'
import { api } from '@/api/client'
import { useUIStore } from '@/stores/ui'
import { useAttachmentBlobUrl } from '@/hooks/useAttachmentBlobUrl'
import type { Attachment } from '@/api/types'

function iconFor(category: Attachment['category']): string {
  if (category === 'images') return '🖼'
  if (category === 'documents') return '📄'
  if (category === 'audio') return '🎵'
  return '📎'
}

function formatSize(bytes: number): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function ImageThumb({ attachment, onOpen }: { attachment: Attachment; onOpen: () => void }) {
  const { url, error, loading } = useAttachmentBlobUrl(attachment.file_id)
  if (error) {
    return (
      <div className="attach-thumb attach-thumb--error" title={attachment.filename}>
        <span aria-hidden>🖼</span>
      </div>
    )
  }
  return (
    <button
      type="button"
      className="attach-thumb"
      onClick={onOpen}
      title={attachment.filename}
      disabled={loading || !url}
    >
      {url && <img src={url} alt={attachment.filename} loading="lazy" />}
    </button>
  )
}

function DocumentChip({ attachment }: { attachment: Attachment }) {
  const openRightPanel = useUIStore((s) => s.openRightPanel)
  const [busy, setBusy] = useState(false)

  async function handleOpen() {
    if (busy) return
    setBusy(true)
    try {
      const result = await api.get<{ filename: string; markdown: string }>(`/files/${attachment.file_id}/markdown`)
      openRightPanel({
        kind: 'markdown',
        title: result.filename || attachment.filename,
        sourceLabel: 'Document',
        markdown: result.markdown,
      })
    } catch {
      // No conversion available (unsupported format, or predates docling
      // being configured) — offer the raw file instead of a dead click.
      try {
        const blob = await api.getBlob(`/files/${attachment.file_id}/content`)
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = attachment.filename
        link.click()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
      } catch {
        // Best effort — nothing more we can do if the download also fails.
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      className={`attach-chip attach-chip--${attachment.category}`}
      onClick={handleOpen}
      disabled={busy}
      title={attachment.filename}
    >
      <span className="attach-chip-icon" aria-hidden>{iconFor(attachment.category)}</span>
      <span className="attach-chip-name">{attachment.filename}</span>
      {attachment.size > 0 && <span className="attach-chip-size">{formatSize(attachment.size)}</span>}
      <PreviewOpen size={11} className="attach-chip-preview-icon" />
    </button>
  )
}

function Lightbox({ attachment, onClose }: { attachment: Attachment; onClose: () => void }) {
  const { url, error } = useAttachmentBlobUrl(attachment.file_id)
  return (
    <div className="attach-lightbox" onClick={onClose} role="dialog" aria-modal="true" aria-label={attachment.filename}>
      <button className="attach-lightbox-close" onClick={onClose} aria-label="Close" title="Close">
        <Close size={18} />
      </button>
      {error && <div className="attach-lightbox-error">Unable to load image</div>}
      {url && (
        <img
          src={url}
          alt={attachment.filename}
          onClick={(e) => e.stopPropagation()}
        />
      )}
      <div className="attach-lightbox-caption" onClick={(e) => e.stopPropagation()}>{attachment.filename}</div>
    </div>
  )
}

export function AttachmentStrip({ attachments }: { attachments: Attachment[] }) {
  const [lightboxTarget, setLightboxTarget] = useState<Attachment | null>(null)
  if (!attachments.length) return null

  const images = attachments.filter((a) => a.category === 'images')
  const others = attachments.filter((a) => a.category !== 'images')

  return (
    <div className="attach-strip">
      {images.length > 0 && (
        <div className="attach-thumb-row">
          {images.map((a) => (
            <ImageThumb key={a.file_id} attachment={a} onOpen={() => setLightboxTarget(a)} />
          ))}
        </div>
      )}
      {others.length > 0 && (
        <div className="attach-chip-row">
          {others.map((a) => (
            <DocumentChip key={a.file_id} attachment={a} />
          ))}
        </div>
      )}
      {lightboxTarget && <Lightbox attachment={lightboxTarget} onClose={() => setLightboxTarget(null)} />}
    </div>
  )
}

export const ATTACHMENT_STRIP_CSS = `
.attach-strip {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-width: 100%;
}

.attach-thumb-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: flex-end;
}

.attach-thumb {
  width: 96px;
  height: 96px;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid var(--color-border-subtle);
  padding: 0;
  background: var(--color-surface);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.attach-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.attach-thumb--error {
  cursor: default;
  color: var(--color-text-muted);
  font-size: 20px;
}

.attach-chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: flex-end;
}

.attach-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 9px;
  border-radius: 8px;
  border: 1px solid var(--color-border-subtle);
  background: var(--color-surface);
  cursor: pointer;
  color: var(--color-text);
  max-width: 240px;
}

.attach-chip:hover {
  background: var(--color-hover);
}

.attach-chip-icon {
  font-size: 13px;
  flex-shrink: 0;
}

.attach-chip-name {
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.attach-chip-size {
  font-size: 10px;
  color: var(--color-text-muted);
  flex-shrink: 0;
}

.attach-chip-preview-icon {
  color: var(--color-text-muted);
  flex-shrink: 0;
}

.attach-lightbox {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.82);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 12px;
  z-index: 1000;
  cursor: zoom-out;
}

.attach-lightbox img {
  max-width: 90vw;
  max-height: 82vh;
  object-fit: contain;
  border-radius: 6px;
  cursor: default;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
}

.attach-lightbox-caption {
  color: rgba(255, 255, 255, 0.85);
  font-size: 12px;
  cursor: default;
}

.attach-lightbox-error {
  color: rgba(255, 255, 255, 0.85);
  font-size: 13px;
}

.attach-lightbox-close {
  position: absolute;
  top: 18px;
  right: 22px;
  background: rgba(255, 255, 255, 0.1);
  border: none;
  color: #fff;
  border-radius: 50%;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.attach-lightbox-close:hover {
  background: rgba(255, 255, 255, 0.2);
}
`
