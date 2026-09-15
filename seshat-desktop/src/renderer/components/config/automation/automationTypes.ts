export type AutomationStatus = {
  connected: boolean
  server_url?: string
  device_id?: string
  device_name?: string
  connected_by_user_id?: string
  connected_at?: string
  policies?: Record<string, boolean>
  min_app_version?: string
  app_version_outdated?: boolean
}

export type AutomationRun = {
  id: string
  job_id: string
  job_name?: string
  status: string
  queued_at?: string
  started_at?: string
  finished_at?: string
  error_text?: string
}

export type AutomationJob = {
  id: string
  name: string
  description?: string
  status: string
  trigger_type: string
  cron_expr?: string
  interval_seconds?: number
  next_run_at?: string
  last_run_at?: string
  last_run_status?: string
  execution_target?: string
  target_device_id?: string
}

export type AutomationOverview = {
  stats?: {
    active_projects?: number
    total_projects?: number
    executions_window?: number
    completed_window?: number
    failed_window?: number
    success_rate_percent?: number
  }
  attention?: Array<{ kind: string; job_id: string; job_name: string; message: string; detected_at: string }>
  recent_activity?: Array<{ run_id: string; job_id: string; job_name: string; status: string; queued_at: string }>
}
