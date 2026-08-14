import { useCallback, useEffect, useState } from 'react'
import { CheckOne, Close, LoadingOne } from '@icon-park/react'
import { api } from '@/api/client'

export type CapabilityId = 'image' | 'audio' | 'embeddings'

// base_url/model are only populated for 'embeddings' candidates - see
// seshat-backend's internal/settings/capabilities.go EmbedderDefaultsFor.
export type Candidate = { id: string; provider: string; name: string; base_url?: string; model?: string }

export type CapabilityStatus = {
  capability: string
  linked_provider_id?: string
  linked_provider?: string
  linked_name?: string
  candidates: Candidate[]
}

/**
 * Backs image generation, audio (TTS/STT), and embeddings' reuse of an
 * already-configured chat provider's key — see seshat-backend's
 * internal/db/capability_links.go. As of 2026-08-13 the FIRST compatible
 * provider gets linked automatically the moment it's saved in AI Providers
 * (internal/api/capability_autolink.go) — this hook/banner is for seeing
 * that link, switching to a different configured candidate, or unlinking,
 * not for the initial opt-in anymore.
 */
export function useCapabilityLink(capability: CapabilityId) {
  const [status, setStatus] = useState<CapabilityStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const res = await api.get<{ capabilities: CapabilityStatus[] }>('/settings/capability-links')
      setStatus(res.capabilities.find((c) => c.capability === capability) ?? null)
    } catch {
      setStatus(null)
    } finally {
      setLoading(false)
    }
  }, [capability])

  useEffect(() => { void refresh() }, [refresh])

  async function link(providerSettingId: string) {
    setBusy(true)
    try {
      await api.put(`/settings/capability-links/${capability}`, { provider_setting_id: providerSettingId })
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  async function unlink() {
    setBusy(true)
    try {
      await api.delete(`/settings/capability-links/${capability}`)
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  return { status, loading, busy, link, unlink }
}

/**
 * Renders nothing when there's no compatible provider configured yet (no
 * link to offer, nothing worth showing) - callers just drop this in near
 * their own manual-key field and it stays invisible until relevant.
 */
export function CapabilityLinkBanner({ capability, label }: { capability: CapabilityId; label: string }) {
  const { status, loading, busy, link, unlink } = useCapabilityLink(capability)

  if (loading || !status) return null

  if (status.linked_provider_id) {
    return (
      <div className="cap-link-banner cap-link-active">
        <span className="cap-link-text">
          <CheckOne size={12} /> Using your <strong>{status.linked_name || status.linked_provider}</strong> provider key for {label}
        </span>
        <button className="cap-link-btn" onClick={() => void unlink()} disabled={busy}>
          {busy ? <LoadingOne size={11} className="spin" /> : <Close size={11} />} Unlink
        </button>
      </div>
    )
  }

  if (status.candidates.length === 0) return null

  return (
    <div className="cap-link-banner">
      <span className="cap-link-text">You have a provider configured that can also handle {label}:</span>
      <div className="cap-link-actions">
        {status.candidates.map((candidate) => (
          <button key={candidate.id} className="cap-link-btn cap-link-btn-primary" onClick={() => void link(candidate.id)} disabled={busy}>
            {busy ? <LoadingOne size={11} className="spin" /> : null} Use {candidate.name}
          </button>
        ))}
      </div>
    </div>
  )
}

export const CAPABILITY_LINK_CSS = `
.cap-link-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--color-surface);
  border: 1px dashed var(--color-border);
  font-size: var(--font-size-2xs);
  color: var(--color-text-secondary);
  margin-bottom: 8px;
}
.cap-link-active {
  border-style: solid;
  border-color: rgba(var(--color-success-rgb, 34, 197, 94), 0.35);
  background: rgba(var(--color-success-rgb, 34, 197, 94), 0.06);
}
.cap-link-text { display: inline-flex; align-items: center; gap: 6px; }
.cap-link-actions { display: flex; gap: 6px; flex-wrap: wrap; }
.cap-link-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 9px;
  border: 1px solid var(--color-border);
  background: var(--color-bg);
  color: var(--color-text);
  border-radius: 6px;
  font-size: var(--font-size-2xs);
  font-weight: 600;
  cursor: pointer;
  flex-shrink: 0;
}
.cap-link-btn:disabled { opacity: 0.5; cursor: default; }
.cap-link-btn-primary { border-color: var(--color-primary); color: var(--color-primary); }
`
