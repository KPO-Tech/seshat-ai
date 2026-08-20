import { useEffect, useState } from 'react'
import {
  Plus, Down, Right, Delete, Sync, LinkCloud, Shield, Crown,
} from '@icon-park/react'
import { ProviderIcon } from '@/components/ui/ProviderIcon'
import { WindowCloseIcon } from '@/components/ui/WindowControlIcon'
import { useProvidersStore } from '@/stores/providers'
import {
  useProviders,
  fetchProviderModels,
  syncProviderModels,
  addProviderSetting,
  deleteProviderSetting,
  addCustomModel,
  setProviderDefault,
  startProviderOAuth,
  pollProviderOAuth,
  disconnectProviderOAuth,
} from '@/hooks/useProviders'
import type { ProviderSetting, ProviderModel, OAuthChallenge } from '@/api/types'

const SUPPORTED_PROVIDERS = [
  { id: 'anthropic', name: 'Anthropic', desc: 'Claude models — coding, reasoning, agents' },
  { id: 'openai', name: 'OpenAI', desc: 'GPT-5.5, GPT-5.4-mini — pay-per-use API key' },
  { id: 'codex', name: 'Codex', desc: 'codex-mini-latest — ChatGPT Pro subscription, OAuth' },
  { id: 'mistral', name: 'Mistral AI', desc: 'Open & efficient European models' },
  { id: 'gemini', name: 'Google Gemini', desc: 'Gemini 2.0 — massive context windows' },
  { id: 'z-ai', name: 'Z.ai', desc: 'GLM models — GLM-4.5, GLM-4.7, GLM-5.1' },
  { id: 'minimax', name: 'MiniMax', desc: 'M2 series — agentic, long-context' },
  { id: 'openrouter', name: 'OpenRouter', desc: '300+ models through one API key' },
  { id: 'ollama', name: 'Ollama', desc: 'Run models locally on your machine' },
  { id: 'kimi', name: 'Kimi (Moonshot AI)', desc: 'Kimi K3, K2.7 Code — long-context agentic coding' },
  { id: 'deepseek', name: 'DeepSeek', desc: 'DeepSeek Chat, Reasoner — direct API' },
  { id: 'opencode', name: 'OpenCode Zen', desc: 'Curated gateway — Claude, Codex, GLM models' },
  { id: 'workers-ai', name: 'Cloudflare Workers AI', desc: 'Edge inference — needs your account-specific URL' },
]

const PROVIDER_DEFAULT_URLS: Record<string, string> = {
  anthropic: 'https://api.anthropic.com',
  openai: 'https://api.openai.com/v1',
  codex: 'https://chatgpt.com/backend-api/codex',
  mistral: 'https://api.mistral.ai/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta',
  'z-ai': 'https://api.z.ai/api/paas/v4',
  minimax: 'https://api.minimax.chat/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  ollama: 'http://localhost:11434',
  kimi: 'https://api.moonshot.ai/v1',
  deepseek: 'https://api.deepseek.com/v1',
  opencode: 'https://opencode.ai/zen/v1',
  'workers-ai': 'https://workers.ai/v1/chat',
}

const PROVIDER_DISPLAY_ORDER = ['anthropic', 'openai', 'codex', 'mistral', 'gemini', 'z-ai', 'minimax', 'openrouter', 'ollama', 'kimi', 'deepseek', 'opencode', 'workers-ai']

const OAUTH_ONLY_PROVIDERS = new Set(['codex'])

type ProviderConnectionTone = 'connected' | 'pending' | 'error' | 'disconnected'

type ProviderConnectionState = {
  connected: boolean
  label: string
  tone: ProviderConnectionTone
}

function sortProviders(providers: ProviderSetting[]): ProviderSetting[] {
  return [...providers].sort((a, b) => {
    const ai = PROVIDER_DISPLAY_ORDER.indexOf(a.provider)
    const bi = PROVIDER_DISPLAY_ORDER.indexOf(b.provider)
    if (ai === -1 && bi === -1) return a.name.localeCompare(b.name)
    if (ai === -1) return 1
    if (bi === -1) return -1
    return ai - bi
  })
}

function formatTokens(n: number): string {
  if (!n) return '—'
  if (n >= 1000000) return `${(n / 1000000).toFixed(n % 1000000 === 0 ? 0 : 1)}M tokens`
  if (n >= 1000) return `${Math.round(n / 1000)}K tokens`
  return `${n} tokens`
}

// In connected mode, org/platform-sourced entries carry a synthetic id
// ("org:<provider>" / "platform:<provider>") from internal/cloudsettings —
// derived here rather than added as a response field, since the prefix
// already fully determines it.
function getProviderOrigin(id: string): 'organization' | 'platform' | 'personal' {
  if (id.startsWith('org:')) return 'organization'
  if (id.startsWith('platform:')) return 'platform'
  return 'personal'
}

function getProviderConnectionState(setting: ProviderSetting): ProviderConnectionState {
  if (setting.provider === 'ollama') {
    return { connected: true, label: 'Connected', tone: 'connected' }
  }

  if (setting.auth_kind === 'oauth') {
    switch (setting.connection_status) {
      case 'connected':
        return { connected: true, label: 'Connected', tone: 'connected' }
      case 'pending':
        return { connected: false, label: 'Pending', tone: 'pending' }
      case 'error':
        return { connected: false, label: 'Attention needed', tone: 'error' }
      default:
        return { connected: false, label: 'Not connected', tone: 'disconnected' }
    }
  }

  if (setting.has_api_key) {
    return { connected: true, label: 'Connected', tone: 'connected' }
  }

  return { connected: false, label: 'Not configured', tone: 'disconnected' }
}

