import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router'
import { Close, CheckOne, PreviewOpen, PreviewClose } from '@icon-park/react'
import { api } from '@/api/client'
import { useUIStore } from '@/stores/ui'
import { useCapabilityLink } from '@/components/settings/CapabilityLink'

// ─── Top-level view ───────────────────────────────────────────────────────────

export function MultimodalView() {
  return (
    <div className="sv-view">
      <style>{MULTIMODAL_CSS}</style>
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
      <ImageGenerationCard />
      <SpeechToTextCard />
    </>
  )
}

// ─── Shared "Source" picker: configured-provider candidates + Custom ──────────

const CUSTOM_SOURCE = '__custom__'

// Backs both Image Generation's and Speech to Text's "Custom" mode - a
// standalone key not tied to any AI Providers entry, stored the same way
// Settings > Environment stores its other credentials (see
// main/env-vars-manager.ts's `hidden` entries) but managed from here
// instead, since AI Providers now auto-links a compatible provider's key
// first and this is only needed when the user wants a key that ISN'T also
// a general chat provider.
function CustomCapabilityKey({ capability }: { capability: 'image' | 'audio' }) {
  const { theme } = useUIStore()
  const [provider, setProvider] = useState<'openai' | 'gemini'>('openai')
  const envKey = provider === 'openai' ? 'OPENAI_API_KEY' : 'GOOGLE_API_KEY'
  const [status, setStatus] = useState<Record<string, boolean>>({})
  const [value, setValue] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setStatus((await window.nexus?.envVars?.status()) ?? {})
    } catch {
      // keep whatever we had
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  async function handleSave() {
    if (!value.trim()) return
    setSaving(true)
    setError(null)
    try {
      await window.nexus?.envVars?.set(envKey, value.trim())
      await window.nexus?.envVars?.restartBackend()
      setValue('')
      await refresh()
    } catch (e: unknown) {
      setError((e as { message?: string })?.message ?? 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const configured = !!status[envKey]

  return (
    <div className="caps-custom-row">
      {capability === 'image' && (
        <div className="sv-field caps-custom-provider">
          <label>Provider</label>
          <div className="sv-select-static">
            <select
              className="caps-model-select"
              value={provider}
              onChange={(e) => { setProvider(e.target.value as 'openai' | 'gemini'); setValue('') }}
              style={{ width: '100%', background: 'transparent', border: 'none', color: 'inherit', font: 'inherit', colorScheme: theme }}
            >
              <option value="openai">OpenAI</option>
              <option value="gemini">Gemini</option>
            </select>
          </div>
        </div>
      )}
      <div className="sv-field caps-custom-key">
        <label>
          API Key
          {configured && !value && <span className="caps-key-hint"> (configured — leave blank to keep)</span>}
        </label>
        <div className="caps-key-wrap">
          <input
            type={showKey ? 'text' : 'password'}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={configured ? '••••••••••••' : 'sk-…'}
            autoComplete="new-password"
          />
          <button className="caps-eye" type="button" onClick={() => setShowKey((v) => !v)} tabIndex={-1}>
            {showKey ? <PreviewClose size={12} /> : <PreviewOpen size={12} />}
          </button>
        </div>
      </div>
      <button
        type="button"
        className="sv-inline-action caps-custom-save"
        onClick={() => void handleSave()}
        disabled={saving || !value.trim()}
      >
        {saving ? 'Saving…' : 'Save'}
      </button>
      {error && <div className="caps-error">{error}</div>}
    </div>
  )
}

// ─── Image Generation card ─────────────────────────────────────────────────────

function ImageGenerationCard() {
  const navigate = useNavigate()
  const { theme } = useUIStore()
  const { status: linkStatus, link: linkCapability } = useCapabilityLink('image')
  const candidates = linkStatus?.candidates ?? []

  const [source, setSource] = useState<string>(CUSTOM_SOURCE)
  const [sourceInitialized, setSourceInitialized] = useState(false)
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [linking, setLinking] = useState(false)
  const [linkError, setLinkError] = useState<string | null>(null)

  const refreshStatus = useCallback(async () => {
    try {
      const res = await api.get<{ image_generation_configured: boolean }>('/system/status')
      setConfigured(res.image_generation_configured)
    } catch {
      setConfigured(null)
    }
  }, [])

  useEffect(() => { void refreshStatus() }, [refreshStatus])

  // Once the candidate list has loaded, figure out which "Source" entry the
  // current link (if any) corresponds to - same pattern as Knowledge's
  // EmbedderConfigCard. Runs once; the user's own selection takes over.
  useEffect(() => {
    if (sourceInitialized || !linkStatus) return
    if (linkStatus.linked_provider_id && candidates.some((c) => c.id === linkStatus.linked_provider_id)) {
      setSource(linkStatus.linked_provider_id)
    } else {
      setSource(CUSTOM_SOURCE)
    }
    setSourceInitialized(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkStatus, sourceInitialized])

  async function handleSourceChange(value: string) {
    setSource(value)
    if (value === CUSTOM_SOURCE) return
    setLinking(true)
    setLinkError(null)
    try {
      await linkCapability(value)
      await refreshStatus()
    } catch (e: unknown) {
      setLinkError((e as { message?: string })?.message ?? 'Failed to link')
    } finally {
      setLinking(false)
    }
  }

  const isCustomSource = source === CUSTOM_SOURCE
  const activeCandidate = candidates.find((c) => c.id === source)

  return (
    <div className="sv-card" style={{ marginBottom: 24 }}>
      <div className="sv-card-head">
        <div className="sv-card-brand">
          <div>
            <div className="sv-brand-name">Image Generation</div>
            <div className="sv-brand-sub">Generate images directly in conversations</div>
          </div>
        </div>
        {configured !== null && (
          configured
            ? <span className="caps-status-badge caps-status-ok"><CheckOne size={10} /> Configured</span>
            : <span className="caps-status-badge caps-status-warn">Not configured</span>
        )}
      </div>
      <div className="sv-card-body">
        <div className="sv-field">
          <label>Source</label>
          <div className="sv-select-static">
            <select
              className="caps-model-select"
              value={source}
              onChange={(e) => void handleSourceChange(e.target.value)}
              disabled={linking}
              style={{ width: '100%', background: 'transparent', border: 'none', color: 'inherit', font: 'inherit', colorScheme: theme }}
            >
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
              <option value={CUSTOM_SOURCE}>Custom</option>
            </select>
          </div>
        </div>

        {!isCustomSource && activeCandidate && (
          <div className="caps-inherit-note">
            <CheckOne size={11} /> Using the API key already configured for <strong>{activeCandidate.name}</strong> in AI Providers — no key needed here.
          </div>
        )}
        {isCustomSource && <CustomCapabilityKey capability="image" />}
        {candidates.length === 0 && (
          <div className="sv-setting-desc" style={{ marginTop: 8 }}>
            No OpenAI or Gemini provider configured yet.{' '}
            <button type="button" className="sv-inline-action" onClick={() => navigate('/settings?tab=providers')}>
              AI Providers
            </button>
          </div>
        )}
        {linkError && <div className="caps-error">{linkError}</div>}
      </div>
    </div>
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
  const { theme } = useUIStore()
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
                : 'Runs on this machine, no API key needed. Falls back to the cloud source below when off.'}
            </div>
          </div>
          {status && status.supported !== false && hasModels && (
            status.running ? (
              <button className="caps-danger-btn" onClick={() => void handleDisable()} disabled={serverBusy}>
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
                <div key={m.id} className="sv-toggle-row" style={{ padding: '8px 12px' }}>
                  <div>
                    <div className="sv-setting-label">
                      {m.label} <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>({formatBytes(m.approxSizeBytes)})</span>
                      {isActive && <span style={{ marginLeft: 8, color: 'var(--color-success)', fontSize: 12 }}><CheckOne size={10} /> Active</span>}
                    </div>
                    <div className="sv-setting-desc">{m.description}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {!isActive && (
                      <button className="sv-inline-action" onClick={() => void handleActivate(m.id)} disabled={isBusy}>
                        {isBusy ? 'Switching…' : 'Use this model'}
                      </button>
                    )}
                    {!isActive && (
                      <button className="caps-icon-btn" aria-label="Delete" onClick={() => void handleDeleteModel(m.id)} disabled={isBusy}>
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
                      className="caps-model-select"
                      value={addModelId}
                      onChange={(e) => setAddModelId(e.target.value)}
                      disabled={busy}
                      style={{ width: '100%', background: 'transparent', border: 'none', color: 'inherit', font: 'inherit', colorScheme: theme }}
                    >
                      {availableModels.map((m) => (
                        <option key={m.id} value={m.id}>{m.label} ({formatBytes(m.approxSizeBytes)})</option>
                      ))}
                    </select>
                  </div>
                  <button className="sv-inline-action" onClick={() => void handleAddModel()} disabled={busy || !addModelId}>
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

      <div className="caps-divider" />

      <AudioCloudSource />
    </div>
  )
}

// Cloud fallback used when the local whisper.cpp server is off (or for
// text-to-speech, which has no local option at all) - same Source pattern
// as Image Generation, but only ever offers OpenAI as a candidate: it's the
// only audio-capable vendor this app has integration code for (see
// seshat-backend's internal/settings/capabilities.go).
function AudioCloudSource() {
  const navigate = useNavigate()
  const { theme } = useUIStore()
  const { status: linkStatus, link: linkCapability } = useCapabilityLink('audio')
  const candidates = linkStatus?.candidates ?? []

  const [source, setSource] = useState<string>(CUSTOM_SOURCE)
  const [sourceInitialized, setSourceInitialized] = useState(false)
  const [linking, setLinking] = useState(false)
  const [linkError, setLinkError] = useState<string | null>(null)

  useEffect(() => {
    if (sourceInitialized || !linkStatus) return
    if (linkStatus.linked_provider_id && candidates.some((c) => c.id === linkStatus.linked_provider_id)) {
      setSource(linkStatus.linked_provider_id)
    } else {
      setSource(CUSTOM_SOURCE)
    }
    setSourceInitialized(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkStatus, sourceInitialized])

  async function handleSourceChange(value: string) {
    setSource(value)
    if (value === CUSTOM_SOURCE) return
    setLinking(true)
    setLinkError(null)
    try {
      await linkCapability(value)
    } catch (e: unknown) {
      setLinkError((e as { message?: string })?.message ?? 'Failed to link')
    } finally {
      setLinking(false)
    }
  }

  const isCustomSource = source === CUSTOM_SOURCE
  const activeCandidate = candidates.find((c) => c.id === source)

  return (
    <div className="sv-card-body">
      <div className="sv-setting-label" style={{ marginBottom: 8 }}>Cloud source</div>
      <div className="sv-field">
        <label>Source</label>
        <div className="sv-select-static">
          <select
            className="caps-model-select"
            value={source}
            onChange={(e) => void handleSourceChange(e.target.value)}
            disabled={linking}
            style={{ width: '100%', background: 'transparent', border: 'none', color: 'inherit', font: 'inherit', colorScheme: theme }}
          >
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
            <option value={CUSTOM_SOURCE}>Custom</option>
          </select>
        </div>
      </div>

      {!isCustomSource && activeCandidate && (
        <div className="caps-inherit-note">
          <CheckOne size={11} /> Using the API key already configured for <strong>{activeCandidate.name}</strong> in AI Providers — no key needed here.
        </div>
      )}
      {isCustomSource && <CustomCapabilityKey capability="audio" />}
      {candidates.length === 0 && (
        <div className="sv-setting-desc" style={{ marginTop: 8 }}>
          No OpenAI provider configured yet.{' '}
          <button type="button" className="sv-inline-action" onClick={() => navigate('/settings?tab=providers')}>
            AI Providers
          </button>
        </div>
      )}
      {linkError && <div className="caps-error">{linkError}</div>}
    </div>
  )
}

// ─── CSS ──────────────────────────────────────────────────────────────────────

export const MULTIMODAL_CSS = `
.caps-icon-btn {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: 1px solid var(--color-border);
  background: var(--color-bg);
  color: var(--color-text-muted);
  border-radius: 7px;
  cursor: pointer;
}
.caps-icon-btn:hover:not(:disabled) { border-color: var(--color-error); color: var(--color-error); background: rgba(var(--color-error-rgb, 201, 107, 92), 0.08); }
.caps-icon-btn:disabled { opacity: 0.5; cursor: default; }

.caps-danger-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 7px 16px;
  border: 1px solid var(--color-error);
  color: var(--color-error);
  background: transparent;
  border-radius: 8px;
  font-size: var(--font-size-xs);
  font-weight: 700;
  cursor: pointer;
  flex-shrink: 0;
}
.caps-danger-btn:hover:not(:disabled) { background: rgba(var(--color-error-rgb, 201, 107, 92), 0.08); }
.caps-danger-btn:disabled { opacity: 0.6; cursor: default; }

/* The closed box is themed via sv-select-static/the select's own inline style,
   but the dropdown popup itself is native OS/Chromium chrome and ignores most
   CSS - color-scheme (set inline per current theme) plus explicit option
   colors are the only two levers that actually reach it. */
.caps-model-select option {
  background-color: var(--color-surface);
  color: var(--color-text);
}

.caps-status-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 9px;
  border-radius: 999px;
  font-size: var(--font-size-2xs);
  font-weight: 700;
  flex-shrink: 0;
}
.caps-status-ok { color: var(--color-success, #6FAF7B); background: rgba(111,175,123,0.12); }
.caps-status-warn { color: var(--color-text-muted); background: var(--color-surface); border: 1px solid var(--color-border); }

.caps-inherit-note {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(111,175,123,0.08);
  border: 1px dashed rgba(111,175,123,0.35);
  color: var(--color-text-secondary);
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 11px;
  margin-top: 10px;
}
.caps-inherit-note strong { color: var(--color-text); }

.caps-error {
  background: rgba(201,107,92,0.1);
  border: 1px solid rgba(201,107,92,0.3);
  color: var(--color-error);
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 11px;
  margin-top: 8px;
}

.caps-custom-row {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  margin-top: 10px;
  flex-wrap: wrap;
}
.caps-custom-provider { flex: 0 0 130px; }
.caps-custom-key { flex: 1 1 220px; }
.caps-custom-save { flex-shrink: 0; }

.caps-key-hint { font-weight: 400; color: var(--color-text-muted); }
.caps-key-wrap { position: relative; }
.caps-key-wrap input {
  width: 100%;
  background: var(--color-surface);
  border: 1.5px solid var(--color-border);
  padding: 7px 27px 7px 10px;
  border-radius: 8px;
  color: var(--color-text);
  font-size: var(--font-size-sm);
  outline: none;
  font-family: inherit;
  box-sizing: border-box;
}
.caps-key-wrap input:focus { border-color: var(--color-primary); }
.caps-eye {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  color: var(--color-text-muted);
  cursor: pointer;
  padding: 2px;
  display: flex;
  align-items: center;
}
.caps-eye:hover { color: var(--color-text); }

.caps-divider {
  height: 1px;
  background: var(--color-border);
  margin: 0;
}
`
