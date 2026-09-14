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

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

const BANNER_CLASS = 'mb-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed border-[var(--color-border)] bg-app-surface px-2.5 py-2 text-[var(--font-size-2xs)] text-app-text-secondary'
const ACTIVE_BANNER_CLASS = 'border-solid border-[rgba(var(--color-success-rgb,34,197,94),0.35)] bg-[rgba(var(--color-success-rgb,34,197,94),0.06)]'
const TEXT_CLASS = 'inline-flex items-center gap-1.5'
const ACTIONS_CLASS = 'flex flex-wrap gap-1.5'
const BUTTON_CLASS = 'inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-md border border-[var(--color-border)] bg-app-bg px-[9px] py-1 text-[var(--font-size-2xs)] font-semibold text-app-text disabled:cursor-default disabled:opacity-50'
const PRIMARY_BUTTON_CLASS = 'border-[var(--color-primary)] text-[var(--color-primary)]'

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
      <div className={cx(BANNER_CLASS, ACTIVE_BANNER_CLASS)}>
        <span className={TEXT_CLASS}>
          <CheckOne size={12} /> Using your <strong>{status.linked_name || status.linked_provider}</strong> provider key for {label}
        </span>
        <button className={BUTTON_CLASS} onClick={() => void unlink()} disabled={busy}>
          {busy ? <LoadingOne size={11} className="animate-spin" /> : <Close size={11} />} Unlink
        </button>
      </div>
    )
  }

  if (status.candidates.length === 0) return null

  return (
    <div className={BANNER_CLASS}>
      <span className={TEXT_CLASS}>You have a provider configured that can also handle {label}:</span>
      <div className={ACTIONS_CLASS}>
        {status.candidates.map((candidate) => (
          <button key={candidate.id} className={cx(BUTTON_CLASS, PRIMARY_BUTTON_CLASS)} onClick={() => void link(candidate.id)} disabled={busy}>
            {busy ? <LoadingOne size={11} className="animate-spin" /> : null} Use {candidate.name}
          </button>
        ))}
      </div>
    </div>
  )
}
