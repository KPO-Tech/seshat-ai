import { useState } from 'react'
import { CheckOne, Close, LoadingOne, Broadcast } from '@icon-park/react'
import { api, ApiError } from '@/api/client'

type DiagnosticStep = {
  name: string
  status: 'pass' | 'fail' | 'skipped'
  duration_ms: number
  detail?: string
  suggestion?: string
  act_on?: 'network_admin' | 'it_security' | 'support'
}

type DiagnosticResult = {
  name: string
  target: string
  steps: DiagnosticStep[]
  ok: boolean
}

const STEP_LABEL: Record<string, string> = {
  dns: 'DNS resolution',
  tcp: 'TCP connection',
  tls: 'TLS handshake',
  http: 'HTTP request',
}

const ACT_ON_LABEL: Record<string, string> = {
  network_admin: 'Your network administrator',
  it_security: 'Your IT/security team',
  support: 'Seshat support',
}

// NetworkDiagnosticsCard runs a live, on-demand connectivity probe against
// this build's Seshat Server target (see internal/netdiag, seshat-backend) -
// the desktop half of docs/helps/audit-2026-08-29-openwork-den-comparison.md
// § 6. Purely self-service troubleshooting: nothing here changes any
// setting, it only reports which layer (DNS/TCP/TLS/HTTP) is failing so an
// enterprise IT admin doesn't have to guess.
export function NetworkDiagnosticsCard() {
  const [result, setResult] = useState<DiagnosticResult | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function runDiagnostics() {
    setRunning(true)
    setError(null)
    try {
      const data = await api.get<DiagnosticResult>('/system/network-diagnostics')
      setResult(data)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to run network diagnostics.')
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="sv-card">
      <div className="sv-card-head">
        <div className="sv-card-brand">
          <div className="sv-brand-icon"><Broadcast size={16} /></div>
          <div>
            <div className="sv-brand-name">Network diagnostics</div>
            <div className="sv-brand-sub">Check this device's connectivity to Seshat Server</div>
          </div>
        </div>
        <button type="button" className="sv-inline-action" onClick={() => void runDiagnostics()} disabled={running}>
          {running ? <LoadingOne size={14} className="netdiag-spin" /> : null}
          {running ? 'Running…' : 'Run diagnostics'}
        </button>
      </div>
      <div className="sv-card-body">
        {error && <div className="netdiag-error">{error}</div>}
        {!result && !error && !running && (
          <div className="sv-setting-desc">Runs a DNS → TCP → TLS → HTTP check against the Seshat Server this device talks to.</div>
        )}
        {result?.steps.length === 0 && (
          <div className="sv-setting-desc">No Seshat Server target is configured for this build - nothing to check.</div>
        )}
        {result && result.steps.length > 0 && (
          <div className="netdiag-steps">
            {result.steps.map((step) => (
              <div key={step.name} className={`netdiag-step netdiag-step-${step.status}`}>
                <span className="netdiag-step-icon">
                  {step.status === 'pass' && <CheckOne size={14} theme="filled" />}
                  {step.status === 'fail' && <Close size={14} theme="filled" />}
                  {step.status === 'skipped' && <span className="netdiag-step-dash">—</span>}
                </span>
                <span className="netdiag-step-name">{STEP_LABEL[step.name] ?? step.name}</span>
                {step.status !== 'skipped' && <span className="netdiag-step-duration">{step.duration_ms}ms</span>}
                {step.detail && <span className="netdiag-step-detail">{step.detail}</span>}
                {step.suggestion && (
                  <div className="netdiag-step-suggestion">
                    {step.act_on && <strong>{ACT_ON_LABEL[step.act_on] ?? step.act_on}: </strong>}
                    {step.suggestion}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export const NETWORK_DIAGNOSTICS_CARD_CSS = `
.netdiag-spin { animation: netdiag-spin 1s linear infinite; }
@keyframes netdiag-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
.netdiag-error { color: var(--color-error); font-size: 13px; }
.netdiag-steps { display: flex; flex-direction: column; gap: 10px; }
.netdiag-step {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 6px;
  background: var(--color-surface-alt, rgba(127, 127, 127, 0.06));
  font-size: 13px;
}
.netdiag-step-icon { display: flex; align-items: center; }
.netdiag-step-pass .netdiag-step-icon { color: var(--color-success); }
.netdiag-step-fail .netdiag-step-icon { color: var(--color-error); }
.netdiag-step-dash { color: var(--color-text-muted); }
.netdiag-step-name { font-weight: 600; }
.netdiag-step-duration { color: var(--color-text-muted); font-size: 12px; }
.netdiag-step-detail { color: var(--color-text-muted); font-size: 12px; }
.netdiag-step-suggestion {
  flex-basis: 100%;
  color: var(--color-warning);
  font-size: 12px;
}
`
