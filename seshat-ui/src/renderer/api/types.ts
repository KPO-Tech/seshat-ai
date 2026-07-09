// Types mirroring nexus-engine API surface

export type Role = 'user' | 'assistant' | 'system'

export type TextBlock = {
  type: 'text'
  text: string
}

export type ThinkingBlock = {
  type: 'thinking'
  thinking: string
}

export type ToolApproval = {
  toolUseId: string
  toolName: string
  toolInput: Record<string, unknown>
  description?: string
}

export type PromptOption = {
  label: string
  value: unknown
  description?: string
}

export type ToolPromptRequest = {
  promptId: string
  type: 'choice' | 'text' | 'confirm'
  message: string
  options?: PromptOption[]
  default?: unknown
  metadata?: Record<string, unknown>
}

export type ToolStatus =
  | 'pending'
  | 'running'
  | 'awaiting_approval'
  | 'completed'
  | 'failed'

export type ToolRenderResult = {
  content: string
  isError: boolean
  durationMs?: number
  metadata?: Record<string, unknown>
}

export type ToolUseBlock = {
  type: 'tool_use'
  id: string
  name: string
  input: Record<string, unknown>
  metadata?: Record<string, unknown>
  // Frontend-only fields used by the chat renderer/state machine
  _result?: ToolRenderResult
  _status?: ToolStatus
  _approval?: ToolApproval
  _prompt?: ToolPromptRequest
  _partialInput?: string
  _message?: string
}

export type ToolResultBlock = {
  type: 'tool_result'
  tool_use_id: string
  content: string | ContentBlock[]
  is_error?: boolean
  metadata?: Record<string, unknown>
}

export type ContentBlock = TextBlock | ThinkingBlock | ToolUseBlock | ToolResultBlock

export type Message = {
  id?: string
  role: Role
  content: ContentBlock[]
  timestamp?: string
  metadata?: Record<string, unknown>
}

export type TokenUsage = {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens?: number
  cache_creation_input_tokens?: number
}

export type QueryRequest = {
  session_id?: string
  model?: string
  messages: Message[]
  max_tokens?: number
  temperature?: number
}

export type QueryResponse = {
  message_id: string
  role: 'assistant'
  content: ContentBlock[]
  stop_reason: string
  usage: TokenUsage
  metadata: Record<string, unknown>
}

export type StreamEvent =
  | { type: 'content_block_start'; content_block: ContentBlock }
  | { type: 'content_block_delta'; delta?: string; delta_type?: 'text_delta' | 'thinking_delta' | 'input_json_delta'; partial_json?: string }
  | { type: 'content_block_stop' }
  | { type: 'message_delta'; stop_reason?: string; usage?: TokenUsage }
  | { type: 'message_stop'; stop_reason?: string }
  | { type: 'error'; error?: { message?: string } }

export type Session = {
  session_id: string
  user_id?: string
  title?: string
  created_at: number
  updated_at: number
  messages: Message[]
  provider_setting_id?: string
  model_id?: string
  permission_mode?: string
  execution_origin?: string
  workspace_path?: string
  project_path?: string
}

export type ProviderModel = {
  id: string
  provider_setting_id: string
  model_id: string
  display_name: string
  context_window: number
  max_output: number
  default_temperature: number
  description: string
  is_default: boolean
  sort_order: number
  source: 'catalog' | 'user'
  created_at: number
  updated_at: number
}

// ProviderSetting matches the backend settingResponse struct
export type OAuthChallenge = {
  status: string
  user_code: string
  verification_url: string
  poll_interval_seconds: number
  expires_at: number
}

export type ProviderSetting = {
  id: string
  user_id: string
  provider: string
  name: string
  auth_kind: string
  base_url: string
  model_id: string
  has_api_key: boolean
  is_default: boolean
  connection_status: string
  last_error?: string
  oauth_account_email?: string
  oauth_subject?: string
  oauth_expires_at?: number
  created_at: number
  updated_at: number
}

// Legacy alias kept for backward compat
export type Provider = ProviderSetting & {
  models?: ProviderModel[]
}

export type User = {
  id: string
  email: string
  display_name: string
  status: string
}

export type ApiKey = {
  id: string
  name: string
  key_preview: string
  created_at: string
}

export type LoginRequest = {
  email: string
  password: string
}

export type LoginResponse = {
  token: string
  expires_at: string
  user: User
  roles: string[]
}

export type ApiError = {
  error: string
  message: string
  status: number
}

export type WebSearchSettings = {
  id?: string
  user_id: string
  enabled: boolean
  provider_setting_ids: string[]
  allow_env_fallback: boolean
  allowed_domains: string[]
  blocked_domains: string[]
  max_queries_per_day: number
  created_at?: number
  updated_at?: number
}

export type DomainCategory = {
  id: string
  label: string
  icon: string
  domains: string[]
}

export type SearchProviderConfig = {
  provider: string
  label: string
  enabled: boolean
  has_api_key: boolean
  base_url: string
  auth_username?: string
  requires_api_key: boolean
  requires_base_url: boolean
  default_base_url: string
  priority: number
  updated_at?: number
}

export type Corpus = {
  id: string
  user_id: string
  name: string
  description?: string
  chunk_count: number
  created_at: number
  updated_at: number
}

