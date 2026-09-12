import { api } from '@/api/client'
import type { Agent, ProviderSetting } from '@/api/types'
import type { Job, JobDraft, RunStatus, TriggerType, WebhookMethod, WebhookResponseMode } from '../api/types'
export const RUN_STATUS_LABEL: Record<RunStatus, string> = {
  queued: 'Queued', claimed: 'Claimed', running: 'Running',
  completed: 'Completed', failed: 'Failed', cancelled: 'Cancelled',
}

// Response shape of POST /automation/jobs/draft (seshat-server's
// automation.JobDraft, relayed as-is) - the schedule/prompt/name fields a
// real one-shot agent call produces from the request text. Deliberately
// does not cover execution_target/model_override/agent selection, which
// stay resolved locally below exactly as before this was a real agent call.
type ScheduleDraftResponse = {
  name: string
  description?: string
  trigger_type: TriggerType
  cron_expr?: string
  interval_seconds?: number
  run_at?: string
  webhook_method?: WebhookMethod
  webhook_response_mode?: WebhookResponseMode
  prompt: string
}

// selectDefaultAgent/selectDefaultProvider are the "who runs it" defaulting
// chain shared by draftAutomation (below) and jobTemplates.ts's
// templateToDraft - a template has no request text to keyword-match against,
// so it skips straight to the same fallback tail draftAutomation uses when
// no keyword match hits. Always the organization's default provider/model -
// no per-device override UI exists for this (removed as unnecessary
// clutter; the org default is the right choice for almost everyone).
export function selectDefaultAgent(agents: Agent[], requestText?: string): Agent | undefined {
  const text = requestText?.toLowerCase()
  return (
    (text ? agents.find((agent) => text.includes(agent.slug.toLowerCase())) : undefined) ??
    (text ? agents.find((agent) => text.includes((agent.name || '').toLowerCase())) : undefined) ??
    agents.find((agent) => agent.slug === 'automation-manager') ??
    agents.find((agent) => agent.source === 'user') ??
    agents[0]
  )
}

export function selectDefaultProvider(providers: ProviderSetting[]): ProviderSetting | undefined {
  return providers.find((item) => item.is_default) ?? providers[0]
}

// draftAutomation hands the request to a real one-shot agent call
// (POST /automation/jobs/draft - see automation.Service.DraftJob in
// seshat-server) to work out the schedule and the job's prompt, then keeps
// the existing local logic for picking *who runs it*: a keyword-matched
// agent and the organization's default provider. Throws on failure (LLM
// call/timeout/parse error) - the caller is expected to surface that as a
// real error, not swallow it, since this sits in the confirm-before-create
// path for a job that will execute real prompts against real systems.
export async function draftAutomation(request: string, agents: Agent[], providers: ProviderSetting[]): Promise<JobDraft> {
  const selectedAgent = selectDefaultAgent(agents, request)
  const provider = selectDefaultProvider(providers)

  const schedule = await api.post<ScheduleDraftResponse>('/automation/jobs/draft', {
    provider: provider?.provider ?? '',
    request: request.trim(),
  })

  return {
    name: schedule.name,
    description: schedule.description,
    trigger_type: schedule.trigger_type,
    cron_expr: schedule.cron_expr,
    interval_seconds: schedule.interval_seconds,
    run_at: schedule.run_at,
    webhook_method: schedule.webhook_method,
    webhook_response_mode: schedule.webhook_response_mode,
    execution_target: 'cloud',
    prompt: schedule.prompt,
    agent_slug: selectedAgent?.slug,
    provider_setting_id: provider?.id,
  }
}

// describeDraftTrigger is describeTrigger's counterpart for a not-yet-saved
// JobDraft - a draft's trigger_type is literally 'webhook' (unlike a saved
// job, which normalizes to trigger_type "" with webhook_token as the real
// signal - see describeTrigger below), so this doesn't need that check.
export function describeDraftTrigger(draft: JobDraft): string {
  switch (draft.trigger_type) {
    case 'cron': return draft.cron_expr ? `cron ${draft.cron_expr}` : 'cron'
    case 'interval': return draft.interval_seconds ? `every ${draft.interval_seconds}s` : 'interval'
    case 'once': return draft.run_at ? `once at ${new Date(draft.run_at).toLocaleString()}` : 'once'
    case 'webhook': return `webhook (${draft.webhook_method || 'POST'})`
    default: return draft.trigger_type ?? ''
  }
}

export function describeTrigger(job: Job): string {
  // A saved webhook trigger normalizes to trigger_type "" server-side (see
  // normalizeJobTrigger in seshat-server) - webhook_token presence is the
  // actual signal, checked before the switch below.
  if (job.webhook_token) return `webhook (${job.webhook_method || 'POST'})`
  switch (job.trigger_type) {
    case 'cron': return job.cron_expr ? `cron ${job.cron_expr}` : 'cron'
    case 'interval': return job.interval_seconds ? `every ${job.interval_seconds}s` : 'interval'
    case 'once': return job.run_at ? `once at ${new Date(job.run_at).toLocaleString()}` : 'once'
    case 'webhook': return 'webhook'
    default: return job.trigger_type
  }
}

