import { Caution } from '@icon-park/react'
import { useDesktopPolicies, isDesktopPolicyAllowed } from '@/hooks/useDesktopPolicies'

// The real enforcement is server-side (seshat-backend's
// requireSettingsWritable middleware rejects any write with a 403 while
// this policy is off) - this banner is purely informational, so a user
// isn't surprised by a save failing after they've already filled out a
// form. See docs/helps/audit-2026-08-29-openwork-den-comparison.md § 5 for
// why individual forms/buttons across every settings view are deliberately
// NOT disabled one by one: a single shared notice here covers the same
// ground with far less surface to get wrong or miss updating later.
export function SettingsLockedBanner() {
  const { policies } = useDesktopPolicies()
  if (isDesktopPolicyAllowed(policies, 'allow_settings_modification')) return null

  return (
    <div className="settings-locked-banner">
      <Caution size={16} />
      <span>Your organization does not allow modifying settings on this device. Changes will be rejected.</span>
    </div>
  )
}

export const SETTINGS_LOCKED_BANNER_CSS = `
.settings-locked-banner {
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