export type CorpusFile = {
  corpus_id: string
  file_id: string
  filename: string
  status: string        // 'pending' | 'ingested' | 'failed'
  chunk_count: number
  ingested_at?: number
  created_at: number
}

export type IngestionJob = {
  id: string
  corpus_id: string
  file_id: string
  filename: string
  status: string        // 'pending' | 'running' | 'completed' | 'failed'
  attempt_count: number
  max_attempts: number
  chunk_count: number
  last_error?: string
  started_at?: number
  completed_at?: number
  created_at: number
  updated_at: number
}

export type FileItem = {
  id: string
  filename: string
  content_type: string
  size: number
  created_at: number
}

export type EmbedderConfig = {
  provider: string
  base_url: string
  model: string
  has_api_key: boolean
  enabled: boolean
  is_configured: boolean
  updated_at?: number
}

export type UserMemory = {
  id: string
  type: string
  key: string
  value: string
  importance: number
  source?: string
  created_at: number
  updated_at: number
}

export type StorageConfigData = {
  provider: string           // 'local' | 's3' | 'minio'
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

export type UserPreferences = {
  user_id?: string
  preferred_name: string
  profession: string
  about: string
  working_style: string
  response_style: string
  extra_context: string
  interactive_permission_mode?: string
  automation_permission_mode?: string
  updated_at?: number
}

export type RAGSearchResult = {
  key: string
  text: string
  score: number
  metadata?: Record<string, string>
}

export type SessionSearchResult = {
  session_id: string
  title: string
  preview?: string
  created_at: number
  updated_at: number
}

export type AdminGroup = {
  id: string
  name: string
  description: string
  permissions: Record<string, unknown>
  created_at: string
  updated_at: string
}

export type AdminOrganization = {
  id: string
  name: string
  slug: string
  owner_user_id?: string
  status: string
}

export type AdminWorkspace = {
  id: string
  organization_id: string
  name: string
  slug: string
  status: string
}

// ─── Plan documents ───────────────────────────────────────────────────────────

export type PlanStatus = 'pending' | 'validated' | 'rejected'

export type PlanDocument = {
  id: string
  session_id: string
  slug: string
  filename: string
  content: string
  status: PlanStatus
  version: number
  created_at: number
  updated_at: number
}

// ─── Agents ───────────────────────────────────────────────────────────────────

export type AgentSource = 'user' | 'built-in' | 'builtin'

export type Agent = {
  id?: string
  slug: string
  name: string
  when_to_use: string
  system_prompt: string
  model: string
  tools: string[]
  disallowed_tools: string[]
  max_turns: number
  permission_mode: string
  isolation: string
  mcp_servers: string[]
  icon: string
  enabled: boolean
  source: AgentSource
  created_at?: number
  updated_at?: number
}

export type CreateAgentBody = {
  slug: string
  name?: string
  when_to_use?: string
  system_prompt?: string
  model?: string
  tools?: string[]
  disallowed_tools?: string[]
  max_turns?: number
  permission_mode?: string
  isolation?: string
  mcp_servers?: string[]
  icon?: string
  enabled?: boolean
}

export type UpdateAgentBody = Partial<Omit<CreateAgentBody, 'slug'>>

// ─── Scheduled jobs ───────────────────────────────────────────────────────────

export type JobStatus = '' | 'ok' | 'error' | 'running'

export type ScheduledJob = {
  id: string
  name: string
  cron_expr: string
  agent_slug: string
  prompt: string
  session_title: string
  enabled: boolean
  last_run_at?: string   // ISO-8601, absent when never ran
  next_run_at: string    // ISO-8601
  last_status: JobStatus
  last_error: string
  created_at: string
  updated_at: string
}

export type CreateJobBody = {
  name?: string
  cron_expr: string
  prompt: string
  agent_slug?: string
  session_title?: string
  enabled?: boolean
}

export type UpdateJobBody = Partial<CreateJobBody>

// ─── Automation jobs (seshat-automation daemon) ───────────────────────────────

export type AutomationTriggerType = 'cron' | 'interval' | 'once'

export type AutomationTrigger = {
  type: AutomationTriggerType
  cron?: string
  interval?: string   // Go duration string, e.g. "24h"
  run_at?: string     // RFC3339
}

export type AutomationAgentConfig = {
  slug?: string
  base_type?: string
  tools?: string[]
  skills?: string[]
  model?: string
  max_turns?: number
  system_prompt?: string
}

export type AutomationJobStatus = 'active' | 'paused' | 'inactive'
export type AutomationRunStatus = 'running' | 'success' | 'error'

export type AutomationJob = {
  id: string
  owner_id: string
  name: string
  description: string
  trigger: AutomationTrigger
  agent: AutomationAgentConfig
  task: string
  status: AutomationJobStatus
  last_run_at?: string   // RFC3339
  next_run_at?: string   // RFC3339
  last_run_status: string
  created_at: string
  updated_at: string
}

export type AutomationRun = {
  id: string
  job_id: string
  started_at: string
  ended_at?: string
  status: AutomationRunStatus
  output: string
  error: string
}

export type CreateAutomationJobBody = {
  name: string
  description?: string
  trigger: AutomationTrigger
  agent: AutomationAgentConfig
  task: string
}

// ─── Plan runtime event ───────────────────────────────────────────────────────

export type PlanRuntimeEvent = {
  plan_id: string
  slug: string
  filename: string
  status: PlanStatus
  version: number
}
