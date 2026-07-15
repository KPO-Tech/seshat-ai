import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { components } from '@/api/schema'
import { PROVIDER_SETTINGS_LIST_KEY, EMBEDDER_SETTING_KEY } from '@/api/settingsQueryKeys'

export type ProviderSetting = components['schemas']['ProviderSetting']
export type ProviderSettingInput = components['schemas']['ProviderSettingInput']
export type ProviderSettingUpdateInput = components['schemas']['ProviderSettingUpdateInput']

const LIST_KEY = PROVIDER_SETTINGS_LIST_KEY

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

// Configuring a provider setting (mistral/openai, with an api_key) may have
// auto-configured this organization's embedder setting server-side too
// (see seshat-server's autoConfigureEmbedderFromProvider) - invalidate both
// so the console reflects that without a manual refresh.
export function useCreateProviderSetting() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: ProviderSettingInput) => {
      const { data, error } = await api.POST('/api/v1/provider-settings', { body })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [LIST_KEY] })
      queryClient.invalidateQueries({ queryKey: [EMBEDDER_SETTING_KEY] })
    },
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [LIST_KEY] })
      queryClient.invalidateQueries({ queryKey: [EMBEDDER_SETTING_KEY] })
    },
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

// Only meaningful for provider "ollama" - a self-hosted instance's
// installed models can't be known ahead of time, unlike every other
// provider's static console-side catalog. Always resolves (never throws) so
// a form can fall back to manual model entry on failure.
export function useDetectProviderModels() {
  return useMutation({
    mutationFn: async (body: { provider: string; base_url?: string }) => {
      const { data, error } = await api.POST('/api/v1/provider-settings/detect-models', { body })
      if (error) throw error
      return data
    },
  })
}
