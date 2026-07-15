import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { components } from '@/api/schema'
import { EMBEDDER_SETTING_KEY, PROVIDER_SETTINGS_LIST_KEY } from '@/api/settingsQueryKeys'

export type EmbedderSetting = components['schemas']['EmbedderSetting']
export type EmbedderSettingInput = components['schemas']['EmbedderSettingInput']

const ORG_KEY = EMBEDDER_SETTING_KEY

// A singleton per organization (at most one embedder each) - see
// EmbedderSetting's doc comment on the backend for why. A 404 just means
// "not configured yet", not an error to surface loudly. Falls back to
// whichever organization is currently flagged the platform default when
// this org has none of its own (see OrganizationsPage's "Set as default"
// action) - resolved server-side, transparent to this hook.

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

// Configuring an embedder (openai + a mistral/openai base_url, with an
// api_key) may have auto-configured this organization's LLM provider
// setting server-side too (see seshat-server's
// autoConfigureProviderFromEmbedder) - invalidate both so the console
// reflects that without a manual refresh.
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
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [ORG_KEY, variables.organizationId] })
      queryClient.invalidateQueries({ queryKey: [PROVIDER_SETTINGS_LIST_KEY] })
    },
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

// A static curated list for OpenAI-compatible providers, or a live probe of
// an Ollama instance's installed models classified as embedding-capable -
// a self-hosted Ollama's installed models can't be known ahead of time.
// Always resolves (never throws) so the form can fall back to manual entry.
export function useDetectEmbedderModels() {
  return useMutation({
    mutationFn: async (body: { provider: string; base_url?: string }) => {
      const { data, error } = await api.POST('/api/v1/embedder-settings/detect-models', { body })
      if (error) throw error
      return data
    },
  })
}
