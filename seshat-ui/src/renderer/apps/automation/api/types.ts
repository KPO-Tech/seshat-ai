import type { Agent } from '@/api/types'
import type { DataflowDefinition } from '@/types/dataflow'
import type { RunStatus } from '@/types/dataflow'

export type TriggerType = 'cron' | 'interval' | 'once'
export type ExecutionTarget = 'cloud' | 'device'
export type JobStatus = 'active' | 'paused'
export type Device = { id: string; name: string; status: string }
export type RailView = 'overview' | 'graph' | 'runs' | 'templates' | 'variables' | 'help'

export type AutomationJob = {
  id: string
  organization_id?: string
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
  webhook_token?: string
  webhook_method?: string
  graph?: DataflowDefinition
  model_override?: string
  configuration?: Record<string, string>
  error_workflow_job_id?: string
}

// Tier 3.3 - a Seshat-authored starting point for a new automation (see
// seshat-server's automation.Template). A small built-in catalog, not
// org-scoped - the same static-catalog posture as NodeDescription.
export type AutomationTemplate = {
  id: string
  name: string
  description: string
  category: string
  definition: DataflowDefinition
}

export type { Agent }
