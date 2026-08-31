import { Navigate, Outlet } from 'react-router'
import { useOrgMode } from '@/api/auth'
import { useLandingRoute } from '@/hooks/useLandingRoute'

/**
 * Guards routes that only make sense when more than one organization can
 * exist on this deployment (the platform admin's "Organizations" list,
 * "My Organizations") - see
 * docs/helps/audit-2026-08-29-openwork-den-comparison.md, "org_mode"
 * architecture item. Defense in depth: the nav links to these are already
 * hidden/adjusted in single mode (see nav.tsx/AppLayout.tsx), this covers a
 * direct URL, bookmark, or browser-back landing on one of them instead.
 * Redirects to each user's own normal landing route (not a fixed path) -
 * this guard wraps both a superadmin-only route (/platform/organizations)
 * and a plain-member one (/my-organizations), so there's no single fixed
 * destination that's valid for both. Renders its children while org_mode
 * is still unresolved, matching useOrgMode's own "assume multi until
 * proven single" default.
 */
export function RedirectIfOrgModeSingle() {
  const orgMode = useOrgMode()
  const landingRoute = useLandingRoute()
  if (orgMode === 'single') return <Navigate to={landingRoute} replace />
  return <Outlet />
}
