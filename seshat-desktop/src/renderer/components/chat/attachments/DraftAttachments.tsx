import { useEffect, useState } from 'react'
import { AttachmentIcon } from './AttachmentIcon'
import { attachmentKind, formatFileSize } from './attachmentTypes'

export function DraftAttachments({ files, onRemove }: { files: File[]; onRemove: (index: number) => void }) {
  if (!files.length) return null
  return (
    <div className="no-scrollbar mb-2 flex max-w-full gap-2 overflow-x-auto pb-0.5">
      {files.map((file, index) => {
        const kind = attachmentKind({ filename: file.name, content_type: file.type })
        return (
          <div key={`${file.name}-${file.size}-${index}`} className="group relative flex h-12 min-w-[190px] max-w-[250px] items-center gap-2 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-muted)] px-2">
            {kind === 'image' ? <DraftImage file={file} /> : <span className="flex size-8 shrink-0 items-center justify-center text-[var(--text-secondary)]"><AttachmentIcon kind={kind} /></span>}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[11px] font-medium text-[var(--text-primary)]">{file.name}</span>
              <span className="block text-[10px] text-[var(--text-muted)]">{formatFileSize(file.size)}</span>
            </span>
            <button type="button" onClick={() => onRemove(index)} className="flex size-5 shrink-0 items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--surface-panel)] hover:text-[var(--text-primary)]" aria-label={`Remove ${file.name}`}><CloseIcon /></button>
          </div>
        )
      })}
    </div>
  )
}

function DraftImage({ file }: { file: File }) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    const next = URL.createObjectURL(file)
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [file])
  return url ? <img src={url} alt="" className="size-8 shrink-0 rounded-md object-cover" /> : null
}

function CloseIcon() {
  return <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><path d="m3 3 6 6M9 3 3 9" /></svg>
}
