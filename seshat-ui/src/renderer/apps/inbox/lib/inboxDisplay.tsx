import { Mail, Message } from '@icon-park/react'
import type { Thread } from '../api/types'

export const THREADS_PAGE_SIZE = 50

export type ConnectableChannelId = 'gmail' | 'outlook' | 'whatsapp' | 'teams'

export const CONNECTABLE_CHANNELS: Array<{ id: ConnectableChannelId; label: string; description: string }> = [
  { id: 'gmail', label: 'Gmail', description: 'Sync and reply to a Gmail inbox.' },
  { id: 'outlook', label: 'Outlook', description: 'Sync and reply to an Outlook Mail inbox.' },
  { id: 'whatsapp', label: 'WhatsApp', description: 'Pair a WhatsApp account by scanning a QR code.' },
  { id: 'teams', label: 'Teams', description: 'Sync and reply to Microsoft Teams chats.' },
]

export const STATUS_TABS: Array<{ id: string; label: string }> = [
  { id: 'open', label: 'Open' },
  { id: 'snoozed', label: 'Snoozed' },
  { id: 'escalated', label: 'Escalated' },
  { id: 'handled', label: 'Handled' },
]

export function channelIcon(channel: string, size = 13) {
  return channel === 'gmail' || channel === 'outlook' ? <Mail size={size} /> : <Message size={size} />
}

export function formatAttachmentSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function formatDate(ts?: number): string {
  if (!ts) return 'Never'
  return new Date(ts * 1000).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function statusTone(status: string): 'ok' | 'bad' | 'wait' {
  if (status === 'connected') return 'ok'
  if (status === 'error' || status === 'disconnected') return 'bad'
  return 'wait'
}

export function displayContact(thread: Thread): string {
  return thread.contact.display_name || thread.contact.external_id || 'Unknown contact'
}

export function channelLabel(channel: string): string {
  if (channel === 'gmail') return 'Gmail'
  if (channel === 'whatsapp') return 'WhatsApp'
  if (channel === 'outlook') return 'Outlook'
  if (channel === 'teams') return 'Teams'
  return channel.charAt(0).toUpperCase() + channel.slice(1)
}
