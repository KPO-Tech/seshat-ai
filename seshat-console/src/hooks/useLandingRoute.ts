import { useAuthStore } from '@/store/auth'
import { resolveLandingPath } from '@/lib/landingRoute'

/** Router-friendly wrapper around resolveLandingPath, reading from the auth store. */
export function useLandingRoute(): string {
  const user = useAuthStore((s) => s.user)
  const organizations = useAuthStore((s) => s.organizations)
  return resolveLandingPath(user, organizations)
}
