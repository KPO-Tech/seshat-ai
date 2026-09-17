import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { components } from '@/api/schema'
import { RERANKER_SETTING_KEY } from '@/api/settingsQueryKeys'

export type RerankerSetting = components['schemas']['RerankerSetting']
export type RerankerSettingInput = components['schemas']['RerankerSettingInput']

const ORG_KEY = RERANKER_SETTING_KEY

// A singleton per organization (at most one reranker each). Unlike the
// embedder, a 404 here is a fully normal "no second pass configured" state
// with no platform-default fallback to consider - search works fine
// without one.
export function useRerankerSetting(organizationId: string | undefined) {
  return useQuery({
    queryKey: [ORG_KEY, organizationId],
    enabled: Boolean(organizationId),
    retry: false,
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/v1/reranker-settings', {
        params: { query: { organization_id: organizationId! } },
      })
      if (response.status === 404) return null
      if (error) throw error
      return data ?? null
    },
  })
}

export function useSetRerankerSetting() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ organizationId, body }: { organizationId: string; body: RerankerSettingInput }) => {
      const { data, error } = await api.PUT('/api/v1/reranker-settings', {
        body: { ...body, organization_id: organizationId },
      })
      if (error) throw error
      return data
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [ORG_KEY, variables.organizationId] })
    },
  })
}

export function useDeleteRerankerSetting() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (organizationId: string) => {
      const { error } = await api.DELETE('/api/v1/reranker-settings', {
        params: { query: { organization_id: organizationId } },
      })
      if (error) throw error
    },
    onSuccess: (_data, organizationId) => queryClient.invalidateQueries({ queryKey: [ORG_KEY, organizationId] }),
  })
}

// Probes a self-hosted TEI instance's /info endpoint and returns the
// model_id it reports. Always resolves (never throws) so the form can fall
// back to manual entry - a non-TEI endpoint just comes back as an error
// string in the response body, not an HTTP error.
export function useDetectRerankerModel() {
  return useMutation({
    mutationFn: async (body: { base_url: string }) => {
      const { data, error } = await api.POST('/api/v1/reranker-settings/detect-model', { body })
      if (error) throw error
      return data
    },
  })
}
