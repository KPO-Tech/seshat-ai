import { api, SESHAT_BASE } from '@renderer/api/client'
import type { MessageAttachment } from '../lib/chatTypes'

type UploadedFile = MessageAttachment & {
  session_id?: string
  created_at?: number
}

export async function uploadSessionFile(sessionId: string, file: File): Promise<MessageAttachment> {
  const bridge = window.nexus?.http
  if (!bridge?.uploadFile) throw new Error('Desktop upload bridge is unavailable.')
  const response = await bridge.uploadFile({
    path: `/sessions/${encodeURIComponent(sessionId)}/files`,
    filename: file.name,
    contentType: file.type,
    data: await file.arrayBuffer()
  })
  if (!response.ok) throw new Error(response.text || `Upload failed with HTTP ${response.status}`)
  const uploaded = response.data as UploadedFile
  return {
    id: uploaded.id,
    filename: uploaded.filename,
    content_type: uploaded.content_type || file.type,
    size: uploaded.size ?? file.size,
    category: uploaded.category,
    preview_url: URL.createObjectURL(file)
  }
}

export async function downloadAttachment(attachment: MessageAttachment) {
  if (attachment.preview_url) return attachment.preview_url
  const bridge = window.nexus?.http
  if (!bridge?.downloadFile) throw new Error('Desktop download bridge is unavailable.')
  const response = await bridge.downloadFile(`/files/${encodeURIComponent(attachment.id)}/content`)
  if (!response.ok || !response.data?.dataBase64) throw new Error(response.text || `Download failed with HTTP ${response.status}`)
  const bytes = base64Bytes(response.data.dataBase64)
  const blob = new Blob([bytes], { type: response.data.contentType || attachment.content_type || 'application/octet-stream' })
  return URL.createObjectURL(blob)
}

export async function createArtifactPreview(html: string) {
  const result = await api.post<{ id: string }>('/artifacts/preview', { html })
  return `${SESHAT_BASE}/artifacts/preview/${encodeURIComponent(result.id)}`
}

function base64Bytes(value: string) {
  const binary = window.atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}
