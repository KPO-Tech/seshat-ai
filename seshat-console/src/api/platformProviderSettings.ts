import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { components } from '@/api/schema'

export type PlatformProviderSetting = components['schemas']['PlatformProviderSetting']
export type PlatformProviderSettingInput = components['schemas']['PlatformProviderSettingInput']
export type PlatformProviderSettingUpdateInput = components['schemas']['PlatformProviderSettingUpdateInput']

const LIST_KEY = 'platform-provider-settings'

export function usePlatformProviderSettingsList() {
  return useQuery({
    queryKey: [LIST_KEY],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/platform/provider-settings')
      if (error) throw error
      return data.platform_provider_settings ?? []
    },
  })
}

export function useCreatePlatformProviderSetting() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: PlatformProviderSettingInput) => {
      const { data, error } = await api.POST('/api/v1/platform/provider-settings', { body })
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [LIST_KEY] }),
  })
}

export function useUpdatePlatformProviderSetting() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: PlatformProviderSettingUpdateInput }) => {
      const { data, error } = await api.PUT('/api/v1/platform/provider-settings/{platformProviderSettingID}', {
        params: { path: { platformProviderSettingID: id } },
        body,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [LIST_KEY] }),
  })
}

export function useDeletePlatformProviderSetting() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.DELETE('/api/v1/platform/provider-settings/{platformProviderSettingID}', {
        params: { path: { platformProviderSettingID: id } },
      })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [LIST_KEY] }),
  })
}