export function ProvidersView() {
  const { providers, removeProvider, setDefault } = useProvidersStore()
  const { refetch } = useProviders()

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [models, setModels] = useState<Record<string, ProviderModel[]>>({})
  const [loadingModels, setLoadingModels] = useState<Record<string, boolean>>({})
  const [syncingModels, setSyncingModels] = useState<Record<string, boolean>>({})
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [settingDefaultId, setSettingDefaultId] = useState<string | null>(null)
  const [showAddProvider, setShowAddProvider] = useState(false)
  const [addModelFor, setAddModelFor] = useState<string | null>(null)

  const sorted = sortProviders(providers)

  async function handleExpand(setting: ProviderSetting) {
    const next = expandedId === setting.id ? null : setting.id
    setExpandedId(next)
    setSelectedKey(null)
    if (next && !models[next]) {
      setLoadingModels((s) => ({ ...s, [next]: true }))
      try {
        const fetched = await fetchProviderModels(next)
        setModels((s) => ({ ...s, [next]: fetched }))
      } catch {
        // silently handle
      } finally {
        setLoadingModels((s) => ({ ...s, [next]: false }))
      }
    }
  }

  async function handleSync(settingId: string) {
    setSyncingModels((s) => ({ ...s, [settingId]: true }))
    try {
      const fetched = await syncProviderModels(settingId)
      setModels((s) => ({ ...s, [settingId]: fetched }))
    } catch {
      // silently handle
    } finally {
      setSyncingModels((s) => ({ ...s, [settingId]: false }))
    }
  }

  async function handleDelete(id: string) {
    if (deletingId) return
    setDeletingId(id)
    try {
      await deleteProviderSetting(id)
      removeProvider(id)
      if (expandedId === id) setExpandedId(null)
    } catch {
      // silently handle
    } finally {
      setDeletingId(null)
    }
  }

  async function handleSetDefault(id: string) {
    if (settingDefaultId) return
    setSettingDefaultId(id)
    try {
      await setProviderDefault(id)
      setDefault(id)
    } catch {
      // silently handle
    } finally {
      setSettingDefaultId(null)
    }
  }

  const selectedModel = selectedKey
    ? (() => {
        const [sid, mid] = selectedKey.split(':')
        return models[sid]?.find((m) => m.model_id === mid) ?? null
      })()
    : null

  return (
    <div className="pv-root">
      <style>{PROVIDERS_CSS}</style>
      <header className="pv-header">
        <div className="pv-header-info">
          <h1>Providers</h1>
          <p>Manage AI provider connections, API keys, OAuth, and available models.</p>
        </div>
        <button className="pv-add-btn" onClick={() => setShowAddProvider(true)}>
          <Plus size={13} />
          <span>Add Provider</span>
        </button>
      </header>

      {sorted.length === 0 && (
        <div className="pv-empty">
          <p>No providers configured. Add one to get started.</p>
        </div>
      )}

      <div className="pv-list">
        {sorted.map((setting) => {
          const isExpanded = expandedId === setting.id
          const providerModels = models[setting.id] ?? []
          const isLoading = loadingModels[setting.id]
          const isSyncing = syncingModels[setting.id]
          const connectionState = getProviderConnectionState(setting)
          const origin = getProviderOrigin(setting.id)
          const isReadOnly = origin !== 'personal'

          return (
            <div key={setting.id} className={`pv-card ${isExpanded ? 'expanded' : ''} ${setting.is_default ? 'is-default' : ''}`}>
              <div className="pv-card-header" onClick={() => handleExpand(setting)}>
                <div className="pv-brand">
                  <ProviderIcon provider={setting.provider} size={34} />
                  <div className="pv-meta">
                    <div className="pv-name">
                      {setting.name}
                      {setting.is_default && (
                        <span className="pv-default-provider-pill">
                          <Crown size={9} /> default
                        </span>
                      )}
                      {isReadOnly && (
                        <span className="pv-origin-badge">
                          {origin === 'organization' ? 'from your organization' : 'platform default'}
                        </span>
                      )}
                    </div>
                    <div className="pv-id">
                      {setting.provider}
                      {setting.auth_kind === 'oauth' ? ' · oauth' : setting.auth_kind === 'none' ? ' · local' : ' · api key'}
                    </div>
                  </div>
                </div>
                <div className="pv-card-controls">
                  <span className={`pv-status-pill ${connectionState.tone}`}>
                    {connectionState.label}
                  </span>
                  {!isReadOnly && !setting.is_default && (
                    <button
                      className="pv-icon-btn pv-default-btn"
                      title="Set as default provider"
                      onClick={(e) => { e.stopPropagation(); handleSetDefault(setting.id) }}
                      disabled={settingDefaultId === setting.id}
                    >
                      <Crown size={13} />
                    </button>
                  )}
                  {!isReadOnly && (
                    <button
                      className="pv-icon-btn"
                      onClick={(e) => { e.stopPropagation(); handleDelete(setting.id) }}
                      disabled={deletingId === setting.id}
                    >
                      <Delete size={13} />
                    </button>
                  )}
                  <button className="pv-icon-btn">
                    {isExpanded ? <Down size={13} /> : <Right size={13} />}
                  </button>
                </div>
              </div>

              {isExpanded && (
                <div className="pv-card-body">
                  <div className="pv-body-layout">
                    <div className="pv-config-form">
                      {setting.base_url && (
                        <div className="pv-form-field">
                          <label><LinkCloud size={12} /> Base URL</label>
                          <div className="pv-input-group">
                            <input type="text" value={setting.base_url} readOnly />
                          </div>
                        </div>
                      )}

                      <div className="pv-form-field">
                        <label><Shield size={12} /> Authentication</label>
                        <div className="pv-auth-method">
                          {setting.auth_kind === 'oauth'
                            ? setting.provider === 'codex'
                              ? 'ChatGPT Pro OAuth'
                              // Only reachable for a connection created before this
                              // combination was removed from Add Provider — it never
                              // worked (routes through the plain API, which an OAuth
                              // token can't bill against). Named to make that obvious
                              // instead of looking like a normal, working option.
                              : 'OpenAI + OAuth (unsupported — delete and reconnect via Codex)'
                            : setting.provider === 'ollama'
                              ? 'Local runtime'
                              : 'API key'}
                        </div>
                      </div>

                      {setting.auth_kind === 'oauth' ? (
                        <ProviderOAuthSection setting={setting} onChanged={refetch} />
                      ) : setting.provider !== 'ollama' ? (
                        <div className="pv-form-field">
                          <label><Shield size={12} /> API Key</label>
                          <div className="pv-input-group">
                            <input
                              type="password"
                              value={setting.has_api_key ? '••••••••••••••••••••••••' : ''}
                              placeholder="Not configured"
                              readOnly
                            />
                          </div>
                        </div>
                      ) : null}

                      <div className="pv-models">
                        <div className="pv-models-toggle-bar">
                          <div className="pv-toggle-left">
                            <Down size={13} />
                            <h3>Models</h3>
                            {isLoading && <span className="pv-loading-dot" />}
                          </div>
                          <div className="pv-toggle-actions">
                            <button
                              className="pv-ghost-btn"
                              onClick={() => handleSync(setting.id)}
                              disabled={isSyncing}
                            >
                              <Sync size={12} className={isSyncing ? 'spin' : ''} />
                              {isSyncing ? 'Syncing…' : 'Sync'}
                            </button>
                            <button
                              className="pv-ghost-btn"
                              onClick={() => setAddModelFor(setting.id)}
                            >
                              <Plus size={12} /> Custom
                            </button>
                          </div>
                        </div>

                        <div className="pv-models-table">
                          <div className="pv-table-head">CATALOG</div>
                          {isLoading && (
                            <div className="pv-models-loading">Loading models…</div>
                          )}
                          {!isLoading && providerModels.length === 0 && (
                            <div className="pv-models-empty">No models. Click Sync to fetch.</div>
                          )}
                          {providerModels.map((m) => {
                            const key = `${setting.id}:${m.model_id}`
                            return (
                              <ModelListItem
                                key={m.id}
                                model={m}
                                isActive={selectedKey === key}
                                onClick={() => setSelectedKey(selectedKey === key ? null : key)}
                              />
                            )
                          })}
                        </div>
                      </div>
                    </div>

                    <aside className="pv-details">
                      <div className="pv-details-header">
                        <span>MODEL DETAILS</span>
                      </div>
                      {selectedModel ? (
                        <div className="pv-details-body">
                          <DetailEntry label="Model ID" value={selectedModel.model_id} mono />
                          <DetailEntry label="Context Window" value={formatTokens(selectedModel.context_window)} />
                          <DetailEntry label="Max Output" value={formatTokens(selectedModel.max_output)} />
                          <DetailEntry
                            label="Default Temperature"
                            value={selectedModel.default_temperature > 0 ? String(selectedModel.default_temperature) : '1.0'}
                          />
                          {selectedModel.description && (
                            <DetailEntry label="Description" value={selectedModel.description} />
                          )}
                          {selectedModel.is_default && (
                            <div className="pv-default-badge">Default model for this provider</div>
                          )}
                        </div>
                      ) : (
                        <div className="pv-details-empty">
                          Select a model to see details
                        </div>
                      )}
                    </aside>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {showAddProvider && (
        <AddProviderModal
          onClose={() => setShowAddProvider(false)}
          onSuccess={() => { setShowAddProvider(false); refetch() }}
        />
      )}
      {addModelFor && (
        <AddCustomModelModal
          settingId={addModelFor}
          onClose={() => setAddModelFor(null)}
          onSuccess={(model) => {
            setModels((s) => ({
              ...s,
              [addModelFor]: [...(s[addModelFor] ?? []), model],
            }))
            setAddModelFor(null)
          }}
        />
      )}
    </div>
  )
}

function ProviderOAuthSection({ setting, onChanged }: {
  setting: ProviderSetting
  onChanged: () => Promise<void>
}) {
  const [connecting, setConnecting] = useState(false)
  const [polling, setPolling] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [challenge, setChallenge] = useState<OAuthChallenge | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (setting.connection_status === 'connected') {
      setChallenge(null)
      setError('')
    }
  }, [setting.connection_status])

  async function handleConnect() {
    setConnecting(true)
    setError('')
    try {
      const started = await startProviderOAuth(setting.id)
      setChallenge(started)
      await onChanged()
      // Auto-open the verification page so the user can log in with their OpenAI account
      if (started.verification_url) {
        if (window.nexus?.openExternal) {
          await window.nexus.openExternal(started.verification_url)
        } else {
          window.open(started.verification_url, '_blank', 'noopener,noreferrer')
        }
      }
    } catch (e: unknown) {
      setError((e as { message?: string })?.message ?? 'Failed to start connection')
    } finally {
      setConnecting(false)
    }
  }

  async function handlePoll() {
    setPolling(true)
    setError('')
    try {
      const updated = await pollProviderOAuth(setting.id)
      await onChanged()
      if (updated.connection_status === 'connected') {
        setChallenge(null)
      } else if (updated.last_error) {
        setError(updated.last_error)
      }
    } catch (e: unknown) {
      setError((e as { message?: string })?.message ?? 'Failed to refresh connection state')
    } finally {
      setPolling(false)
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true)
    setError('')
    try {
      await disconnectProviderOAuth(setting.id)
      setChallenge(null)
      await onChanged()
    } catch (e: unknown) {
      setError((e as { message?: string })?.message ?? 'Failed to disconnect provider')
    } finally {
      setDisconnecting(false)
    }
  }

  async function openVerificationURL() {
    if (!challenge?.verification_url) return
    if (window.nexus?.openExternal) {
      await window.nexus.openExternal(challenge.verification_url)
      return
    }
    window.open(challenge.verification_url, '_blank', 'noopener,noreferrer')
  }

  const connectionState = getProviderConnectionState(setting)

  return (
    <div className="pv-form-field">
      <label><Shield size={12} /> OpenAI Account</label>
      <div className="pv-oauth-panel">
        <div className="pv-oauth-top">
          <div className="pv-oauth-meta">
            <div>
              <div className="pv-oauth-title">Connection status</div>
              <div className="pv-oauth-copy">
                {setting.oauth_account_email
                  ? `Connected as ${setting.oauth_account_email}`
                  : setting.connection_status === 'pending'
                    ? 'A browser window should have opened — log in with your OpenAI account, enter the code shown below, then click "I finished".'
                    : 'Connect your OpenAI account to make Codex models available through this provider.'}
              </div>
            </div>
            {setting.oauth_expires_at ? (
              <div>
                <div className="pv-oauth-title">Token expiry</div>
                <div className="pv-oauth-copy">{new Date(setting.oauth_expires_at * 1000).toLocaleString()}</div>
              </div>
            ) : null}
          </div>
          <div className="pv-oauth-actions">
            <span className={`pv-status-pill ${connectionState.tone}`}>{connectionState.label}</span>
            {setting.connection_status === 'connected' ? (
              <button className="pv-ghost-btn" onClick={handleDisconnect} disabled={disconnecting}>
                {disconnecting ? 'Disconnecting…' : 'Disconnect'}
              </button>
            ) : (
              <>
                <button className="pv-ghost-btn" onClick={handleConnect} disabled={connecting}>
                  {connecting ? 'Starting…' : challenge ? 'Restart code' : 'Connect'}
                </button>
                {(challenge || setting.connection_status === 'pending') && (
                  <button className="pv-ghost-btn" onClick={handlePoll} disabled={polling}>
                    {polling ? 'Refreshing…' : 'Refresh status'}
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {challenge && (
          <div className="pv-oauth-note">
            <div>
              <div className="pv-oauth-title">Verification code</div>
              <div className="pv-oauth-code">{challenge.user_code}</div>
              <div className="pv-oauth-copy">
                Expires {new Date(challenge.expires_at * 1000).toLocaleString()}. Poll every {challenge.poll_interval_seconds}s after completing the browser step.
              </div>
            </div>
            <div className="pv-oauth-actions">
              <button className="pv-ghost-btn" onClick={openVerificationURL}>Open verification page</button>
              <button className="pv-ghost-btn" onClick={handlePoll} disabled={polling}>
                {polling ? 'Refreshing…' : 'I finished verification'}
              </button>
            </div>
          </div>
        )}

        {(error || setting.last_error) && (
          <div className="pv-inline-error">{error || setting.last_error}</div>
        )}
      </div>
    </div>
  )
}

function ModelListItem({ model, isActive, onClick }: {
  model: ProviderModel
  isActive: boolean
  onClick: () => void
}) {
  return (
    <div className={`pv-model-row ${isActive ? 'active' : ''}`} onClick={onClick}>
      <div className="pv-model-info">
        <div className="pv-model-name">
          {model.display_name || model.model_id}
          {model.is_default && <span className="pv-default-pill">default</span>}
          {model.source === 'user' && <span className="pv-user-pill">custom</span>}
        </div>
        <div className="pv-model-id">{model.model_id}</div>
      </div>
      <div className="pv-model-actions">
        {model.context_window > 0 && (
          <span className="pv-ctx">{formatTokens(model.context_window).replace(' tokens', '')}</span>
        )}
      </div>
    </div>
  )
}

function DetailEntry({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="pv-detail-entry">
      <div className="pv-detail-label">{label}</div>
      <div className={`pv-detail-value ${mono ? 'mono' : ''}`}>{value}</div>
    </div>
  )
}

function AddProviderModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [isDropOpen, setIsDropOpen] = useState(false)
  const [selected, setSelected] = useState<typeof SUPPORTED_PROVIDERS[0] | null>(null)
  const [authKind, setAuthKind] = useState<'api_key' | 'oauth'>('api_key')
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const isOAuthOnly = selected ? OAUTH_ONLY_PROVIDERS.has(selected.id) : false
  const effectiveAuthKind = selected?.id === 'ollama' ? 'none' : isOAuthOnly ? 'oauth' : authKind

  async function handleSubmit() {
    if (!selected) return
    setSubmitting(true)
    setError('')
    try {
      await addProviderSetting({
        provider: selected.id,
        name: effectiveAuthKind === 'oauth' ? 'Codex (OAuth)' : selected.name,
        auth_kind: effectiveAuthKind,
        api_key: effectiveAuthKind === 'api_key' ? apiKey || undefined : undefined,
        base_url: baseUrl || undefined,
      })
      onSuccess()
    } catch (e: unknown) {
      setError((e as { message?: string })?.message ?? 'Failed to add provider')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal-shell">
        <header className="modal-header">
          <h2>Add Provider</h2>
          <button className="modal-close-btn" onClick={onClose}><WindowCloseIcon size={16} /></button>
        </header>
        <div className="modal-content">
          <div className="modal-field" style={{ position: 'relative', zIndex: 100, marginBottom: 24 }}>
            <label>Provider *</label>
            <div className={`pv-custom-select ${isDropOpen ? 'open' : ''}`}>
              <div className="pv-select-box" onClick={() => setIsDropOpen(!isDropOpen)}>
                {selected ? (
                  <div className="pv-selected-preview">
                    <ProviderIcon provider={selected.id} size={20} />
                    <span>{selected.name}</span>
                  </div>
                ) : <span className="pv-select-placeholder">Select a provider</span>}
                <Down size={13} className={isDropOpen ? 'rotated' : ''} />
              </div>
              {isDropOpen && (
                <div className="pv-select-dropdown">
                  {SUPPORTED_PROVIDERS.map((p) => (
                    <div
                      key={p.id}
                      className={`pv-option-row ${selected?.id === p.id ? 'active' : ''}`}
                      onClick={() => {
                        setSelected(p)
                        setBaseUrl(PROVIDER_DEFAULT_URLS[p.id] ?? '')
                        setAuthKind(OAUTH_ONLY_PROVIDERS.has(p.id) ? 'oauth' : 'api_key')
                        setIsDropOpen(false)
                      }}
                    >
                      <ProviderIcon provider={p.id} size={28} />
                      <div className="pv-option-text">
                        <div className="pv-option-name">{p.name}</div>
                        <div className="pv-option-desc">{p.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {isOAuthOnly && (
            <div className="modal-field" style={{ marginBottom: 20 }}>
              <div className="pv-auth-mode-help">
                Codex uses OAuth — connects via your ChatGPT Pro account. No API key required.
              </div>
            </div>
          )}

          {selected && selected.id !== 'ollama' && effectiveAuthKind === 'api_key' && (
            <div className="modal-field" style={{ marginBottom: 20 }}>
              <label>API Key *</label>
              <input
                type="password"
                placeholder="Enter your API key…"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                autoFocus
              />
            </div>
          )}

          <div className="modal-field">
            <label>Base URL <span className="modal-label-opt">(editable)</span></label>
            <input
              type="text"
              placeholder="Select a provider to auto-fill"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
            />
          </div>

          {error && <div className="modal-error">{error}</div>}
        </div>
        <footer className="modal-footer">
          <button className="modal-btn-cancel" onClick={onClose}>Cancel</button>
          <button
            className="modal-btn-submit"
            disabled={!selected || submitting}
            onClick={handleSubmit}
          >
            {submitting ? 'Adding…' : 'Add Provider'}
          </button>
        </footer>
      </div>
    </div>
  )
}

function AddCustomModelModal({ settingId, onClose, onSuccess }: {
  settingId: string
  onClose: () => void
  onSuccess: (model: ProviderModel) => void
}) {
  const [modelId, setModelId] = useState('')
  const [contextWindow, setContextWindow] = useState('')
  const [maxOutput, setMaxOutput] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit() {
    if (!modelId.trim()) return
    setSubmitting(true)
    setError('')
    try {
      const model = await addCustomModel(settingId, {
        model_id: modelId.trim(),
        context_window: contextWindow ? parseInt(contextWindow) : undefined,
        max_output: maxOutput ? parseInt(maxOutput) : undefined,
      })
      onSuccess(model)
    } catch (e: unknown) {
      setError((e as { message?: string })?.message ?? 'Failed to add model')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal-shell">
        <header className="modal-header">
          <h2>Add Custom Model</h2>
          <button className="modal-close-btn" onClick={onClose}><WindowCloseIcon size={16} /></button>
        </header>
        <div className="modal-content modal-grid-2">
          <div className="modal-field modal-full">
            <label>Model ID *</label>
            <input
              type="text"
              placeholder="e.g. my-custom-model"
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              autoFocus
            />
          </div>
          <div className="modal-field">
            <label>Context Window (tokens)</label>
            <input
              type="number"
              placeholder="128000"
              value={contextWindow}
              onChange={(e) => setContextWindow(e.target.value)}
            />
          </div>
          <div className="modal-field">
            <label>Max Output Tokens</label>
            <input
              type="number"
              placeholder="4096"
              value={maxOutput}
              onChange={(e) => setMaxOutput(e.target.value)}
            />
          </div>
          {error && <div className="modal-error modal-full">{error}</div>}
        </div>
        <footer className="modal-footer">
          <button className="modal-btn-cancel" onClick={onClose}>Cancel</button>
          <button
            className="modal-btn-submit"
            disabled={!modelId.trim() || submitting}
            onClick={handleSubmit}
          >
            {submitting ? 'Adding…' : 'Add Model'}
          </button>
        </footer>
      </div>
    </div>
  )
}

export const PROVIDERS_CSS = `
.pv-root { display: flex; flex-direction: column; }
.pv-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 40px; }
.pv-header-info h1 { font-size: var(--font-size-base); font-weight: 700; margin: 0 0 4px; color: var(--color-text); }
.pv-header-info p { color: var(--color-text-muted); margin: 0; font-size: var(--font-size-sm); }
.pv-add-btn { background: var(--color-primary); color: white; border: none; padding: 7px 14px; border-radius: 8px; display: flex; align-items: center; gap: 7px; font-weight: 600; font-size: var(--font-size-sm); cursor: pointer; flex-shrink: 0; }
.pv-add-btn:hover { opacity: 0.9; }

.pv-empty { text-align: center; padding: 36px 20px; color: var(--color-text-muted); font-size: var(--font-size-sm); }

.pv-card { background: var(--color-bg); border: 1px solid var(--color-border); border-radius: 10px; margin-bottom: 8px; overflow: visible; }
.pv-card.expanded { border-color: var(--color-primary); box-shadow: 0 4px 20px rgba(0,0,0,0.06); }
.pv-card.is-default { border-color: rgba(239,124,47,0.35); }
.pv-default-provider-pill { display: inline-flex; align-items: center; gap: 3px; font-size: var(--font-size-2xs); color: var(--color-primary); background: var(--color-primary-subtle); padding: 1px 6px; border-radius: 4px; font-weight: 700; margin-left: 6px; vertical-align: middle; }
.pv-origin-badge { display: inline-flex; align-items: center; font-size: var(--font-size-2xs); color: var(--color-text-muted); background: var(--color-surface); border: 1px solid var(--color-border); padding: 1px 6px; border-radius: 4px; font-weight: 600; margin-left: 6px; vertical-align: middle; }
.pv-default-btn { color: var(--color-text-muted); }
.pv-default-btn:hover { color: var(--color-primary) !important; }
.pv-card-header { padding: 12px 16px; display: flex; align-items: center; justify-content: space-between; cursor: pointer; border-radius: 10px; }
.pv-card.expanded .pv-card-header { border-radius: 10px 10px 0 0; }
.pv-brand { display: flex; align-items: center; gap: 18px; }
.pv-meta { display: flex; flex-direction: column; gap: 2px; }
.pv-name { font-weight: 700; font-size: var(--font-size-base); color: var(--color-text); }
.pv-id { font-size: var(--font-size-2xs); color: var(--color-text-muted); }
.pv-card-controls { display: flex; align-items: center; gap: 14px; }
.pv-status-pill { font-size: var(--font-size-2xs); font-weight: 700; padding: 2px 8px; border-radius: 6px; }
.pv-status-pill.connected { color: var(--color-success); background: rgba(111,175,123,0.12); }
.pv-status-pill.pending { color: var(--color-primary); background: color-mix(in srgb, var(--color-primary) 12%, transparent); }
.pv-status-pill.error { color: var(--color-error); background: color-mix(in srgb, var(--color-error) 10%, transparent); }
.pv-status-pill.disconnected { color: var(--color-text-muted); background: var(--color-surface); border: 1px solid var(--color-border); }
.pv-icon-btn { background: none; border: none; color: var(--color-text-muted); cursor: pointer; padding: 5px; display: flex; border-radius: 6px; transition: background 0.1s, color 0.1s; }
.pv-icon-btn:hover { background: var(--color-hover); color: var(--color-text); }
.pv-icon-btn:disabled { opacity: 0.4; cursor: default; }

.pv-card-body { border-top: 1px solid var(--color-border); padding: 18px; }
.pv-body-layout { display: grid; grid-template-columns: 1fr 320px; gap: 48px; }
.pv-config-form { min-width: 0; }
.pv-form-field { margin-bottom: 20px; }
.pv-form-field label { display: flex; align-items: center; gap: 6px; font-size: var(--font-size-xs); font-weight: 600; color: var(--color-text-secondary); margin-bottom: 6px; }
.pv-input-group { display: flex; gap: 10px; }
.pv-input-group input { flex: 1; background: var(--color-surface); border: 1px solid var(--color-border); padding: 7px 10px; border-radius: 8px; color: var(--color-text); font-size: var(--font-size-sm); outline: none; font-family: inherit; min-width: 0; }
.pv-auth-method { background: var(--color-surface); border: 1px solid var(--color-border); padding: 7px 10px; border-radius: 8px; color: var(--color-text); font-size: var(--font-size-sm); }

.pv-oauth-panel { display: flex; flex-direction: column; gap: 10px; padding: 12px; border-radius: 10px; border: 1px solid var(--color-border); background: var(--color-surface); }
.pv-oauth-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.pv-oauth-meta { display: flex; flex-direction: column; gap: 14px; }
.pv-oauth-title { font-size: var(--font-size-2xs); font-weight: 700; color: var(--color-text-secondary); margin-bottom: 3px; text-transform: uppercase; letter-spacing: 0.04em; }
.pv-oauth-copy { font-size: var(--font-size-xs); line-height: 1.5; color: var(--color-text-muted); }
.pv-oauth-actions { display: flex; align-items: center; justify-content: flex-end; gap: 10px; flex-wrap: wrap; }
.pv-oauth-note { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 12px; border-radius: 10px; border: 1px solid var(--color-border); background: var(--color-bg); }
.pv-oauth-code { font-size: 18px; letter-spacing: 0.14em; font-weight: 800; color: var(--color-text); margin: 6px 0; }
.pv-inline-error { border: 1px solid var(--color-error); background: color-mix(in srgb, var(--color-error) 10%, transparent); color: var(--color-error); border-radius: 8px; padding: 8px 10px; font-size: var(--font-size-xs); line-height: 1.5; }

.pv-models { margin-top: 20px; }
.pv-models-toggle-bar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.pv-toggle-left { display: flex; align-items: center; gap: 7px; color: var(--color-text-secondary); }
.pv-models-toggle-bar h3 { font-size: var(--font-size-sm); margin: 0; font-weight: 700; color: var(--color-text); }
.pv-loading-dot { width: 6px; height: 6px; background: var(--color-primary); border-radius: 50%; animation: pulse-opacity 1s infinite; }
.pv-toggle-actions { display: flex; gap: 8px; }
.pv-ghost-btn { background: none; border: 1px solid var(--color-border); color: var(--color-text-secondary); font-size: var(--font-size-xs); font-weight: 600; display: flex; align-items: center; gap: 5px; cursor: pointer; padding: 4px 9px; border-radius: 6px; transition: background 0.1s; }
.pv-ghost-btn:hover { background: var(--color-hover); }
.pv-ghost-btn:disabled { opacity: 0.5; cursor: default; }

.pv-models-table { border: 1px solid var(--color-border); border-radius: 10px; background: var(--color-bg); overflow: hidden; }
.pv-table-head { padding: 6px 12px; background: var(--color-surface); border-bottom: 1px solid var(--color-border); font-size: var(--font-size-2xs); font-weight: 800; color: var(--color-text-muted); letter-spacing: 0.06em; }
.pv-models-loading { padding: 14px 12px; color: var(--color-text-muted); font-size: var(--font-size-xs); }
.pv-models-empty { padding: 14px 12px; color: var(--color-text-muted); font-size: var(--font-size-xs); }
.pv-model-row { padding: 8px 12px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--color-border-subtle); cursor: pointer; transition: background 0.1s; }
.pv-model-row:last-child { border-bottom: none; }
.pv-model-row:hover { background: var(--color-hover); }
.pv-model-row.active { background: var(--color-primary-subtle); border-left: 3px solid var(--color-primary); padding-left: 9px; }
.pv-model-info { flex: 1; min-width: 0; }
.pv-model-name { font-size: var(--font-size-xs); font-weight: 600; display: flex; align-items: center; gap: 6px; color: var(--color-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pv-default-pill { font-size: var(--font-size-2xs); color: var(--color-cta); background: var(--color-primary-subtle); padding: 1px 5px; border-radius: 4px; font-weight: 700; flex-shrink: 0; }
.pv-user-pill { font-size: var(--font-size-2xs); color: var(--color-accent); background: rgba(200,154,106,0.12); padding: 1px 5px; border-radius: 4px; font-weight: 700; flex-shrink: 0; }
.pv-model-id { font-size: var(--font-size-2xs); color: var(--color-text-muted); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pv-model-actions { flex-shrink: 0; display: flex; align-items: center; gap: 8px; margin-left: 8px; }
.pv-ctx { font-size: var(--font-size-2xs); color: var(--color-text-muted); }

.pv-details { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 10px; align-self: flex-start; position: sticky; top: 0; }
.pv-details-header { padding: 8px 12px; border-bottom: 1px solid var(--color-border); font-size: var(--font-size-2xs); font-weight: 800; color: var(--color-text-muted); letter-spacing: 0.06em; }
.pv-details-body { padding: 12px; }
.pv-details-empty { padding: 20px 12px; text-align: center; color: var(--color-text-muted); font-size: var(--font-size-xs); line-height: 1.5; }
.pv-detail-entry { margin-bottom: 10px; }
.pv-detail-entry:last-child { margin-bottom: 0; }
.pv-detail-label { font-size: var(--font-size-2xs); font-weight: 700; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; }
.pv-detail-value { font-size: var(--font-size-xs); line-height: 1.5; color: var(--color-text); }
.pv-detail-value.mono { font-family: monospace; font-size: var(--font-size-2xs); }
.pv-default-badge { margin-top: 10px; padding: 6px 10px; background: var(--color-primary-subtle); border: 1px solid rgba(239,124,47,0.2); border-radius: 7px; font-size: var(--font-size-2xs); color: var(--color-primary); font-weight: 600; text-align: center; }

.pv-custom-select { border: 1.5px solid var(--color-border); border-radius: 8px; position: relative; background: var(--color-bg); }
.pv-custom-select.open { border-color: var(--color-primary); }
.pv-select-box { padding: 7px 10px; display: flex; align-items: center; justify-content: space-between; cursor: pointer; font-weight: 500; min-height: 36px; color: var(--color-text); gap: 8px; }
.pv-select-placeholder { color: var(--color-text-muted); font-size: var(--font-size-sm); }
.pv-selected-preview { display: flex; align-items: center; gap: 8px; }
.pv-selected-preview span { font-weight: 600; font-size: var(--font-size-sm); }
.pv-select-dropdown { position: absolute; top: calc(100% + 4px); left: -1.5px; right: -1.5px; max-height: 320px; overflow-y: auto; background: var(--color-bg); border: 1.5px solid var(--color-border); border-radius: 8px; box-shadow: var(--shadow-large); z-index: 1000; }
.pv-option-row { padding: 8px 10px; display: flex; align-items: center; gap: 10px; cursor: pointer; transition: background 0.1s; }
.pv-option-row:hover { background: var(--color-hover); }
.pv-option-row.active { background: var(--color-primary-subtle); }
.pv-option-name { font-weight: 700; font-size: var(--font-size-sm); color: var(--color-text); }
.pv-option-desc { font-size: var(--font-size-2xs); color: var(--color-text-muted); margin-top: 2px; }
.rotated { transform: rotate(180deg); transition: transform 0.15s; }

.pv-auth-mode-row { display: flex; gap: 10px; }
.pv-auth-mode-btn { flex: 1; border: 1px solid var(--color-border); background: var(--color-bg); color: var(--color-text-secondary); border-radius: 8px; padding: 7px 10px; font-size: var(--font-size-xs); font-weight: 700; cursor: pointer; font-family: inherit; }
.pv-auth-mode-btn.active { border-color: var(--color-primary); background: var(--color-primary-subtle); color: var(--color-primary); }
.pv-auth-mode-help { margin-top: 6px; font-size: var(--font-size-2xs); line-height: 1.5; color: var(--color-text-muted); }

.spin { animation: spin 1s linear infinite; }

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@keyframes pulse-opacity {
  0%, 100% { opacity: 0.35; }
  50% { opacity: 1; }
}

.modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 9999; }
.modal-shell { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 14px; width: 440px; max-width: calc(100vw - 48px); box-shadow: var(--shadow-large); }
.modal-header { padding: 16px 18px 0; display: flex; align-items: center; justify-content: space-between; }
.modal-header h2 { font-size: var(--font-size-lg); font-weight: 700; color: var(--color-text); }
.modal-close-btn { background: none; border: none; color: var(--color-text-muted); cursor: pointer; padding: 4px; display: flex; border-radius: 6px; }
.modal-close-btn:hover { background: var(--color-hover); }
.modal-content { padding: 16px 18px; }
.modal-content.modal-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.modal-field { display: flex; flex-direction: column; gap: 6px; }
.modal-field.modal-full { grid-column: 1 / -1; }
.modal-field label { font-size: var(--font-size-xs); font-weight: 600; color: var(--color-text-secondary); }
.modal-label-opt { font-weight: 400; color: var(--color-text-muted); }
.modal-field input, .modal-field textarea { background: var(--color-bg); border: 1px solid var(--color-border); padding: 7px 10px; border-radius: 8px; color: var(--color-text); font-size: var(--font-size-sm); outline: none; font-family: inherit; width: 100%; }
.modal-field input:focus, .modal-field textarea:focus { border-color: var(--color-primary); }
.modal-field textarea { resize: vertical; min-height: 80px; }
.modal-error { grid-column: 1 / -1; background: rgba(201,107,92,0.1); border: 1px solid rgba(201,107,92,0.3); padding: 8px 10px; border-radius: 7px; color: var(--color-error); font-size: var(--font-size-xs); }
.modal-footer { padding: 0 18px 16px; display: flex; gap: 8px; justify-content: flex-end; }
.modal-btn-cancel { background: var(--color-bg); border: 1px solid var(--color-border); color: var(--color-text); padding: 7px 14px; border-radius: 8px; font-size: var(--font-size-sm); font-weight: 600; cursor: pointer; }
.modal-btn-cancel:hover { background: var(--color-hover); }
.modal-btn-submit { background: var(--color-cta); color: white; border: none; padding: 7px 14px; border-radius: 8px; font-size: var(--font-size-sm); font-weight: 600; cursor: pointer; }
.modal-btn-submit:hover:not(:disabled) { opacity: 0.9; }
.modal-btn-submit:disabled { opacity: 0.5; cursor: default; }

@media (max-width: 1100px) {
  .pv-body-layout { grid-template-columns: 1fr; gap: 24px; }
  .pv-details { position: static; }
}

@media (max-width: 760px) {
  .pv-header { flex-direction: column; gap: 16px; }
  .pv-card-header { padding: 16px; gap: 12px; align-items: flex-start; }
  .pv-brand { gap: 14px; }
  .pv-card-controls { gap: 10px; flex-wrap: wrap; justify-content: flex-end; }
  .pv-card-body { padding: 20px; }
  .pv-models-toggle-bar, .pv-oauth-top, .pv-oauth-note { flex-direction: column; }
  .pv-toggle-actions, .pv-oauth-actions { width: 100%; justify-content: flex-start; }
  .modal-shell { width: min(500px, calc(100vw - 24px)); }
  .modal-content.modal-grid-2 { grid-template-columns: 1fr; }
}
`
