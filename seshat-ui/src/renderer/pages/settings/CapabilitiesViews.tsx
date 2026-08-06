import { useState, useEffect, useCallback } from 'react'
import { Close, Attention, CheckOne } from '@icon-park/react'

// ─── Top-level view ───────────────────────────────────────────────────────────

export function MultimodalView() {
  return (
    <div className="sv-view">
      <header className="sv-view-header" style={{ marginBottom: 28 }}>
        <div className="sv-header-info">
          <h1>Multimodal</h1>
          <p>Image generation and speech-to-text extensions for your agents</p>
        </div>
      </header>

      <MultimodalPanel />
    </div>
  )
}

// ─── Multimodal panel ─────────────────────────────────────────────────────────

function MultimodalPanel() {
  return (
    <>
      <div className="sv-card" style={{ marginBottom: 24 }}>
        <div className="sv-card-head">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div className="sv-card-brand">
              <div>
                <div className="sv-brand-name">Image Generation</div>
                <div className="sv-brand-sub">Generate images directly in conversations</div>
              </div>
            </div>
            <input type="checkbox" />
          </div>
        </div>
        <div className="sv-card-body">
          <div className="sv-toggle-row">
            <div>
              <div className="sv-setting-label">Image Model</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--color-text-muted)', fontSize: 13 }}>
              No available image models, configure a provider first. <Attention size={11} />
            </div>
          </div>
        </div>
      </div>

      <SpeechToTextCard />
    </>
  )
}

type WhisperStatus = {
  supported: boolean
  running: boolean
  port?: number
  activeModelId: string
  downloadedModelIds: string[]
}
type WhisperModelInfo = { id: string; filename: string; label: string; approxSizeBytes: number; description: string }
type WhisperProgress = { phase: 'binary' | 'model'; modelId?: string; receivedBytes: number; totalBytes: number }

