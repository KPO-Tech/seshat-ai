import { useCallback, useEffect, useState } from 'react'
import { api } from '@/api/client'
import type { OrgTeam } from '@/api/types'

// useAdminTeams — Admin Console's own Teams tab. Replaced the old local,
// per-device "Groups" feature-permission bundle: every call here goes to
// /admin/teams, which seshat-backend forwards straight to seshat-server's
// real iam.Group store - the same one seshat-console's TeamsPage.tsx edits.
// A change made from either place is immediately visible in the other.
export function useAdminTeams() {
  const [teams, setTeams] = useState<OrgTeam[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.get<{ teams: OrgTeam[]; count: number }>('/admin/teams')
      setTeams(data?.teams ?? [])
    } catch (e: unknown) {
      setTeams([])
      setError((e as { message?: string })?.message ?? 'Failed to load organization teams.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refetch()
  }, [refetch])

  return { teams, loading, error, refetch }
}

export async function createAdminTeam(params: {
  name: string
  slug: string
  description?: string
  member_user_ids?: string[]
}): Promise<OrgTeam> {
  return api.post('/admin/teams', params)
}

export async function updateAdminTeam(
  id: string,
  params: { name: string; slug: string; description?: string; member_user_ids?: string[] },
): Promise<OrgTeam> {
  return api.put(`/admin/teams/${id}`, params)
}

export async function deleteAdminTeam(id: string): Promise<void> {
  return api.delete(`/admin/teams/${id}`)
}
