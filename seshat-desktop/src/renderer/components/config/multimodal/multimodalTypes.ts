export type CapabilityName = 'image' | 'audio' | 'embeddings'

export type CapabilityCandidate = {
  id: string
  provider: string
  name: string
  base_url?: string
  model?: string
}

export type CapabilityStatus = {
  capability: CapabilityName
  linked_provider_id?: string
  linked_provider?: string
  linked_name?: string
  candidates: CapabilityCandidate[]
}

export type SystemStatus = {
  mode: 'standalone' | 'connected'
  server_url?: string
  sandbox_confined?: boolean
  sandbox_kind?: string
  docling_configured?: boolean
  local_stt_configured?: boolean
  image_generation_configured?: boolean
}

export type LocalSTTConfig = {
  base_url: string
  enabled: boolean
  updated_at?: number
}
