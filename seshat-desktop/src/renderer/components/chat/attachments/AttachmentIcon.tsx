import type { AttachmentKind } from './attachmentTypes'

export function AttachmentIcon({ kind, size = 18 }: { kind: AttachmentKind; size?: number }) {
  if (kind === 'image') return <ImageIcon size={size} />
  if (kind === 'audio') return <AudioIcon size={size} />
  if (kind === 'video') return <VideoIcon size={size} />
  if (kind === 'archive') return <ArchiveIcon size={size} />
  return <FileIcon size={size} />
}

function FileIcon({ size }: { size: number }) {
  return <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 2.5h6l4 4v11H5z" /><path d="M11 2.5v4h4M7.5 11h5M7.5 14h4" /></svg>
}

function ImageIcon({ size }: { size: number }) {
  return <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="2.5" y="3.5" width="15" height="13" rx="2" /><circle cx="7" cy="8" r="1.5" /><path d="m4.5 14 4-4 2.5 2.5 2-2 2.5 3.5" /></svg>
}

function AudioIcon({ size }: { size: number }) {
  return <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 14.5V5l8-1.5V13" /><circle cx="5" cy="14.5" r="2" /><circle cx="13" cy="13" r="2" /></svg>
}

function VideoIcon({ size }: { size: number }) {
  return <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="2.5" y="4" width="11" height="12" rx="2" /><path d="m13.5 8 4-2v8l-4-2" /></svg>
}

function ArchiveIcon({ size }: { size: number }) {
  return <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 3h12v4H4zM5 7h10v10H5zM8 10h4" /></svg>
}
