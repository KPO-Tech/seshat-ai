import { api } from '@/api/client'

type NodeTraceEntry = { id: string; input?: Record<string, unknown>[]; output?: Record<string, unknown>[] }
type RunSummary = { id: string; node_trace?: NodeTraceEntry[] }

// Looks up the most recent real run's recorded trace for one exact node -
// see JobRun.NodeTrace (Tier 1.3) - so a field wanting sample data (the
// expression preview's $json, Tier 2.2) or a pin wanting to freeze real
// output (Tier 2.3) can default to genuine historical data instead of
// something made up. One-shot, not polled (unlike WebhookLastCall's 4s
// interval - callers use this to seed an editable value once, not to stay
// live). Silently falls back to null on any failure - a missing/failed
// history lookup shouldn't block the caller, it should just leave them
// with nothing to seed from.
export async function fetchLatestNodeTrace(jobId: string, nodeId: string): Promise<NodeTraceEntry | null> {
  try {
    const res = await api.get<{ runs: RunSummary[] }>(`/automation/jobs/${jobId}/runs?limit=1`)
    return res.runs?.[0]?.node_trace?.find((n) => n.id === nodeId) ?? null
  } catch {
    return null
  }
}
