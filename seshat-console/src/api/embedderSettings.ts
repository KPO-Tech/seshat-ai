import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { components } from '@/api/schema'

export type EmbedderSetting = components['schemas']['EmbedderSetting']
export type EmbedderSettingInput = components['schemas']['EmbedderSettingInput']
export type PlatformEmbedderSetting = components['schemas']['PlatformEmbedderSetting']

const ORG_KEY = 'embedder-setting'
const PLATFORM_KEY = 'platform-embedder-setting'

// Both endpoints are singletons (at most one embedder per organization,
// one platform-wide default) — see EmbedderSetting's doc comment on the
// backend for why. A 404 just means "not configured yet", not an error to
// surface loudly.

export function useEmbedderSetting(organizationId: string | undefined) {
  return useQuery({
    queryKey: [ORG_KEY, organizationId],
    enabled: Boolean(organizationId),
    retry: false,
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/v1/embedder-settings', {
        params: { query: { organization_id: organizationId! } },
      })
      if (response.status === 404) return null
      if (error) throw error
      return data ?? null
    },
  })
}

export function useSetEmbedderSetting() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ organizationId, body }: { organizationId: string; body: EmbedderSettingInput }) => {
      const { data, error } = await api.PUT('/api/v1/embedder-settings', {
        body: { ...body, organization_id: organizationId },
      })
      if (error) throw error
      return data
    },
    onSuccess: (_data, variables) => queryClient.invalidateQueries({ queryKey: [ORG_KEY, variables.organizationId] }),
  })
}

export function useDeleteEmbedderSetting() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (organizationId: string) => {
      const { error } = await api.DELETE('/api/v1/embedder-settings', {
        params: { query: { organization_id: organizationId } },
      })
      if (error) throw error
    },
    onSuccess: (_data, organizationId) => queryClient.invalidateQueries({ queryKey: [ORG_KEY, organizationId] }),
  })
}

export function usePlatformEmbedderSetting() {
  return useQuery({
    queryKey: [PLATFORM_KEY],
    retry: false,
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/v1/platform/embedder-settings')
      if (response.status === 404) return null
      if (error) throw error
      return data ?? null
    },
  })
}

export function useSetPlatformEmbedderSetting() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: EmbedderSettingInput) => {
      const { data, error } = await api.PUT('/api/v1/platform/embedder-settings', { body })
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [PLATFORM_KEY] }),
  })
}

export function useDeletePlatformEmbedderSetting() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { error } = await api.DELETE('/api/v1/platform/embedder-settings')
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [PLATFORM_KEY] }),
  })
}
