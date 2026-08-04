import { useEffect, useState } from 'react'
import { CloudStorage, LinkCloud, Unlink, Refresh } from '@icon-park/react'
import { api, ApiError } from '@/api/client'

type AutomationStatus = {
  connected: boolean
  server_url?: string
  device_id?: string
  device_name?: string
  connected_by_user_id?: string
  connected_at?: string
}

type AutomationRun = {
  id: string
  job_id: string
  status: string
}

type SystemStatus = { mode: 'standalone' | 'connected'; server_url?: string }

const RUN_STATUS_LABEL: Record<string, string> = {
  queued: 'Queued',
  claimed: 'Claimed',
  running: 'Running',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
}

type CloudAutomationViewProps = {
  embedded?: boolean
}

export function CloudAutomationView({ embedded = false }: CloudAutomationViewProps) {
  const [status, setStatus] = useState<AutomationStatus | null>(null)
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null)
  const [runs, setRuns] = useState<AutomationRun[]>([])
  const [loading, setLoading] = useState(true)
  const [serverURL, setServerURL] = useState('')
  const [deviceToken, setDeviceToken] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [registering, setRegistering] = useState(false)
  const [showManualForm, setShowManualForm] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function loadStatus() {
    try {
      const result = await api.get<AutomationStatus>('/automation/status')
      setStatus(result)
      if (result.connected) {
        const runsResult = await api.get<{ runs: AutomationRun[] }>('/automation/runs')
        setRuns(runsResult.runs ?? [])
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load automation status.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadStatus()
    api.get<SystemStatus>('/system/status').then(setSystemStatus).catch(() => setSystemStatus(null))
  }, [])

  // This machine is already logged into its organization's Seshat Server,
  // so one click registers it as a device using that existing session, no
  // manual server_url/device_token copy-paste required.
  async function handleRegisterDevice() {
    setRegistering(true)
    setError(null)
    try {
      await api.post('/automation/register-device', {})
      await loadStatus()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to register this device.')
    } finally {
      setRegistering(false)
    }
  }

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault()
    setConnecting(true)
    setError(null)
    try {
      await api.post('/automation/connect', { server_url: serverURL, device_token: deviceToken })
      setDeviceToken('')
      await loadStatus()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to connect.')
    } finally {
      setConnecting(false)
    }
  }

  async function handleDisconnect() {
    setError(null)
    try {
      await api.delete('/automation/disconnect')
      await loadStatus()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to disconnect.')
    }
  }

  return (
    <div className="sv-view">
      {!embedded && <header className="sv-view-header">
        <div className="sv-header-info">
          <h1>Cloud Automation</h1>
          <p>
            Scheduled jobs run exclusively through Seshat Server now. This machine only executes what it's
            assigned — creating, editing and triggering jobs happens in Seshat Console.
          </p>
        </div>
      </header>}

      {error && (
        <div className="sv-toggle-row" style={{ borderColor: 'var(--color-error)', marginBottom: 20 }}>
          <div className="sv-toggle-info">
            <div className="sv-setting-desc" style={{ color: 'var(--color-error)' }}>{error}</div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="sv-setting-desc">Loading…</div>
      ) : status?.connected ? (
        <div className="sv-grid">
          <div className="sv-card">
            <div className="sv-card-head">
              <div className="sv-card-brand">
                <div className="sv-brand-icon"><CloudStorage theme="outline" size={16} /></div>
                <div>
                  <div className="sv-brand-name">{status.device_name || 'This device'}</div>
                  <div className="sv-brand-sub">{status.server_url}</div>
                </div>
              </div>
            </div>
            <div className="sv-card-body">
              <div className="sv-toggle-row">
                <div className="sv-toggle-info">
                  <div>
                    <div className="sv-setting-label">Device ID</div>
                    <div className="sv-setting-desc">{status.device_id}</div>
                  </div>
                </div>
              </div>
              <div className="sv-toggle-row">
                <div className="sv-toggle-info">
                  <div>
                    <div className="sv-setting-label">Connected since</div>
                    <div className="sv-setting-desc">
                      {status.connected_at ? new Date(status.connected_at).toLocaleString() : '—'}
                    </div>
                  </div>
                </div>
              </div>
              <a
                className="snav-footer-btn"
                href={status.server_url?.replace(/:8081$/, ':3000') ?? '#'}
                target="_blank"
                rel="noreferrer"
                style={{ justifyContent: 'center', textDecoration: 'none' }}
              >
                <LinkCloud theme="outline" size={13} />
                Open Seshat Console
              </a>
              <button className="sv-danger-btn" onClick={() => void handleDisconnect()}>
                <Unlink theme="outline" size={13} />
                Disconnect
              </button>
            </div>
          </div>

          <div className="sv-card">
            <div className="sv-card-head">
              <div className="sv-card-brand">
                <div className="sv-brand-icon"><Refresh theme="outline" size={16} /></div>
                <div>
                  <div className="sv-brand-name">Recent runs on this device</div>
                  <div className="sv-brand-sub">Read-only — manage jobs in Seshat Console</div>
                </div>
              </div>
            </div>
            <div className="sv-card-body">
              {runs.length === 0 ? (
                <div className="sv-setting-desc">No runs assigned to this device right now.</div>
              ) : (
                runs.map((run) => (
                  <div className="sv-toggle-row" key={run.id}>
                    <div className="sv-toggle-info">
                      <div>
                        <div className="sv-setting-label">{run.job_id}</div>
                        <div className="sv-setting-desc">{RUN_STATUS_LABEL[run.status] ?? run.status}</div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="sv-grid">
          {systemStatus?.mode === 'connected' && !showManualForm ? (
            <div className="sv-card">
              <div className="sv-card-head">
                <div className="sv-card-brand">
                  <div className="sv-brand-icon"><CloudStorage theme="outline" size={16} /></div>
                  <div>
                    <div className="sv-brand-name">Register this device</div>
                    <div className="sv-brand-sub">{systemStatus.server_url}</div>
                  </div>
                </div>
              </div>
              <div className="sv-card-body">
                <div className="sv-setting-desc">
                  You're already signed in to your organization's Seshat Server. One click enrolls this
                  machine so it can run jobs assigned to it. No separate token to copy.
                </div>
                <button className="modal-btn-submit" onClick={() => void handleRegisterDevice()} disabled={registering}>
                  {registering ? 'Registering…' : 'Register this device'}
                </button>
                <button
                  type="button"
                  className="snav-footer-btn"
                  style={{ justifyContent: 'center' }}
                  onClick={() => setShowManualForm(true)}
                >
                  Connect to a different server instead
                </button>
              </div>
            </div>
          ) : (
            <div className="sv-card">
              <div className="sv-card-head">
                <div className="sv-card-brand">
                  <div className="sv-brand-icon"><CloudStorage theme="outline" size={16} /></div>
                  <div>
                    <div className="sv-brand-name">Connect to Seshat Server</div>
                    <div className="sv-brand-sub">Pair this machine to run device-targeted jobs</div>
                  </div>
                </div>
              </div>
              <form className="sv-card-body" onSubmit={(e) => void handleConnect(e)}>
                <div className="sv-field">
                  <label>Server URL</label>
                  <div className="sv-input-box">
                    <input
                      type="url"
                      placeholder="https://cloud.example.com"
                      value={serverURL}
                      onChange={(e) => setServerURL(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <div className="sv-field">
                  <label>Device token</label>
                  <div className="sv-input-box">
                    <input
                      type="password"
                      placeholder="Paste the one-time token shown once"
                      value={deviceToken}
                      onChange={(e) => setDeviceToken(e.target.value)}
                      required
                    />
                  </div>
                  <div className="sv-setting-desc">
                    Create a device in Seshat Console → Devices → Register device, then paste its token here.
                  </div>
                </div>
                <button className="modal-btn-submit" type="submit" disabled={connecting}>
                  {connecting ? 'Connecting…' : 'Connect'}
                </button>
                {systemStatus?.mode === 'connected' && (
                  <button
                    type="button"
                    className="snav-footer-btn"
                    style={{ justifyContent: 'center' }}
                    onClick={() => setShowManualForm(false)}
                  >
                    Back to one-click registration
                  </button>
                )}
              </form>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
