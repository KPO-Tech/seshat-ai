import { Navigate } from 'react-router'
import { useLandingRoute } from '@/hooks/useLandingRoute'

/** Resolves where an already-authenticated user should land (e.g. `/` on a page refresh). */
export function LandingRedirect() {
  const path = useLandingRoute()
  return <Navigate to={path} replace />
}
