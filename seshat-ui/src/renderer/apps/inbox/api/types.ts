export type ChannelAccount = {
  id: string
  channel: 'gmail' | 'whatsapp' | string
  display_name: string
  external_account_id: string
  status: string
  last_synced_at?: number
  last_error?: string
  created_at: number
}

export type Contact = {
  id: string
  external_id: string
  display_name: string
  avatar_url?: string
}

export type Thread = {
  id: string
  channel_account_id: string
  channel: string
  contact: Contact
  subject?: string
  status: 'open' | 'handled' | 'snoozed' | 'escalated' | string
  priority_score: number
  last_message_at: number
}

export type Attachment = {
  id: string
  filename: string
  content_type: string
  size: number
}

export type ThreadMessage = {
  id: string
  thread_id: string
  direction: 'inbound' | 'outbound' | string
  body_text: string
  attachments?: Attachment[]
  is_draft: boolean
  sent_at: number
}

export type OAuthChannel = 'gmail' | 'outlook' | 'teams'
export type ChatModelPreference = { providerSettingId: string; modelId: string }
