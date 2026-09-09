import type { DataflowDefinition } from '@/types/dataflow'

export type JobStatus = 'active' | 'paused'
export type TriggerType = 'cron' | 'interval' | 'once'
export type ExecutionTarget = 'cloud' | 'device'
export type RunStatus = 'queued' | 'claimed' | 'running' | 'completed' | 'failed' | 'cancelled'

export type Job = {
  id: string
  name: string
  description?: string
  status: JobStatus
  trigger_type: TriggerType
  cron_expr?: string
  interval_seconds?: number
  run_at?: string
  next_run_at?: string
  last_run_at?: string
  last_run_status?: RunStatus
  execution_target: ExecutionTarget
  target_device_id?: string
  prompt: string
  graph?: DataflowDefinition
  model_override?: string
  configuration?: Record<string, string>
}

export type JobParams = {
  name: string
  description?: string
  trigger_type: TriggerType
  cron_expr?: string
  interval_seconds?: number
  run_at?: string
  execution_target: ExecutionTarget
  target_device_id?: string
  prompt: string
  model_override?: string
  configuration?: Record<string, string>
}

export type RunNodeTraceEntry = {
  id: string
  type: string
  success: boolean
  skipped?: boolean
  error?: string
  output?: Record<string, unknown>[]
  started_at?: string
  ended_at?: string
  duration_ms?: number
}

export type Run = {
  id: string
  status: RunStatus
  queued_at?: string
  started_at?: string
  finished_at?: string
  output_text?: string
  error_text?: string
  node_trace?: RunNodeTraceEntry[]
}

export type Device = { id: string; name: string; status: string }

export type SystemStatus = { mode: 'standalone' | 'connected'; server_url?: string }
export type InspectorTab = 'plan' | 'activity' | 'outputs'

export type InspectorPlanStep = {
  id: string
  title: string
  status?: 'pending' | 'in_progress' | 'completed' | 'failed'
  detail?: string
}

export type JobDraft = Partial<JobParams> & {
  agent_slug?: string
  provider_setting_id?: string
  model_id?: string
}

export type PlannerPreference = { providerSettingId: string; modelId: string }
