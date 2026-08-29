import { useEffect, useState } from 'react'
import { api } from '@/api/client'

export type AppVersionStatus = {
  minAppVersion?: string
  outdated: boolean
}

// useAppVersionStatus reads this device's last-synced app-version-restriction
// status from seshat-backend's local /automation/status (see
// cloudautomation.VersionStore) - the same endpoint useDesktopPolicies reads,
// fetched independently here since this is a genuinely separate system (see
// docs/helps/audit-2026-08-29-openwork-den-comparison.md § 5, Étape 8), not
// part of the desktop policies bundle. Fails quiet (not outdated) on any
// error or in standalone mode, matching the warning-only, never-blocking
// design: "we don't know" must never render as "you're outdated."
export function useAppVersionStatus(): AppVersionStatus & { loading: boolean } {
  const [status, setStatus] = useState<AppVersionStatus>({ outdated: false })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    api
      .get<{ min_app_version?: string; app_version_outdated?: boolean }>('/automation/status')
      .then((data) => {
        if (!cancelled) {
          setStatus({ minAppVersion: data?.min_app_version, outdated: data?.app_version_outdated ?? false })
        }
      })
      .catch(() => {
        // Standalone mode (no cloud automation configured) or a transient
        // error - leave the default (not outdated).
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return { ...status, loading }
}
