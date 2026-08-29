import { Caution } from '@icon-park/react'
import { useAppVersionStatus } from '@/hooks/useAppVersionStatus'

// Warning-only, per the desktop policies plan's Étape 8 decision: unlike
// SettingsLockedBanner (a real server-enforced restriction), nothing here
// blocks anything - this device keeps working exactly as before. The banner
// exists purely so a user on an old build finds out from Seshat itself
// instead of a future support conversation.
export function AppVersionWarningBanner() {
  const { minAppVersion, outdated } = useAppVersionStatus()
  if (!outdated) return null

  return (
    <div className="app-version-warning-banner">
      <Caution size={16} />
      <span>
        This device is running an outdated version of Seshat
        {minAppVersion ? ` (your organization requires at least ${minAppVersion})` : ''}. Please update when you
        can.
      </span>
    </div>
  )
}

export const APP_VERSION_WARNING_BANNER_CSS = `
.app-version-warning-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  margin-bottom: 16px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-warning) 12%, transparent);
  color: var(--color-warning);
  font-size: 13px;
  font-weight: 500;
}
`
