import { useCallback, useEffect, useState } from 'react'
import { api } from '@/api/client'
import type { DesktopPolicy, OrgDesktopPolicyBinding } from '@/api/types'

// useAdminDesktopPolicyCatalog — the fixed, code-defined catalog of what CAN
// be restricted. Not organization-specific, fetched once.
export function useAdminDesktopPolicyCatalog() {
  const [catalog, setCatalog] = useState<DesktopPolicy[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    api.get<{ desktop_policies: DesktopPolicy[] }>('/admin/desktop-policies/catalog')
      .then((data) => { if (!cancelled) setCatalog(data?.desktop_policies ?? []) })
      .catch(() => { if (!cancelled) setCatalog([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  return { catalog, loading }
}

// useAdminDesktopPolicyBindings — Admin Console's own Desktop Policies tab.
// These bindings already actively control this exact device's behavior (see
// hooks/useDesktopPolicies.ts) - this hook is what finally lets an org
// admin see and manage them from the desktop app.
export function useAdminDesktopPolicyBindings() {
  const [bindings, setBindings] = useState<OrgDesktopPolicyBinding[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.get<{ desktop_policy_bindings: OrgDesktopPolicyBinding[]; count: number }>('/admin/desktop-policy-bindings')
      setBindings(data?.desktop_policy_bindings ?? [])
    } catch (e: unknown) {
      setBindings([])
      setError((e as { message?: string })?.message ?? 'Failed to load desktop policy bindings.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refetch()
  }, [refetch])

  return { bindings, loading, error, refetch }
}

export async function setAdminDesktopPolicyBinding(params: {
  policy_code: string
  subject_type: string
  subject_id: string
  value: boolean
}): Promise<OrgDesktopPolicyBinding> {
  return api.post('/admin/desktop-policy-bindings', params)
}

export async function deleteAdminDesktopPolicyBinding(id: string): Promise<void> {
  return api.delete(`/admin/desktop-policy-bindings/${id}`)
}
