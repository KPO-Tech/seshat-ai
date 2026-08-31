import { useMutation } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { components } from '@/api/schema'

export type SSOProviderMatch = components['schemas']['SSOProviderMatch']

// useSSOLookup — pre-login discovery step (see
// docs/helps/audit-2026-08-29-openwork-den-comparison.md § 9bis). Returns
// null (not an error) when the email's domain doesn't match any configured
// provider - the server itself never errors for a non-match either.
export function useSSOLookup() {
  return useMutation({
    mutationFn: async (email: string): Promise<SSOProviderMatch | null> => {
      const { data, error } = await api.POST('/api/v1/auth/sso-lookup', { body: { email } })
      if (error) throw error
      return (data as SSOProviderMatch)?.provider_id ? (data as SSOProviderMatch) : null
    },
  })
}

// ssoStartPath builds the URL for the browser to navigate to directly
// (window.location.href, not fetch - the login start endpoint is public
// and redirects the browser to the identity provider itself).
export function ssoStartPath(match: SSOProviderMatch, redirectURI: string): string {
  const kindSegment = match.kind === 'saml' ? 'saml' : 'oidc'
  return `/api/v1/auth/${kindSegment}/${match.provider_id}/start?redirect_uri=${encodeURIComponent(redirectURI)}`
}
