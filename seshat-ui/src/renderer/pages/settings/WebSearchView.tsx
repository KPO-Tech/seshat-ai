import { useState, useEffect, useCallback } from 'react'
import {
  Earth, Shield, Search, Config,
  CheckOne, CloseOne, LoadingFour, Experiment,
  Down, Right,
} from '@icon-park/react'
import { api } from '@/api/client'
import type { WebSearchSettings, SearchProviderConfig, DomainCategory } from '@/api/types'

// ── Types ────────────────────────────────────────────────────────────────────

type ProviderTestState = 'idle' | 'running' | 'ok' | 'error'

type ProviderEditState = {
  apiKey: string
  baseUrl: string
  apiKeyChanged: boolean
  authUsername: string
  authPassword: string
  authChanged: boolean
}

type GlobalFormState = {
  enabled: boolean
  allow_env_fallback: boolean
  max_queries_per_day: number
}

// ── Provider Card ─────────────────────────────────────────────────────────────

function ProviderCard({ provider, onSaved }: {
  provider: SearchProviderConfig
  onSaved: (updated: SearchProviderConfig) => void
}) {
  const [edit, setEdit] = useState<ProviderEditState>({
    apiKey: '',
    baseUrl: provider.base_url || provider.default_base_url || '',
    apiKeyChanged: false,
    authUsername: provider.auth_username || '',
    authPassword: '',
    authChanged: false,
  })
  const [enabled, setEnabled] = useState(provider.enabled)
  const [saving, setSaving] = useState(false)
  const [testState, setTestState] = useState<ProviderTestState>('idle')
  const [testError, setTestError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    setEnabled(provider.enabled)
    setEdit((prev) => ({
      ...prev,
      baseUrl: provider.base_url || provider.default_base_url || '',
      authUsername: provider.auth_username || '',
    }))
  }, [provider.enabled, provider.base_url, provider.default_base_url, provider.auth_username])

  function markDirty() {
    setDirty(true)
    setTestState('idle')
    setSaveError('')
  }

  async function handleSave() {
    if (saving) return
    setSaving(true)
    setSaveError('')
    try {
      const payload: Record<string, unknown> = { enabled }
      if (edit.apiKeyChanged) payload.api_key = edit.apiKey
      if (provider.requires_base_url || edit.baseUrl) payload.base_url = edit.baseUrl
      if (edit.authChanged) {
        payload.auth_username = edit.authUsername
        payload.api_key = edit.authPassword
      }
      const updated = await api.put<SearchProviderConfig>(
        `/web/search/providers/${provider.provider}`, payload,
      )
      setDirty(false)
      setEdit((prev) => ({ ...prev, apiKey: '', apiKeyChanged: false, authPassword: '', authChanged: false }))
      onSaved(updated)
    } catch (e: unknown) {
      setSaveError((e as { message?: string })?.message ?? 'Failed to save')
    } finally { setSaving(false) }
  }

  async function handleTest() {
    setTestState('running')
    setTestError('')
    try {
      const result = await api.post<{ ok: boolean; latency_ms: number; error: string }>(
        `/web/search/providers/${provider.provider}/test`, {},
      )
      if (result.ok) setTestState('ok')
      else { setTestState('error'); setTestError(result.error || 'No results') }
    } catch (e: unknown) {
      setTestState('error')
      setTestError((e as { message?: string })?.message ?? 'Test failed')
    }
  }

  const hasConfig = provider.has_api_key || (provider.requires_base_url && !!provider.base_url)
  const isReady = !provider.requires_api_key || provider.has_api_key || edit.apiKeyChanged
  const showKeyHint = provider.requires_api_key && !provider.has_api_key && !edit.apiKeyChanged

  return (
    <div className={`wsp-card ${enabled ? 'active' : ''}`}>
      <div className="wsp-card-head">
        <div className="wsp-provider-info">
          <div className="wsp-provider-avatar">{provider.label[0]}</div>
          <div>
            <div className="wsp-provider-name">
              {provider.label}
              {provider.source && (
                <span className="pv-origin-badge">
                  {provider.source === 'organization' ? 'from your organization' : 'platform default'}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="wsp-card-right">
          {hasConfig && (
            <span className={`wsp-status-dot ${isReady ? 'ready' : 'warn'}`} />
          )}
          <label className="ws-toggle" title={enabled ? 'Disable' : 'Enable'}>
            <input type="checkbox" checked={enabled}
              onChange={(e) => { setEnabled(e.target.checked); markDirty() }} />
            <span className="ws-toggle-slider" />
          </label>
        </div>
      </div>

      {(provider.requires_api_key || provider.requires_base_url) && (
        <div className="wsp-fields">
          {provider.requires_api_key && (
            <div className="wsp-field">
              <label>API Key</label>
              <div className="wsp-input-wrap">
                <input
                  type="password"
                  placeholder={provider.has_api_key ? '••••••••  (saved)' : 'Enter API key…'}
                  value={edit.apiKey}
                  autoComplete="new-password"
                  onChange={(e) => {
                    setEdit((prev) => ({ ...prev, apiKey: e.target.value, apiKeyChanged: true }))
                    markDirty()
                  }}
                />
                {showKeyHint && <span className="wsp-missing-key">Required</span>}
              </div>
            </div>
          )}
          {provider.requires_base_url && (
            <div className="wsp-field">
              <label>Base URL</label>
              <input
                type="text"
                placeholder={provider.default_base_url || 'http://…'}
                value={edit.baseUrl}
                onChange={(e) => { setEdit((prev) => ({ ...prev, baseUrl: e.target.value })); markDirty() }}
              />
            </div>
          )}
        </div>
      )}

      {provider.provider === 'searxng' && (
        <div className="wsp-fields">
          <div className="wsp-basic-auth-label">Basic Auth <span className="wsp-optional">(optional)</span></div>
          <div className="wsp-field">
            <label>Username</label>
            <input
              type="text"
              placeholder={edit.authUsername || 'Leave empty if not required'}
              value={edit.authUsername}
              autoComplete="username"
              onChange={(e) => {
                setEdit((prev) => ({ ...prev, authUsername: e.target.value, authChanged: true }))
                markDirty()
              }}
            />
          </div>
          <div className="wsp-field">
            <label>Password</label>
            <input
              type="password"
              placeholder={provider.has_api_key ? '••••••••  (saved)' : 'Leave empty if not required'}
              value={edit.authPassword}
              autoComplete="new-password"
              onChange={(e) => {
                setEdit((prev) => ({ ...prev, authPassword: e.target.value, authChanged: true }))
                markDirty()
              }}
            />
          </div>
        </div>
      )}

      <div className="wsp-actions">
        <button
          className="wsp-test-btn"
          onClick={handleTest}
          disabled={testState === 'running' || saving}
        >
          {testState === 'running' ? <LoadingFour size={11} className="spin" />
            : testState === 'ok' ? <CheckOne size={11} />
            : testState === 'error' ? <CloseOne size={11} />
            : <Experiment size={11} />}
          <span>{testState === 'running' ? 'Testing…' : testState === 'ok' ? 'Connected' : testState === 'error' ? 'Failed' : 'Test'}</span>
        </button>
        {testState === 'error' && testError && (
          <span className="wsp-test-error" title={testError}>{testError}</span>
        )}
        {saveError && (
          <span className="wsp-test-error" title={saveError}>{saveError}</span>
        )}
        {dirty && (
          <button className="wsp-save-btn" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        )}
      </div>
    </div>
  )
}


// ── Domain Catalog (premium grid) ─────────────────────────────────────────────

function FaviconImg({ domain }: { domain: string }) {
  const [error, setError] = useState(false)
  if (error) {
    return (
      <div className="dc-favicon-fallback">
        {domain[0]?.toUpperCase()}
      </div>
    )
  }
  return (
    <img
      className="dc-favicon"
      src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`}
      alt=""
      onError={() => setError(true)}
      loading="lazy"
    />
  )
}

function DomainCatalog({
  categories,
  activeSet,
  onToggle,
  onSave,
  saving,
  saved,
  orgBlockedCount,
}: {
  categories: DomainCategory[]
  activeSet: Set<string>
  onToggle: (domain: string) => void
  onSave: () => void
  saving: boolean
  saved: boolean
  orgBlockedCount: number
}) {
  const [openIds, setOpenIds] = useState<Set<string>>(new Set([categories[0]?.id].filter(Boolean)))

  function toggleCat(id: string) {
    setOpenIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  return (
    <div className="dc-root">
      {/* Header */}
      <div className="dc-header">
        <div className="dc-header-left">
          <div className="dc-header-icon"><Earth size={16} /></div>
          <div>
            <div className="dc-header-title">Domain Catalog</div>
            <div className="dc-header-sub">Choose which domains SeshatOS can use when searching the web.</div>
            {orgBlockedCount > 0 && (
              <div className="dc-org-policy-note">
                Your organization blocks {orgBlockedCount} domain{orgBlockedCount === 1 ? '' : 's'} — these can't be re-enabled here.
              </div>
            )}
          </div>
        </div>
        <button
          className={`dc-save-btn ${saved ? 'dc-save-btn-saved' : ''}`}
          onClick={onSave}
          disabled={saving}
        >
          {saving ? 'Saving…' : saved ? <><CheckOne size={11} /> Saved</> : 'Save Changes'}
        </button>
      </div>

      {/* Category accordion */}
      <div className="dc-cats">
        {categories.map(cat => {
          const open = openIds.has(cat.id)
          const activeCount = cat.domains.filter(d => activeSet.has(d)).length
          const total = cat.domains.length

          return (
            <div key={cat.id} className={`dc-cat ${open ? 'dc-cat-open' : ''}`}>
              <button className="dc-cat-head" onClick={() => toggleCat(cat.id)}>
                <span className="dc-cat-chevron">
                  {open ? <Down size={11} /> : <Right size={11} />}
                </span>
                <span className="dc-cat-name">{cat.label}</span>
                <span className="dc-cat-count">
                  <span className="dc-count-active">{activeCount}</span>
                  <span className="dc-count-sep"> / {total} active</span>
                </span>
                <span className="dc-cat-end-chevron">
                  {open ? <Down size={11} /> : <Right size={11} />}
                </span>
              </button>

              {open && (
                <div className="dc-grid">
                  {cat.domains.map(domain => {
                    const active = activeSet.has(domain)
                    return (
                      <div
                        key={domain}
                        className={`dc-card ${active ? 'dc-card-active' : ''}`}
                        onClick={() => onToggle(domain)}
                        title={active ? `Deactivate ${domain}` : `Activate ${domain}`}
                      >
                        <FaviconImg domain={domain} />
                        <span className="dc-card-name">{domain}</span>
                        <span className={`dc-dot ${active ? 'dc-dot-on' : 'dc-dot-off'}`} />
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Main View ────────────────────────────────────────────────────────────────

function settingsToForm(s: WebSearchSettings): GlobalFormState {
  return {
    enabled: s.enabled,
    allow_env_fallback: s.allow_env_fallback,
    max_queries_per_day: s.max_queries_per_day,
  }
}

export function WebSearchView() {
  const [settings, setSettings] = useState<WebSearchSettings | null>(null)
  const [providers, setProviders] = useState<SearchProviderConfig[]>([])
  const [catalog, setCatalog] = useState<DomainCategory[]>([])
  const [form, setForm] = useState<GlobalFormState>({
    enabled: true,
    allow_env_fallback: true,
    max_queries_per_day: 0,
  })
  // Domain active state: Set<domain>
  const [activeDomainsSet, setActiveDomainsSet] = useState<Set<string>>(new Set())
  const [allCatalogDomains, setAllCatalogDomains] = useState<Set<string>>(new Set())
  const [domainsInitialized, setDomainsInitialized] = useState(false)

  const [loading, setLoading] = useState(true)
  const [globalSaving, setGlobalSaving] = useState(false)
  const [globalSaved, setGlobalSaved] = useState(false)
  const [domainSaving, setDomainSaving] = useState(false)
  const [domainSaved, setDomainSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [settingsData, providersData, catalogData] = await Promise.all([
        api.get<WebSearchSettings>('/web/search/settings'),
        api.get<{ providers: SearchProviderConfig[]; count: number }>('/web/search/providers'),
        api.get<{ categories: DomainCategory[] }>('/web/search/domain-catalog'),
      ])
      setSettings(settingsData)
      setForm(settingsToForm(settingsData))
      setProviders((providersData?.providers ?? []).sort((a, b) => a.priority - b.priority))

      const cats = catalogData?.categories ?? []
      setCatalog(cats)

      // Build the full catalog domain set
      const allDomains = new Set<string>()
      cats.forEach(cat => cat.domains.forEach(d => allDomains.add(d)))
      setAllCatalogDomains(allDomains)

      // Initialize active set from settings
      const allowed = settingsData?.allowed_domains ?? []
      if (allowed.length === 0) {
        // No restriction = all catalog domains are active
        setActiveDomainsSet(new Set(allDomains))
      } else {
        setActiveDomainsSet(new Set(allowed))
      }
      setDomainsInitialized(true)
    } catch (e: unknown) {
      setError((e as { message?: string })?.message ?? 'Failed to load web search settings')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void loadData() }, [loadData])

  // Re-initialize active set when catalog loads but settings were already there
  useEffect(() => {
    if (!domainsInitialized && catalog.length > 0 && settings) {
      const allDomains = new Set<string>()
      catalog.forEach(cat => cat.domains.forEach(d => allDomains.add(d)))
      setAllCatalogDomains(allDomains)
      const allowed = settings.allowed_domains ?? []
      setActiveDomainsSet(allowed.length === 0 ? new Set(allDomains) : new Set(allowed))
      setDomainsInitialized(true)
    }
  }, [catalog, settings, domainsInitialized])

  async function handleGlobalSave() {
    if (globalSaving) return
    setGlobalSaving(true)
    setGlobalSaved(false)
    setError(null)
    try {
      const updated = await api.put<WebSearchSettings>('/web/search/settings', {
        enabled: form.enabled,
        allow_env_fallback: form.allow_env_fallback,
        max_queries_per_day: form.max_queries_per_day,
        allowed_domains: settings?.allowed_domains ?? [],
        blocked_domains: settings?.blocked_domains ?? [],
        provider_setting_ids: settings?.provider_setting_ids ?? [],
      })
      setSettings(updated)
      setGlobalSaved(true)
      setTimeout(() => setGlobalSaved(false), 2500)
    } catch (e: unknown) {
      setError((e as { message?: string })?.message ?? 'Failed to save')
    } finally {
      setGlobalSaving(false)
    }
  }

  async function handleDomainSave() {
    if (domainSaving) return
    setDomainSaving(true)
    setDomainSaved(false)
    try {
      // If all catalog domains are active → save empty array (no restriction)
      const allowed = activeDomainsSet.size >= allCatalogDomains.size
        ? []
        : Array.from(activeDomainsSet)

      const updated = await api.put<WebSearchSettings>('/web/search/settings', {
        enabled: form.enabled,
        allow_env_fallback: form.allow_env_fallback,
        max_queries_per_day: form.max_queries_per_day,
        allowed_domains: allowed,
        blocked_domains: settings?.blocked_domains ?? [],
        provider_setting_ids: settings?.provider_setting_ids ?? [],
      })
      setSettings(updated)
      setDomainSaved(true)
      setTimeout(() => setDomainSaved(false), 2500)
    } catch (e: unknown) {
      setError((e as { message?: string })?.message ?? 'Failed to save domains')
    } finally {
      setDomainSaving(false)
    }
  }

  function toggleDomain(domain: string) {
    setActiveDomainsSet(prev => {
      const next = new Set(prev)
      if (next.has(domain)) next.delete(domain); else next.add(domain)
      return next
    })
    setDomainSaved(false)
  }

  function setField<K extends keyof GlobalFormState>(key: K, value: GlobalFormState[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
    setGlobalSaved(false)
  }

  function handleProviderSaved(updated: SearchProviderConfig) {
    setProviders(prev => prev.map(p => p.provider === updated.provider ? updated : p))
  }

  return (
    <div className="sv-view">
      <style>{WEB_SEARCH_CSS}</style>

      <header className="sv-view-header">
        <div className="sv-header-info">
          <h1>Web Search</h1>
          <p>Configure search providers and domain policies for AI agent sessions.</p>
        </div>
        <div className="ws-header-actions">
          {error && <span className="ws-error-inline">{error}</span>}
          {globalSaved && <span className="ws-saved-badge">Saved</span>}
          <button className="ws-save-btn" onClick={handleGlobalSave} disabled={globalSaving || loading}>
            {globalSaving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </header>

      {loading ? (
        <div className="ws-loading">Loading settings…</div>
      ) : (
        <div className="ws-layout">

          {/* ── Global toggles ── */}
          <div className="sv-card">
            <div className="sv-card-head">
              <div className="sv-card-brand">
                <div className="sv-brand-icon"><Earth size={16} /></div>
                <div>
                  <div className="sv-brand-name">Web Search</div>
                </div>
              </div>
            </div>
            <div className="sv-card-body">
              <div className="sv-toggle-row">
                <div className="sv-toggle-info">
                  <Search size={15} />
                  <div>
                    <div className="sv-setting-label">Enable Web Search</div>
                  </div>
                </div>
                <label className="ws-toggle">
                  <input type="checkbox" checked={form.enabled} onChange={(e) => setField('enabled', e.target.checked)} />
                  <span className="ws-toggle-slider" />
                </label>
              </div>
              <div className="sv-toggle-row">
                <div className="sv-toggle-info">
                  <Shield size={15} />
                  <div>
                    <div className="sv-setting-label">Allow ENV Fallback</div>
                  </div>
                </div>
                <label className="ws-toggle">
                  <input type="checkbox" checked={form.allow_env_fallback} onChange={(e) => setField('allow_env_fallback', e.target.checked)} />
                  <span className="ws-toggle-slider" />
                </label>
              </div>
            </div>
          </div>

          {/* ── Rate limiting ── */}
          <div className="sv-card">
            <div className="sv-card-head">
              <div className="sv-card-brand">
                <div className="sv-brand-icon"><Config size={16} /></div>
                <div>
                  <div className="sv-brand-name">Rate Limiting</div>
                </div>
              </div>
            </div>
            <div className="sv-card-body">
              <div className="sv-field">
                <label>Max queries per day</label>
                <div className="sv-input-box">
                  <input
                    type="number"
                    min={0}
                    value={form.max_queries_per_day}
                    onChange={(e) => setField('max_queries_per_day', Math.max(0, parseInt(e.target.value) || 0))}
                    placeholder="0 = unlimited"
                  />
                </div>
                <span className="ws-field-hint">Set to 0 for unlimited queries.</span>
              </div>
            </div>
          </div>

          {/* ── Provider cards ── */}
          <div className="sv-card ws-full-card">
            <div className="sv-card-head">
              <div className="sv-card-brand">
                <div className="sv-brand-icon"><Search size={16} /></div>
                <div>
                  <div className="sv-brand-name">Providers</div>
                </div>
              </div>
            </div>
            <div className="sv-card-body wsp-grid">
              {providers.map((p) => (
                <ProviderCard key={p.provider} provider={p} onSaved={handleProviderSaved} />
              ))}
            </div>
          </div>

          {/* ── Domain Catalog (premium grid) ── */}
          {catalog.length > 0 && (
            <div className="ws-full-card">
              <DomainCatalog
                categories={catalog}
                activeSet={activeDomainsSet}
                onToggle={toggleDomain}
                onSave={handleDomainSave}
                saving={domainSaving}
                saved={domainSaved}
                orgBlockedCount={settings?.org_blocked_domains?.length ?? 0}
              />
            </div>
          )}

        </div>
      )}
    </div>
  )
}

// ── CSS ───────────────────────────────────────────────────────────────────────

const WEB_SEARCH_CSS = `
.ws-layout {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 15px;
  align-items: stretch;
}
@media (max-width: 860px) { .ws-layout { grid-template-columns: 1fr; } }
.ws-full-card { grid-column: 1 / -1; }

.ws-layout > .sv-card {
  display: flex;
  flex-direction: column;
}

.ws-layout > .sv-card > .sv-card-body {
  flex: 1;
}

/* ── Provider grid ── */
.wsp-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 14px;
  padding-top: 14px;
}

.wsp-card {
  border: 1px solid var(--color-border-subtle);
  border-radius: 9px;
  padding: 13px 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: var(--color-surface);
  transition: border-color 0.15s;
}
.wsp-card.active { border-color: rgba(239,124,47,0.35); }

.wsp-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.wsp-provider-info { display: flex; align-items: center; gap: 10px; min-width: 0; }

.wsp-provider-avatar {
  width: 34px; height: 34px;
  border-radius: 7px;
  background: rgba(239,124,47,0.14);
  color: var(--color-primary);
  font-size: 13px; font-weight: 800;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0; text-transform: uppercase;
}
.wsp-provider-name { font-size: 12px; font-weight: 700; color: var(--color-text); line-height: 1.25; }
.wsp-provider-name .pv-origin-badge { display: inline-flex; align-items: center; font-size: 10px; color: var(--color-text-muted); background: var(--color-surface); border: 1px solid var(--color-border); padding: 2px 5px; border-radius: 4px; font-weight: 600; margin-left: 8px; vertical-align: middle; }
.wsp-card-right { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }

.wsp-status-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
.wsp-status-dot.ready { background: var(--color-success, #6faf7b); }
.wsp-status-dot.warn  { background: #f59e0b; }

.wsp-fields { display: flex; flex-direction: column; gap: 9px; }
.wsp-field  { display: flex; flex-direction: column; gap: 5px; }
.wsp-field label {
  font-size: 10px; font-weight: 700; color: var(--color-text-muted);
  text-transform: uppercase; letter-spacing: 0.04em;
}
.wsp-field input {
  width: 100%;
  background: var(--color-bg);
  border: 1.5px solid var(--color-border);
  color: var(--color-text);
  border-radius: 6px;
  padding: 7px 8px;
  font-size: 11px;
  outline: none;
  transition: border-color 0.15s;
  box-sizing: border-box;
}
.wsp-field input:focus { border-color: var(--color-primary); }

.wsp-input-wrap { position: relative; }
.wsp-missing-key {
  position: absolute; right: 8px; top: 50%; transform: translateY(-50%);
  font-size: 10px; font-weight: 700; color: #f59e0b; pointer-events: none;
}

.wsp-basic-auth-label {
  font-size: 10px; font-weight: 700; color: var(--color-text-muted);
  text-transform: uppercase; letter-spacing: 0.04em;
  padding-bottom: 2px; border-bottom: 1px solid var(--color-border-subtle);
  margin-bottom: 2px;
}
.wsp-optional { font-weight: 400; text-transform: none; letter-spacing: 0; font-style: italic; }

.wsp-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }

.wsp-test-btn {
  display: flex; align-items: center; gap: 4px;
  border: 1px solid var(--color-border-subtle);
  background: transparent;
  color: var(--color-text-secondary);
  border-radius: 5px;
  padding: 4px 7px;
  font-size: 10px; font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}
.wsp-test-btn:hover:not(:disabled) { border-color: var(--color-primary); color: var(--color-primary); }
.wsp-test-btn:disabled { opacity: 0.5; cursor: default; }

.wsp-save-btn {
  background: var(--color-primary); color: white;
  border: none; border-radius: 5px; padding: 4px 8px;
  font-size: 10px; font-weight: 700; cursor: pointer;
  margin-left: auto; transition: opacity 0.15s;
}
.wsp-save-btn:hover:not(:disabled) { opacity: 0.88; }
.wsp-save-btn:disabled { opacity: 0.5; cursor: default; }

.wsp-test-error {
  font-size: 10px; color: var(--color-error, #c96b5c);
  max-width: 180px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

@keyframes spin { to { transform: rotate(360deg); } }
.spin { animation: spin 0.8s linear infinite; }

/* ── Global controls ── */
.ws-header-actions { display: flex; align-items: center; gap: 9px; flex-shrink: 0; }

.ws-save-btn {
  background: var(--color-primary); color: white; border: none;
  padding: 6px 15px; border-radius: 7px;
  font-weight: 600; font-size: 12px; cursor: pointer; transition: opacity 0.15s;
}
.ws-save-btn:hover:not(:disabled) { opacity: 0.88; }
.ws-save-btn:disabled { opacity: 0.5; cursor: default; }

.ws-saved-badge {
  font-size: 11px; font-weight: 600; color: var(--color-success);
  background: rgba(111,175,123,0.12); padding: 4px 8px; border-radius: 5px;
}

.ws-error-inline {
  font-size: 11px; color: var(--color-error);
  background: rgba(201,107,92,0.1); border: 1px solid rgba(201,107,92,0.3);
  padding: 4px 8px; border-radius: 5px;
  max-width: 320px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

.ws-loading { color: var(--color-text-muted); font-size: 12px; padding: 28px 0; }
.ws-field-hint { font-size: 10px; color: var(--color-text-muted); margin-top: 4px; }

.ws-toggle {
  position: relative; display: inline-flex; align-items: center;
  cursor: pointer; flex-shrink: 0;
}
.ws-toggle input { position: absolute; opacity: 0; width: 0; height: 0; }
.ws-toggle-slider {
  display: block; width: 44px; height: 24px;
  background: var(--color-border); border-radius: 9px;
  transition: background 0.2s; position: relative;
}
.ws-toggle-slider::after {
  content: ''; position: absolute; top: 3px; left: 3px;
  width: 18px; height: 18px; background: white; border-radius: 50%;
  transition: transform 0.2s; box-shadow: 0 1px 3px rgba(0,0,0,0.2);
}
.ws-toggle input:checked + .ws-toggle-slider { background: var(--color-primary); }
.ws-toggle input:checked + .ws-toggle-slider::after { transform: translateX(20px); }

/* ── Domain Catalog premium grid ── */
.dc-root {
  background: var(--color-bg);
  border: 1.5px solid var(--color-border);
  border-radius: 11px;
  overflow: hidden;
}

.dc-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 13px 17px;
  border-bottom: 1px solid var(--color-border);
  gap: 12px;
}

.dc-header-left {
  display: flex;
  align-items: center;
  gap: 11px;
}

.dc-header-icon {
  width: 40px; height: 40px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  color: var(--color-primary);
  flex-shrink: 0;
}

.dc-header-title {
  font-size: 14px; font-weight: 700; color: var(--color-text);
}
.dc-header-sub {
  font-size: 11px; color: var(--color-text-muted); margin-top: 2px;
}
.dc-org-policy-note {
  font-size: 10px; color: var(--color-text-muted); margin-top: 6px;
  display: flex; align-items: center; gap: 4px;
}

.dc-save-btn {
  display: flex; align-items: center; gap: 5px;
  background: var(--color-surface);
  border: 1.5px solid var(--color-border);
  color: var(--color-text-secondary);
  border-radius: 7px;
  padding: 6px 13px;
  font-size: 11px; font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  transition: border-color 0.15s, background 0.15s;
  flex-shrink: 0;
}
.dc-save-btn:hover:not(:disabled) { border-color: var(--color-primary); color: var(--color-primary); }
.dc-save-btn:disabled { opacity: 0.5; cursor: default; }
.dc-save-btn-saved {
  border-color: rgba(111,175,123,0.45) !important;
  color: var(--color-success) !important;
  background: rgba(111,175,123,0.08) !important;
}

.dc-cats { display: flex; flex-direction: column; }

.dc-cat { border-bottom: 1px solid var(--color-border); }
.dc-cat:last-child { border-bottom: none; }

.dc-cat-head {
  width: 100%;
  display: flex;
  align-items: center;
  padding: 10px 17px;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--color-text);
  gap: 8px;
  transition: background 0.12s;
  text-align: left;
}
.dc-cat-head:hover { background: var(--color-hover); }

.dc-cat-chevron { color: var(--color-text-muted); flex-shrink: 0; }
.dc-cat-end-chevron { color: var(--color-text-muted); flex-shrink: 0; }

.dc-cat-name {
  flex: 1;
  font-size: 13px;
  font-weight: 700;
  color: var(--color-text);
}

.dc-cat-count {
  font-size: 11px;
  font-weight: 600;
  flex-shrink: 0;
}
.dc-count-active { color: var(--color-primary); }
.dc-count-sep { color: var(--color-text-muted); }

/* 4-column domain grid */
.dc-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  padding: 10px 17px 14px;
  background: var(--color-surface);
  border-top: 1px solid var(--color-border);
}
@media (max-width: 1100px) { .dc-grid { grid-template-columns: repeat(3, 1fr); } }
@media (max-width: 800px)  { .dc-grid { grid-template-columns: repeat(2, 1fr); } }

.dc-card {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 9px;
  background: var(--color-bg);
  border: 1px solid var(--color-border-subtle, var(--color-border));
  border-radius: 9px;
  cursor: pointer;
  transition: border-color 0.13s, background 0.13s;
  min-width: 0;
}
.dc-card:hover { background: var(--color-hover); border-color: var(--color-border); }
.dc-card-active { border-color: rgba(239,124,47,0.2); }

.dc-favicon {
  width: 22px; height: 22px;
  border-radius: 4px;
  object-fit: contain;
  flex-shrink: 0;
  background: var(--color-surface);
}

.dc-favicon-fallback {
  width: 22px; height: 22px;
  border-radius: 4px;
  background: rgba(239,124,47,0.14);
  color: var(--color-primary);
  font-size: 10px; font-weight: 800;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}

.dc-card-name {
  flex: 1;
  font-size: 10px;
  font-weight: 500;
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.dc-dot {
  width: 16px; height: 16px;
  border-radius: 50%;
  flex-shrink: 0;
  transition: background 0.15s, box-shadow 0.15s;
}
.dc-dot-on {
  background: var(--color-primary);
  box-shadow: 0 0 0 3px rgba(239,124,47,0.18);
}
.dc-dot-off {
  background: var(--color-border);
}
`
