import type { Agent, ProviderSetting } from '@/api/types'
import type { Job, JobDraft, PlannerPreference, RunStatus } from '../api/types'
export const RUN_STATUS_LABEL: Record<RunStatus, string> = {
  queued: 'Queued', claimed: 'Claimed', running: 'Running',
  completed: 'Completed', failed: 'Failed', cancelled: 'Cancelled',
}

function titleFromRequest(request: string): string {
  const cleaned = request.replace(/\s+/g, ' ').trim()
  if (!cleaned) return 'Scheduled automation'
  const short = cleaned.length > 58 ? `${cleaned.slice(0, 55).trim()}...` : cleaned
  return short[0].toUpperCase() + short.slice(1)
}

function draftScheduleFromRequest(request: string): Pick<JobDraft, 'trigger_type' | 'cron_expr' | 'interval_seconds' | 'run_at'> {
  const text = request.toLowerCase()
  const hourMatch = text.match(/\b(?:a|à|at)\s*(\d{1,2})(?:h|:)?(\d{2})?\b/)
  const hour = hourMatch ? Math.min(23, Number(hourMatch[1])) : 9
  const minute = hourMatch?.[2] ? Math.min(59, Number(hourMatch[2])) : 0
  const minuteHour = `${minute} ${hour}`

  if (/\b(once|une fois|demain|tomorrow)\b/.test(text)) {
    const runAt = new Date()
    runAt.setDate(runAt.getDate() + (/\b(demain|tomorrow)\b/.test(text) ? 1 : 0))
    runAt.setHours(hour, minute, 0, 0)
    return { trigger_type: 'once', run_at: runAt.toISOString() }
  }
  if (/\b(hourly|chaque heure|toutes les heures)\b/.test(text)) return { trigger_type: 'interval', interval_seconds: 3600 }
  if (/\b(daily|tous les jours|chaque jour|quotidien)\b/.test(text)) return { trigger_type: 'cron', cron_expr: `${minuteHour} * * *` }
  if (/\b(monday|lundi)\b/.test(text)) return { trigger_type: 'cron', cron_expr: `${minuteHour} * * 1` }
  if (/\b(friday|vendredi)\b/.test(text)) return { trigger_type: 'cron', cron_expr: `${minuteHour} * * 5` }
  if (/\b(weekly|chaque semaine|hebdo|hebdomadaire)\b/.test(text)) return { trigger_type: 'cron', cron_expr: `${minuteHour} * * 1` }
  if (/\b(monthly|chaque mois|mensuel)\b/.test(text)) return { trigger_type: 'cron', cron_expr: `${minuteHour} 1 * *` }
  return { trigger_type: 'cron', cron_expr: '0 9 * * 1' }
}

// The planner's preferred provider/model is a per-device convenience, not
// job data - persisted in localStorage rather than sent anywhere, same
// pattern as other lightweight per-viewer preferences in this app.
const PLANNER_PREFERENCE_KEY = 'seshat.scheduling-planner-preferred-model.v1'

export function loadPlannerPreference(): PlannerPreference | null {
  try {
    const raw = localStorage.getItem(PLANNER_PREFERENCE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (typeof parsed?.providerSettingId === 'string' && typeof parsed?.modelId === 'string') return parsed
    return null
  } catch {
    return null
  }
}

export function savePlannerPreference(pref: PlannerPreference | null) {
  try {
    if (pref) localStorage.setItem(PLANNER_PREFERENCE_KEY, JSON.stringify(pref))
    else localStorage.removeItem(PLANNER_PREFERENCE_KEY)
  } catch {
    // best-effort only - a private window or blocked storage just means the
    // planner falls back to the org default provider every time, same as
    // before this preference existed at all.
  }
}

export function draftAutomation(request: string, agents: Agent[], providers: ProviderSetting[], preference: PlannerPreference | null): JobDraft {
  const text = request.toLowerCase()
  const selectedAgent =
    agents.find((agent) => text.includes(agent.slug.toLowerCase())) ??
    agents.find((agent) => text.includes((agent.name || '').toLowerCase())) ??
    agents.find((agent) => agent.slug === 'automation-manager') ??
    agents.find((agent) => agent.source === 'user') ??
    agents[0]
  const preferredProvider = preference ? providers.find((item) => item.id === preference.providerSettingId) : undefined
  const provider = preferredProvider ?? providers.find((item) => item.is_default) ?? providers[0]
  const schedule = draftScheduleFromRequest(request)

  return {
    name: titleFromRequest(request),
    description: 'Drafted from the Scheduling assistant. Review every field before creating the job.',
    ...schedule,
    execution_target: 'cloud',
    prompt: `You are running a scheduled automation.\n\nUser request:\n${request.trim()}\n\nExecute the task carefully, summarize what was done, and include any errors or follow-up needed.`,
    agent_slug: selectedAgent?.slug,
    provider_setting_id: provider?.id,
    model_id: preferredProvider ? preference?.modelId : undefined,
  }
}

export function describeTrigger(job: Job): string {
  switch (job.trigger_type) {
    case 'cron': return job.cron_expr ? `cron ${job.cron_expr}` : 'cron'
    case 'interval': return job.interval_seconds ? `every ${job.interval_seconds}s` : 'interval'
    case 'once': return job.run_at ? `once at ${new Date(job.run_at).toLocaleString()}` : 'once'
    default: return job.trigger_type
  }
}

