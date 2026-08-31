import { useEffect, useState } from 'react'
import { useAdminWebSearchPolicy, updateAdminWebSearchPolicy } from '@/hooks/useAdminWebSearchPolicy'

// AdminWebSearchView — Admin Console's Web Search tab. Deliberately a
// SEPARATE component from settings/WebSearchView.tsx (this device's own
// personal provider keys/quotas, /settings/web-search*): the only
// organization-wide thing to configure here is the domain policy, written
// straight to seshat-server's real websearchsettings.OrgPolicy - the exact
// one seshat-console's Web Search settings page edits. Unlike LLM
// providers, there is no org-wide web-search "provider" concept at all on
// seshat-server (every provider credential is personal, per user), so
// there's no list here - just the one policy resource. Reuses
// ProvidersView's CSS classes (PROVIDERS_CSS, already injected once by
// AdminConsolePage).
export function AdminWebSearchView() {
  const { policy, loading, error, refetch } = useAdminWebSearchPolicy()
  const [allowedText, setAllowedText] = useState('')
  const [blockedText, setBlockedText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!policy) return
    setAllowedText(policy.allowed_domains.join('\n'))
    setBlockedText(policy.blocked_domains.join('\n'))
  }, [policy])

  function parseDomains(text: string): string[] {
    return text
      .split(/\n|,/)
      .map((line) => line.trim())
      .filter(Boolean)
  }

  async function handleSave() {
    setSubmitting(true)
    setSaveError(null)
    setSaved(false)
    try {
      await updateAdminWebSearchPolicy({
        allowed_domains: parseDomains(allowedText),
        blocked_domains: parseDomains(blockedText),
      })
      await refetch()
      setSaved(true)
    } catch (e: unknown) {
      setSaveError((e as { message?: string })?.message ?? 'Failed to save the organization web search policy.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="pv-root">
      <header className="pv-header">
        <div className="pv-header-info">
          <h1>Organization Web Search Policy</h1>
          <p>
            Domain restrictions applied to every member's web search, regardless of which provider they use.
            Blocked domains are always applied; allowed domains are additive. Configured here, they're immediately
            visible and editable in Seshat Console too.
          </p>
        </div>
      </header>

      {(error || saveError) && (
        <div className="pv-action-error">
          {error || saveError}
          <button type="button" onClick={() => setSaveError(null)} aria-label="Dismiss">×</button>
        </div>
      )}

      {loading ? (
        <div className="pv-models-loading">Loading…</div>
      ) : (
        <div className="pv-card">
          <div className="pv-card-body" style={{ borderTop: 'none' }}>
            <div className="pv-body-layout" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <div className="pv-config-form">
                <div className="pv-form-field">
                  <label>Allowed domains</label>
                  <textarea
                    className="admin-domain-textarea"
                    rows={8}
                    placeholder="one domain per line, e.g. wikipedia.org"
                    value={allowedText}
                    onChange={(e) => setAllowedText(e.target.value)}
                  />
                </div>
              </div>
              <div className="pv-config-form">
                <div className="pv-form-field">
                  <label>Blocked domains</label>
                  <textarea
                    className="admin-domain-textarea"
                    rows={8}
                    placeholder="one domain per line, e.g. competitor.com"
                    value={blockedText}
                    onChange={(e) => setBlockedText(e.target.value)}
                  />
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
              <button className="pv-configure-btn" onClick={handleSave} disabled={submitting}>
                {submitting ? 'Saving…' : 'Save'}
              </button>
              {saved && <span className="pv-status-pill connected">Saved</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
