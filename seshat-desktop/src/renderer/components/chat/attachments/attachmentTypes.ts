import type { MessageAttachment } from '../lib/chatTypes'

export type AttachmentKind = 'image' | 'audio' | 'video' | 'pdf' | 'text' | 'document' | 'archive' | 'file'

export function attachmentKind(attachment: Pick<MessageAttachment, 'filename' | 'content_type'>): AttachmentKind {
  const mime = attachment.content_type?.toLowerCase() ?? ''
  const extension = attachment.filename.split('.').pop()?.toLowerCase() ?? ''
  if (mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(extension)) return 'image'
  if (mime.startsWith('audio/') || ['mp3', 'wav', 'm4a', 'ogg', 'flac'].includes(extension)) return 'audio'
  if (mime.startsWith('video/') || ['mp4', 'webm', 'mov', 'mkv'].includes(extension)) return 'video'
  if (mime === 'application/pdf' || extension === 'pdf') return 'pdf'
  if (mime.startsWith('text/') || ['txt', 'md', 'csv', 'tsv', 'json', 'yaml', 'yml', 'xml', 'html', 'css', 'js', 'ts', 'tsx', 'py', 'go'].includes(extension)) return 'text'
  if (['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp'].includes(extension)) return 'document'
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(extension)) return 'archive'
  return 'file'
}

export function formatFileSize(value?: number) {
  if (!value || value < 1) return ''
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(value < 10240 ? 1 : 0)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

export function fileTypeLabel(kind: AttachmentKind) {
  if (kind === 'pdf') return 'PDF'
  if (kind === 'image') return 'Image'
  if (kind === 'audio') return 'Audio'
  if (kind === 'video') return 'Video'
  if (kind === 'text') return 'Text'
  if (kind === 'document') return 'Document'
  if (kind === 'archive') return 'Archive'
  return 'File'
}

export function attachmentTypeLabel(attachment: Pick<MessageAttachment, 'filename' | 'content_type'>) {
  const extension = attachment.filename.split('.').pop()?.toLowerCase()
  if (extension === 'docx' || extension === 'doc') return 'Word'
  if (extension === 'pptx' || extension === 'ppt') return 'PowerPoint'
  if (extension === 'xlsx' || extension === 'xls') return 'Excel'
  if (extension === 'csv' || extension === 'tsv') return 'CSV'
  return fileTypeLabel(attachmentKind(attachment))
}
