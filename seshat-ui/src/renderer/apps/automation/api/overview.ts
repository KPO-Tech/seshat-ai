import type { RunStatus } from '@/types/dataflow'

// Mirrors seshat-server's automation.Overview (internal/server/automation/
// overview.go) - kept separate from types.ts the same way graph/types.ts
// already separates dataflow-specific types from the app-level job/template
// types.

export type AttentionItemKind = 'consecutive_failures'

export type AttentionItem = {
  kind: AttentionItemKind
  job_id: string
  job_name: string
  message: string
  last_run_id?: string
  detected_at: string
}

export type RecentActivityItem = {
  run_id: string
  job_id: string
  job_name: string
  status: RunStatus
  queued_at: string
  started_at?: string
  finished_at?: string
}

export type OverviewStats = {
  active_projects: number
  total_projects: number
  new_projects_this_month: number
  window_days: number
  executions_window: number
  completed_window: number
  failed_window: number
  // Absent (not 0) when there is no finished run in the window at all - see
  // the backend's own doc comment on why an undefined rate must never
  // render as a fabricated 0%/100%.
  success_rate_percent?: number
  failure_rate_percent?: number
}

export type Overview = {
  stats: OverviewStats
  attention: AttentionItem[]
  recent_activity: RecentActivityItem[]
}
