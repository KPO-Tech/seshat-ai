import { useEffect, useMemo, useState } from 'react'
import { Crown, Delete, Edit } from '@icon-park/react'
import { ProviderIcon } from '@/components/ui/ProviderIcon'
import { WindowCloseIcon } from '@/components/ui/WindowControlIcon'
import { useProviderCatalog } from '@/hooks/useProviderCatalog'
import {
  useAdminProviderSettings,
  createAdminProviderSetting,
  updateAdminProviderSetting,
  deleteAdminProviderSetting,
  setAdminProviderSettingDefault,
} from '@/hooks/useAdminProviderSettings'
import { toSelectableProviders, type SelectableProvider } from '@/pages/settings/ProvidersView'
import type { OrgProviderSetting } from '@/api/types'

// AdminProvidersView — Admin Console's Providers tab. Deliberately a
// SEPARATE component from settings/ProvidersView.tsx (this device's own
// personal keys, /settings/providers): every write here goes to
// /admin/provider-settings, which seshat-backend forwards straight to
// seshat-server's real automation.ProviderSetting store - the exact one
// seshat-console's ProviderSettingsPage.tsx edits. A change made here is
// immediately visible there, and vice versa. Reuses ProvidersView's own
// CSS classes (PROVIDERS_CSS, already injected once by AdminConsolePage)
// rather than duplicating styles.
export function AdminProvidersView() {
  const { catalog } = useProviderCatalog()
  const { settings, loading, error, refetch } = useAdminProviderSettings()

  const [configuring, setConfiguring] = useState<SelectableProvider | null>(null)
  const [editing, setEditing] = useState<{ catalogEntry: SelectableProvider | null; setting: OrgProviderSetting } | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [settingDefaultId, setSettingDefaultId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  // Organization provider settings only ever use a plain API key on
  // seshat-server (automation.ProviderSetting has no auth_kind concept at
  // all) - OAuth (Codex) is excluded here even though the personal
  // catalog offers it, since there's nothing server-side to configure it
  // against.
  const addableCatalog = useMemo(
    () => toSelectableProviders(catalog).filter((p) => p.authType !== 'oauth'),
    [catalog],
  )

  const settingByProvider = new Map(settings.map((s) => [s.provider, s]))
  const seen = new Set<string>()
  const rows: Array<{ id: string; catalogEntry: SelectableProvider | null; setting: OrgProviderSetting | null }> = addableCatalog.map(
    (entry) => {
      seen.add(entry.id)
      return { id: entry.id, catalogEntry: entry, setting: settingByProvider.get(entry.id) ?? null }
    },
  )
  for (const setting of settings) {
    if (seen.has(setting.provider)) continue
    rows.push({ id: setting.provider, catalogEntry: null, setting })
  }

  async function handleDelete(id: string) {
    if (deletingId) return
    setActionError(null)
    setDeletingId(id)
    try {
      await deleteAdminProviderSetting(id)
      await refetch()
    } catch (e: unknown) {
      setActionError((e as { message?: string })?.message ?? 'Failed to delete this provider setting.')
    } finally {
      setDeletingId(null)
    }
  }

  async function handleSetDefault(id: string) {
    if (settingDefaultId) return
    setActionError(null)
    setSettingDefaultId(id)
    try {
      await setAdminProviderSettingDefault(id)
      await refetch()
    } catch (e: unknown) {
      setActionError((e as { message?: string })?.message ?? 'Failed to set this provider as default.')
    } finally {
      setSettingDefaultId(null)
    }
  }

  return (
    <div className="pv-root">
      <header className="pv-header">
        <div className="pv-header-info">
          <h1>Organization Providers</h1>
          <p>
            Shared AI provider credentials for your whole organization - configured here, they're immediately
            visible and editable in Seshat Console too.
          </p>
        </div>
      </header>

      {(error || actionError) && (
        <div className="pv-action-error">
          {error || actionError}
          <button type="button" onClick={() => { setActionError(null) }} aria-label="Dismiss">×</button>
        </div>
      )}

      {loading ? (
        <div className="pv-models-loading">Loading…</div>
      ) : (
        <div className="pv-list">
          {rows.map((row) => {
            if (!row.setting) {
              const entry = row.catalogEntry!
              return (
                <div key={row.id} className="pv-card">
                  <div className="pv-card-header pv-card-header--static">
                    <div className="pv-brand">
                      <ProviderIcon provider={entry.id} size={34} />
                      <div className="pv-meta">
                        <div className="pv-name">{entry.name}</div>
                        <div className="pv-id">{entry.desc}</div>
                      </div>
                    </div>
                    <div className="pv-card-controls">
                      <span className="pv-status-pill disconnected">Not configured</span>
                      <button className="pv-configure-btn" onClick={() => setConfiguring(entry)}>
                        Configure
                      </button>
                    </div>
                  </div>
                </div>
              )
            }

            const setting = row.setting
            const catalogEntry = row.catalogEntry
            const displayName = catalogEntry?.name ?? setting.provider

            return (
              <div key={row.id} className={`pv-card ${setting.is_default ? 'is-default' : ''}`}>
                <div className="pv-card-header pv-card-header--static">
                  <div className="pv-brand">
                    <ProviderIcon provider={setting.provider} size={34} />
                    <div className="pv-meta">
                      <div className="pv-name">
                        {displayName}
                        {setting.is_default && (
                          <span className="pv-default-provider-pill">
                            <Crown size={9} /> default
                          </span>
                        )}
                      </div>
                      <div className="pv-id">
                        {setting.provider} · {setting.default_model || 'no default model'}
                      </div>
                    </div>
                  </div>
                  <div className="pv-card-controls">
                    <span className="pv-status-pill connected">Connected</span>
                    {!setting.is_default && (
                      <button
                        className="pv-icon-btn pv-default-btn"
                        aria-label="Set as organization default"
                        onClick={() => handleSetDefault(setting.id)}
                        disabled={settingDefaultId === setting.id}
                      >
                        <Crown size={13} />
                      </button>
                    )}
                    <button
                      className="pv-icon-btn"
                      aria-label="Edit"
                      onClick={() => setEditing({ catalogEntry, setting })}
                    >
                      <Edit size={13} />
                    </button>
                    <button
                      className="pv-icon-btn"
                      aria-label="Delete"
                      onClick={() => handleDelete(setting.id)}
                      disabled={deletingId === setting.id}
                    >
                      <Delete size={13} />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {configuring && (
        <AdminProviderModal
          mode="create"
          provider={configuring}
          onClose={() => setConfiguring(null)}
          onSuccess={() => { setConfiguring(null); refetch() }}
        />
      )}
      {editing && (
        <AdminProviderModal
          mode="edit"
          provider={
            editing.catalogEntry ?? { id: editing.setting.provider, name: editing.setting.provider, desc: '', authType: 'api_key' }
          }
          existing={editing.setting}
          onClose={() => setEditing(null)}
          onSuccess={() => { setEditing(null); refetch() }}
        />
      )}
    </div>
  )
}

function AdminProviderModal({
  mode,
  provider,
  existing,
  onClose,
  onSuccess,
}: {
  mode: 'create' | 'edit'
  provider: SelectableProvider
  existing?: OrgProviderSetting
  onClose: () => void
  onSuccess: () => void
}) {
  const [apiKey, setApiKey] = useState('')
  const [defaultModel, setDefaultModel] = useState(existing?.default_model ?? '')
  const [baseUrl, setBaseUrl] = useState(existing?.base_url ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setDefaultModel(existing?.default_model ?? '')
    setBaseUrl(existing?.base_url ?? '')
    setApiKey('')
  }, [existing])

  async function handleSubmit() {
    setSubmitting(true)
    setError('')
    try {
      if (mode === 'create') {
        await createAdminProviderSetting({
          provider: provider.id,
          default_model: defaultModel || undefined,
          base_url: baseUrl || undefined,
          api_key: apiKey,
        })
      } else if (existing) {
        await updateAdminProviderSetting(existing.id, {
          default_model: defaultModel || undefined,
          base_url: baseUrl || undefined,
          api_key: apiKey || undefined,
        })
      }
      onSuccess()
    } catch (e: unknown) {
      setError((e as { message?: string })?.message ?? 'Failed to save this provider setting')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal-shell">
        <header className="modal-header">
          <h2>{mode === 'create' ? `Configure ${provider.name}` : `Edit ${provider.name}`}</h2>
          <button className="modal-close-btn" onClick={onClose}><WindowCloseIcon size={16} /></button>
        </header>
        <div className="modal-content">
          <div className="modal-field pv-configure-provider-preview">
            <ProviderIcon provider={provider.id} size={28} />
            <div>
              <div className="pv-option-name">{provider.name}</div>
              {provider.desc && <div className="pv-option-desc">{provider.desc}</div>}
            </div>
          </div>

          <div className="modal-field" style={{ marginBottom: 20 }}>
            <label>API Key {mode === 'create' ? '*' : ''}</label>
            <input
              type="password"
              placeholder={mode === 'edit' ? 'Leave empty to keep the current key' : 'Enter your API key…'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              autoFocus
            />
          </div>

          <div className="modal-field" style={{ marginBottom: 20 }}>
            <label>Default Model</label>
            <input
              type="text"
              placeholder="e.g. claude-sonnet-5"
              value={defaultModel}
              onChange={(e) => setDefaultModel(e.target.value)}
            />
          </div>

          <div className="modal-field">
            <label>Base URL <span className="modal-label-opt">(optional)</span></label>
            <input
              type="text"
              placeholder="Leave empty to use the provider's default"
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
            disabled={submitting || (mode === 'create' && !apiKey)}
            onClick={handleSubmit}
          >
            {submitting ? 'Saving…' : 'Save'}
          </button>
        </footer>
      </div>
    </div>
  )
}
