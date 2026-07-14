import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { components } from '@/api/schema'

export type ProviderSetting = components['schemas']['ProviderSetting']
export type ProviderSettingInput = components['schemas']['ProviderSettingInput']
export type ProviderSettingUpdateInput = components['schemas']['ProviderSettingUpdateInput']

const LIST_KEY = 'provider-settings'

export function useProviderSettingsList(organizationId: string | undefined) {
  return useQuery({
    queryKey: [LIST_KEY, organizationId],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/provider-settings', {
        params: { query: { organization_id: organizationId } },
      })
      if (error) throw error
      return data.provider_settings ?? []
    },
  })
}

export function useCreateProviderSetting() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: ProviderSettingInput) => {
      const { data, error } = await api.POST('/api/v1/provider-settings', { body })
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [LIST_KEY] }),
  })
}

export function useUpdateProviderSetting() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: ProviderSettingUpdateInput }) => {
      const { data, error } = await api.PUT('/api/v1/provider-settings/{providerSettingID}', {
        params: { path: { providerSettingID: id } },
        body,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [LIST_KEY] }),
  })
}

export function useDeleteProviderSetting() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.DELETE('/api/v1/provider-settings/{providerSettingID}', {
        params: { path: { providerSettingID: id } },
      })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [LIST_KEY] }),
  })
}

export function useSetProviderSettingDefault() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, isDefault }: { id: string; isDefault: boolean }) => {
      const path = isDefault
        ? '/api/v1/provider-settings/{providerSettingID}/set-default'
        : '/api/v1/provider-settings/{providerSettingID}/unset-default'
      const { data, error } = await api.POST(path, { params: { path: { providerSettingID: id } } })
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [LIST_KEY] }),
  })
}
