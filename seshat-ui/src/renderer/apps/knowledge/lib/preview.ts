import type { CorpusFile } from '@/api/types'
import type { KnowledgePreviewKind } from '../api/types'

const MARKDOWN_EXTENSIONS = new Set(['md', 'markdown'])
const TEXT_EXTENSIONS = new Set(['txt', 'json', 'yaml', 'yml', 'log', 'tex'])
const MARKDOWN_CONVERTED_EXTENSIONS = new Set(['html', 'htm'])
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'tiff', 'tif', 'gif', 'bmp', 'webp'])
const AUDIO_EXTENSIONS = new Set(['wav', 'mp3', 'm4a', 'ogg', 'flac'])

export function fileExtension(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() ?? ''
}

export function previewKind(filename: string): KnowledgePreviewKind {
  const ext = fileExtension(filename)
  if (ext === 'pdf') return 'pdf'
  if (ext === 'docx') return 'docx'
  if (ext === 'xlsx' || ext === 'xls') return 'xlsx'
  if (ext === 'pptx') return 'pptx'
  if (ext === 'csv' || ext === 'tsv') return 'csv'
  if (MARKDOWN_EXTENSIONS.has(ext)) return 'markdown'
  if (TEXT_EXTENSIONS.has(ext)) return 'text'
  if (MARKDOWN_CONVERTED_EXTENSIONS.has(ext)) return 'markdown'
  if (IMAGE_EXTENSIONS.has(ext)) return 'image'
  if (AUDIO_EXTENSIONS.has(ext)) return 'audio'
  return 'unsupported'
}

export function textPreviewEndpoint(file: CorpusFile, kind: KnowledgePreviewKind): string {
  const ext = fileExtension(file.filename)
  if (kind === 'markdown' && MARKDOWN_CONVERTED_EXTENSIONS.has(ext)) return `/files/${file.file_id}/markdown`
  return `/files/${file.file_id}/content`
}

export function decodeDataUrlText(dataUrl: string): string {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
  return new TextDecoder('utf-8').decode(bytes)
}
