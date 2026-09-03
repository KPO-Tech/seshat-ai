import { useCallback, useEffect, useState } from 'react'
import { api } from '@/api/client'
import type { ConnectorOAuthApp } from '@/api/types'

// useAdminConnectorOAuthApps — Admin Console's own Connectors tab. Every
// call here goes to /admin/connector-oauth-apps, which seshat-backend
// forwards straight to seshat-server's real connectors.Service store - the
// same one seshat-console's ConnectorsPage.tsx "OAuth apps" modal edits. A
// change made from either place is immediately visible in the other.
export function useAdminConnectorOAuthApps() {
  const [apps, setApps] = useState<ConnectorOAuthApp[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.get<{ oauth_apps: ConnectorOAuthApp[]; count: number }>('/admin/connector-oauth-apps')
      setApps(data?.oauth_apps ?? [])
    } catch (e: unknown) {
      setApps([])
      setError((e as { message?: string })?.message ?? 'Failed to load organization connector apps.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refetch()
  }, [refetch])

  return { apps, loading, error, refetch }
}

export async function registerAdminConnectorOAuthApp(
  kind: string,
  params: { client_id: string; client_secret?: string; subdomain?: string },
): Promise<ConnectorOAuthApp> {
  return api.put(`/admin/connector-oauth-apps/${encodeURIComponent(kind)}`, params)
}