function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`
  return `${Math.round(bytes / 1_000_000)} MB`
}

function SpeechToTextCard() {
  const [status, setStatus] = useState<WhisperStatus | null>(null)
  const [models, setModels] = useState<WhisperModelInfo[]>([])
  const [addModelId, setAddModelId] = useState<string>('')
  const [busyModelId, setBusyModelId] = useState<string | null>(null)
  const [settingUp, setSettingUp] = useState(false)
  const [progress, setProgress] = useState<WhisperProgress | null>(null)
  const [serverBusy, setServerBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refreshStatus = useCallback(async () => {
    try {
      setStatus((await window.nexus?.whisper?.status()) ?? null)
    } catch {
      setStatus(null)
    }
  }, [])

  useEffect(() => {
    void refreshStatus()
    window.nexus?.whisper?.models().then(setModels).catch(() => {})
  }, [refreshStatus])

  useEffect(() => {
    return window.nexus?.whisper?.onProgress?.(setProgress)
  }, [])

  const downloadedModels = models.filter((m) => status?.downloadedModelIds.includes(m.id))
  const availableModels = models.filter((m) => !status?.downloadedModelIds.includes(m.id))

  useEffect(() => {
    if (!addModelId && availableModels.length > 0) setAddModelId(availableModels[0].id)
  }, [availableModels, addModelId])

  async function handleInitialSetup() {
    setError(null)
    setSettingUp(true)
    setProgress(null)
    try {
      await window.nexus?.whisper?.downloadDefaults()
      await refreshStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set up local transcription.')
    } finally {
      setSettingUp(false)
      setProgress(null)
    }
  }

  async function handleAddModel() {
    if (!addModelId) return
    setError(null)
    setBusyModelId(addModelId)
    setProgress(null)
    try {
      await window.nexus?.whisper?.downloadModel(addModelId)
      await refreshStatus()
      setAddModelId('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to download this model.')
    } finally {
      setBusyModelId(null)
      setProgress(null)
    }
  }

  async function handleActivate(modelId: string) {
    setError(null)
    setBusyModelId(modelId)
    try {
      await window.nexus?.whisper?.activateModel(modelId)
      await refreshStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to switch models.')
    } finally {
      setBusyModelId(null)
    }
  }

  async function handleDeleteModel(modelId: string) {
    setError(null)
    setBusyModelId(modelId)
    try {
      await window.nexus?.whisper?.deleteModel(modelId)
      await refreshStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete this model.')
    } finally {
      setBusyModelId(null)
    }
  }

  async function handleEnable() {
    setError(null)
    setServerBusy(true)
    try {
      await window.nexus?.whisper?.enable()
      await refreshStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start local transcription.')
    } finally {
      setServerBusy(false)
    }
  }

  async function handleDisable() {
    setError(null)
    setServerBusy(true)
    try {
      await window.nexus?.whisper?.disable()
      await refreshStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to stop local transcription.')
    } finally {
      setServerBusy(false)
    }
  }

  const progressPercent = progress && progress.totalBytes > 0
    ? Math.round((progress.receivedBytes / progress.totalBytes) * 100)
    : null
  const hasModels = (status?.downloadedModelIds.length ?? 0) > 0
  const busy = settingUp || busyModelId !== null

  return (
    <div className="sv-card">
      <div className="sv-card-head">
        <div className="sv-card-brand">
          <div>
            <div className="sv-brand-name">Speech to Text</div>
            <div className="sv-brand-sub">Voice input transcription for the mic button in chat</div>
          </div>
        </div>
      </div>
      <div className="sv-card-body">
        <div className="sv-toggle-row">
          <div>
            <div className="sv-setting-label">Local (whisper.cpp)</div>
            <div className="sv-setting-desc">
              {status?.supported === false
                ? "Not available on macOS yet: whisper.cpp doesn't publish a prebuilt server binary for it."
                : 'Runs on this machine, no API key needed. Falls back to your configured OpenAI provider when off.'}
            </div>
          </div>
          {status && status.supported !== false && hasModels && (
            status.running ? (
              <button className="sv-danger-btn" onClick={() => void handleDisable()} disabled={serverBusy}>
                {serverBusy ? 'Stopping…' : 'Disable'}
              </button>
            ) : (
              <button className="modal-btn-submit" onClick={() => void handleEnable()} disabled={serverBusy || busy}>
                {serverBusy ? 'Starting…' : 'Enable'}
              </button>
            )
          )}
        </div>

        {status?.supported !== false && !hasModels && (
          <button
            className="modal-btn-submit"
            style={{ marginTop: 12 }}
            onClick={() => void handleInitialSetup()}
            disabled={settingUp}
          >
            {settingUp ? 'Downloading…' : 'Download & Enable (Tiny + Small)'}
          </button>
        )}

        {status?.supported !== false && hasModels && (
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)' }}>Downloaded models</label>
            {downloadedModels.map((m) => {
              const isActive = status?.activeModelId === m.id
              const isBusy = busyModelId === m.id
              return (
                <div key={m.id} className="sv-toggle-row" style={{ padding: '8px 0' }}>
                  <div>
                    <div className="sv-setting-label">
                      {m.label} <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>({formatBytes(m.approxSizeBytes)})</span>
                      {isActive && <span style={{ marginLeft: 8, color: 'var(--color-success)', fontSize: 12 }}><CheckOne size={10} /> Active</span>}
                    </div>
                    <div className="sv-setting-desc">{m.description}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {!isActive && (
                      <button className="caps-mini-btn" onClick={() => void handleActivate(m.id)} disabled={isBusy}>
                        {isBusy ? 'Switching…' : 'Use this model'}
                      </button>
                    )}
                    {!isActive && (
                      <button className="caps-mini-btn danger" title="Delete" onClick={() => void handleDeleteModel(m.id)} disabled={isBusy}>
                        <Close size={11} />
                      </button>
                    )}
                  </div>
                </div>
              )
            })}

            {availableModels.length > 0 && (
              <div className="sv-field" style={{ marginTop: 8 }}>
                <label>Add another model</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div className="sv-select-static" style={{ flex: 1 }}>
                    <select
                      value={addModelId}
                      onChange={(e) => setAddModelId(e.target.value)}
                      disabled={busy}
                      style={{ width: '100%', background: 'transparent', border: 'none', color: 'inherit', font: 'inherit' }}
                    >
                      {availableModels.map((m) => (
                        <option key={m.id} value={m.id}>{m.label} ({formatBytes(m.approxSizeBytes)})</option>
                      ))}
                    </select>
                  </div>
                  <button className="caps-mini-btn" onClick={() => void handleAddModel()} disabled={busy || !addModelId}>
                    {busyModelId === addModelId ? 'Downloading…' : 'Download'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {(settingUp || busyModelId) && (
          <div className="sv-setting-desc" style={{ marginTop: 8 }}>
            {progress
              ? `${progress.phase === 'binary' ? 'Downloading whisper.cpp' : `Downloading ${models.find((m) => m.id === progress.modelId)?.label ?? 'model'}`}${progressPercent !== null ? `: ${progressPercent}%` : '…'}`
              : 'Working…'}
          </div>
        )}
        {status?.running && !settingUp && !busyModelId && (
          <div className="sv-setting-desc" style={{ marginTop: 8, color: 'var(--color-success)' }}>
            <CheckOne size={11} /> Running locally on port {status.port}.
          </div>
        )}
        {error && (
          <div className="sv-setting-desc" style={{ marginTop: 8, color: 'var(--color-error)' }}>
            {error}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── CSS ──────────────────────────────────────────────────────────────────────

export const MULTIMODAL_CSS = `
.caps-mini-btn { background: none; border: none; color: var(--color-text-muted); cursor: pointer; display: flex; padding: 3px; border-radius: 3px; }
.caps-mini-btn:hover { color: var(--color-text); background: var(--color-hover); }
.caps-mini-btn.danger:hover { color: var(--color-error); background: rgba(var(--color-error-rgb),0.08); }
`
