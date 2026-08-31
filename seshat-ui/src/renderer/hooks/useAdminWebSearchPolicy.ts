import { useCallback, useEffect, useState } from 'react'
import { api } from '@/api/client'

export type AdminWebSearchOrgPolicy = {
  allowed_domains: string[]
  blocked_domains: string[]
}

// useAdminWebSearchPolicy — Admin Console's Web Search tab. Distinct from
// WebSearchView (this device's personal provider keys/quotas,
// /settings/web-search*): the only organization-wide thing to configure
// here is the domain policy, forwarded by seshat-backend straight to
// seshat-server's real websearchsettings.OrgPolicy - the same one
// seshat-console's Web Search settings page edits.
export function useAdminWebSearchPolicy() {
  const [policy, setPolicy] = useState<AdminWebSearchOrgPolicy | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.get<AdminWebSearchOrgPolicy>('/admin/web-search-org-policy')
      setPolicy(data ?? { allowed_domains: [], blocked_domains: [] })
    } catch (e: unknown) {
      setPolicy(null)
      setError((e as { message?: string })?.message ?? 'Failed to load the organization web search policy.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refetch()
  }, [refetch])

  return { policy, loading, error, refetch }
}

export async function updateAdminWebSearchPolicy(params: {
  allowed_domains: string[]
  blocked_domains: string[]
}): Promise<AdminWebSearchOrgPolicy> {
  return api.put('/admin/web-search-org-policy', params)
}
