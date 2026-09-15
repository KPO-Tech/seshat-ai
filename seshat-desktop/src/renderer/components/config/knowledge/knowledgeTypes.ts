export type EmbedderConfig = {
  provider: string
  base_url: string
  model: string
  has_api_key: boolean
  enabled: boolean
  is_configured: boolean
  updated_at?: number
}

export type RerankerConfig = {
  base_url: string
  model: string
  has_api_key: boolean
  enabled: boolean
  is_configured: boolean
  updated_at?: number
}

export type DoclingConfig = {
  base_url: string
  enabled: boolean
  updated_at?: number
}

export type StorageConfigData = {
  provider: string
  local_path?: string
  s3_endpoint?: string
  s3_bucket?: string
  s3_region?: string
  s3_key_prefix?: string
  has_s3_access_key: boolean
  has_s3_secret_key: boolean
  is_configured: boolean
  updated_at?: number
}

export type StorageStatus = {
  active_provider: string
  config: StorageConfigData
  restart_required: boolean
}

export type Corpus = {
  id: string
  name: string
  description?: string
  file_count?: number
  chunk_count?: number
  created_at?: number
  updated_at?: number
}

export type TestResult = {
  ok: boolean
  latency_ms: number
  error: string | null
}

export type TestState = 'idle' | 'running' | 'ok' | 'error'
