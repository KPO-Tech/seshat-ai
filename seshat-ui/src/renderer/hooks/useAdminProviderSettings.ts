import { useCallback, useEffect, useState } from 'react'
import { api } from '@/api/client'
import type { OrgProviderSetting } from '@/api/types'

// useAdminProviderSettings — Admin Console's own Providers tab. Distinct
// from useProviders (this device's personal keys, /settings/providers):
// every call here goes to /admin/provider-settings, which seshat-backend
// forwards straight to seshat-server's real automation.ProviderSetting
// store - the same one seshat-console's ProviderSettingsPage.tsx edits. A
// change made from either place is immediately visible in the other.
export function useAdminProviderSettings() {
  const [settings, setSettings] = useState<OrgProviderSetting[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.get<{ provider_settings: OrgProviderSetting[]; count: number }>('/admin/provider-settings')
      setSettings(data?.provider_settings ?? [])
    } catch (e: unknown) {
      setSettings([])
      setError((e as { message?: string })?.message ?? 'Failed to load organization provider settings.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refetch()
  }, [refetch])

  return { settings, loading, error, refetch }
}

export async function createAdminProviderSetting(params: {
  provider: string
  default_model?: string
  base_url?: string
  api_key: string
}): Promise<OrgProviderSetting> {
  return api.post('/admin/provider-settings', params)
}

export async function updateAdminProviderSetting(
  id: string,
  params: { default_model?: string; base_url?: string; api_key?: string },
): Promise<OrgProviderSetting> {
  return api.put(`/admin/provider-settings/${id}`, params)
}

export async function deleteAdminProviderSetting(id: string): Promise<void> {
  return api.delete(`/admin/provider-settings/${id}`)
}

export async function setAdminProviderSettingDefault(id: string): Promise<OrgProviderSetting> {
  return api.post<OrgProviderSetting>(`/admin/provider-settings/${id}/set-default`, {})
}
