import type { InspectorPlanStep, Job, Run } from '../api/types'
export function formatRunTime(run: Run): string {
  const raw = run.started_at ?? run.queued_at ?? run.finished_at
  return raw ? new Date(raw).toLocaleString() : 'Not started'
}

export function latestRun(runs: Run[]): Run | null {
  return [...runs].sort((a, b) => {
    const at = new Date(a.started_at ?? a.queued_at ?? a.finished_at ?? 0).getTime()
    const bt = new Date(b.started_at ?? b.queued_at ?? b.finished_at ?? 0).getTime()
    return bt - at
  })[0] ?? null
}

export function readPlanSteps(job: Job): InspectorPlanStep[] {
  const raw =
    job.configuration?.agent_plan ??
    job.configuration?.plan ??
    job.configuration?.tasks ??
    job.configuration?.task_plan

  if (!raw) return []

  let parsed: unknown = raw
  try {
    parsed = JSON.parse(raw)
  } catch {
    parsed = raw
  }

  const list = Array.isArray(parsed)
    ? parsed
    : typeof parsed === 'object' && parsed !== null && Array.isArray((parsed as { items?: unknown }).items)
      ? (parsed as { items: unknown[] }).items
      : []

  return list.flatMap<InspectorPlanStep>((item, index) => {
    if (typeof item === 'string') {
      return [{ id: `${index}-${item}`, title: item, status: 'pending' as const }]
    }
    if (!item || typeof item !== 'object') return []
    const value = item as Record<string, unknown>
    const title = String(value.title ?? value.task ?? value.label ?? '').trim()
    if (!title) return []
    const rawStatus = String(value.status ?? value.state ?? 'pending')
    const status: InspectorPlanStep['status'] =
      rawStatus === 'completed' || rawStatus === 'done' ? 'completed'
        : rawStatus === 'in_progress' || rawStatus === 'running' ? 'in_progress'
          : rawStatus === 'failed' || rawStatus === 'error' ? 'failed'
            : 'pending'
    const detail = typeof value.detail === 'string'
      ? value.detail
      : typeof value.description === 'string'
        ? value.description
        : undefined
    return [{ id: String(value.id ?? `${index}-${title}`), title, status, detail }]
  })
}

