import { useCallback, useEffect, useState } from 'react'
import { api } from '@/api/client'
import type { OrgMembership, OrgRole } from '@/api/types'

// useAdminMemberships — Admin Console's own Users tab. Deliberately built on
// /admin/memberships (seshat-server's iam.Membership), NOT /admin/users or
// /users: the platform-wide Users resource requires the rare platform
// super-admin flag, which a normal org admin never has. A change made here
// is immediately visible in seshat-console's MembershipsPage.tsx, and vice
// versa.
export function useAdminMemberships() {
  const [memberships, setMemberships] = useState<OrgMembership[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.get<{ memberships: OrgMembership[]; count: number }>('/admin/memberships')
      setMemberships(data?.memberships ?? [])
    } catch (e: unknown) {
      setMemberships([])
      setError((e as { message?: string })?.message ?? 'Failed to load organization members.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refetch()
  }, [refetch])

  return { memberships, loading, error, refetch }
}

// useAdminRoles — read-only role catalog for the role picker (built-in
// member/admin plus any custom roles already defined via seshat-console's
// Roles page, e.g. job-title-shaped roles like "Data Scientist").
export function useAdminRoles() {
  const [roles, setRoles] = useState<OrgRole[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    api.get<{ roles: OrgRole[] }>('/admin/roles')
      .then((data) => { if (!cancelled) setRoles(data?.roles ?? []) })
      .catch(() => { if (!cancelled) setRoles([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  return { roles, loading }
}

export async function createAdminMember(params: {
  email: string
  display_name: string
  role: string
}): Promise<OrgMembership> {
  return api.post('/admin/memberships', params)
}

export async function updateAdminMembershipRole(id: string, role: string): Promise<OrgMembership> {
  return api.put(`/admin/memberships/${id}`, { role })
}

export async function deleteAdminMembership(id: string): Promise<void> {
  return api.delete(`/admin/memberships/${id}`)
}
