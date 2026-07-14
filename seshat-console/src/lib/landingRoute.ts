import type { components } from '@/api/schema'

type User = components['schemas']['User']
type Organization = components['schemas']['Organization']

/**
 * Where a signed-in user should land: a platform admin always sees the
 * platform-wide dashboard; anyone else must never see it (they may not even
 * have access to the endpoints it calls - see api/dashboard.ts) and instead
 * goes straight into their one organization, or a picker if they have more
 * than one.
 */
export function resolveLandingPath(user: User | null | undefined, organizations: Organization[]): string {
  if (user?.is_admin) return '/platform/overview'
  if (organizations.length === 1) return `/orgs/${organizations[0]!.id}/overview`
  if (organizations.length > 1) return '/my-organizations'
  return '/no-access'
}
