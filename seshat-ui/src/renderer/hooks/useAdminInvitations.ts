import { useCallback, useEffect, useState } from 'react'
import { api } from '@/api/client'
import type { OrgInvitation } from '@/api/types'

// useAdminInvitations — Admin Console's Invitations tab. A change made here
// is immediately visible in seshat-console's InvitationsPage.tsx, and vice
// versa, since both hit the same seshat-server /api/v1/invitations resource
// (proxied through seshat-backend's admin_invitations.go for this app).
export function useAdminInvitations(status: string = '') {
  const [invitations, setInvitations] = useState<OrgInvitation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const query = status ? `?status=${encodeURIComponent(status)}` : ''
      const data = await api.get<{ invitations: OrgInvitation[]; count: number }>(`/admin/invitations${query}`)
      setInvitations(data?.invitations ?? [])
    } catch (e: unknown) {
      setInvitations([])
      setError((e as { message?: string })?.message ?? 'Failed to load invitations.')
    } finally {
      setLoading(false)
    }
  }, [status])

  useEffect(() => {
    refetch()
  }, [refetch])

  return { invitations, loading, error, refetch }
}

export async function createAdminInvitation(params: {
  email: string
  role: string
  expires_in_days?: number
}): Promise<OrgInvitation> {
  return api.post('/admin/invitations', params)
}

export async function revokeAdminInvitation(id: string): Promise<void> {
  return api.post(`/admin/invitations/${id}/revoke`)
}
