import { useEffect, useState } from 'react'
import { api } from '@/api/client'

export type DesktopPolicies = Record<string, boolean>

// Fail-open, matching seshat-backend's PolicyStore.Allowed default: a code
// this device has never synced (standalone mode, not yet connected, or a
// policy this client knows about but an older server doesn't) must never be
// read as "blocked" - only an explicit `false` restricts anything.
export function isDesktopPolicyAllowed(policies: DesktopPolicies, code: string): boolean {
  return policies[code] ?? true
}

// useDesktopPolicies reads this device's last-synced desktop policy bundle
// from seshat-backend's local /automation/status - not cached module-wide
// like useProviderCatalog, since (unlike the provider catalog) an org admin
// can change this live and the local heartbeat refreshes it roughly every
// 30s, so each mount re-fetching the current value is the right behavior.
export function useDesktopPolicies(): { policies: DesktopPolicies; loading: boolean } {
  const [policies, setPolicies] = useState<DesktopPolicies>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    api
      .get<{ policies?: DesktopPolicies }>('/automation/status')
      .then((data) => {
        if (!cancelled) setPolicies(data?.policies ?? {})
      })
      .catch(() => {
        // Standalone mode (no cloud automation configured) or a transient
        // error - leave policies empty, which is fail-open via
        // isDesktopPolicyAllowed's own default.
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return { policies, loading }
}
