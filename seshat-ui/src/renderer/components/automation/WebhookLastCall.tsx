import { useEffect, useState } from 'react'
import { api, ApiError } from '@/api/client'

type Props = { jobId?: string }

type RunSummary = { id: string; queued_at?: string; trigger_payload?: string }

const POLL_INTERVAL_MS = 4000

function timeAgo(iso?: string): string {
  if (!iso) return ''
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  return `${Math.floor(minutes / 60)}h ago`
}

// Passive "did anything actually arrive" view for a job with a webhook
// trigger - the closest equivalent to n8n's "listen for test event," minus
// its separate test/production machinery: the URL is already live once the
// job is saved, so this just polls the job's own run history for the most
// recent run that actually carried a payload. No "send a simulated call"
// button on purpose - the point is seeing what a real caller actually
// sends, which a simulation can't show.
//
// Shared by apps/automation (graph webhook_trigger node) and
// apps/scheduling (graph-less webhook-triggered jobs) - both hit the same
// GET /automation/jobs/:id/runs endpoint, so this needs no per-app variant.
export function WebhookLastCall({ jobId }: Props) {
  const [payload, setPayload] = useState<string | null>(null)
  const [receivedAt, setReceivedAt] = useState<string | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [, setTick] = useState(0)

  useEffect(() => {
    if (!jobId) return
    let cancelled = false

    function poll() {
      api.get<{ runs: RunSummary[] }>(`/automation/jobs/${jobId}/runs?limit=5`)
        .then((res) => {
          if (cancelled) return
          const withPayload = (res.runs ?? []).find((r) => !!r.trigger_payload)
          if (withPayload) {
            setPayload(withPayload.trigger_payload ?? null)
            setReceivedAt(withPayload.queued_at)
          }
          setError(null)
          setTick((t) => t + 1) // keep the "Xs ago" label roughly fresh even with no new run
        })
        .catch((err) => { if (!cancelled) setError(err instanceof ApiError ? err.message : 'Unable to load runs.') })
    }

    poll()
    const interval = window.setInterval(poll, POLL_INTERVAL_MS)
    return () => { cancelled = true; window.clearInterval(interval) }
  }, [jobId])

  if (!jobId) return null

  let pretty = payload
  if (payload) {
    try { pretty = JSON.stringify(JSON.parse(payload), null, 2) } catch { /* not JSON - show as received */ }
  }

  return (
    <div className="gf-field">
      <label className="gf-field-label">Last webhook call</label>
      {error && <div className="gf-field-error">{error}</div>}
      {pretty ? (
        <>
          <pre className="gf-webhook-payload">{pretty}</pre>
          <div className="gf-field-hint">received {timeAgo(receivedAt)}</div>
        </>
      ) : (
        <div className="gf-field-hint">No calls received yet. Call this URL for real (e.g. from the service you're integrating) and it'll show up here.</div>
      )}
    </div>
  )
}
