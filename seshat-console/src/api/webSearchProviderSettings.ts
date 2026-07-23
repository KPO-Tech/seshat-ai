import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { components } from '@/api/schema'

export type WebSearchProviderSetting = components['schemas']['WebSearchProviderSetting']
export type WebSearchProviderSettingInput = components['schemas']['WebSearchProviderSettingInput']
export type WebSearchProviderSettingUpdateInput = components['schemas']['WebSearchProviderSettingUpdateInput']

const LIST_KEY = 'web-search-provider-settings'

export function useWebSearchProviderSettingsList(organizationId: string | undefined) {
  return useQuery({
    queryKey: [LIST_KEY, organizationId],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/web-search-provider-settings', {
        params: { query: { organization_id: organizationId } },
      })
      if (error) throw error
      return data.web_search_provider_settings ?? []
    },
  })
}

export function useCreateWebSearchProviderSetting() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: WebSearchProviderSettingInput) => {
      const { data, error } = await api.POST('/api/v1/web-search-provider-settings', { body })
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [LIST_KEY] }),
  })
}

export function useUpdateWebSearchProviderSetting() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: WebSearchProviderSettingUpdateInput }) => {
      const { data, error } = await api.PUT('/api/v1/web-search-provider-settings/{webSearchProviderSettingID}', {
        params: { path: { webSearchProviderSettingID: id } },
        body,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [LIST_KEY] }),
  })
}

export function useDeleteWebSearchProviderSetting() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.DELETE('/api/v1/web-search-provider-settings/{webSearchProviderSettingID}', {
        params: { path: { webSearchProviderSettingID: id } },
      })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [LIST_KEY] }),
  })
}
