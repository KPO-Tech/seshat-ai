import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { components } from '@/api/schema'

export type AgentPreset = components['schemas']['AgentPreset']
export type AgentPresetInput = components['schemas']['AgentPresetInput']
export type AgentPresetUpdateInput = components['schemas']['AgentPresetUpdateInput']

const LIST_KEY = 'agent-presets'

export function useAgentPresetsList(organizationId: string | undefined) {
  return useQuery({
    queryKey: [LIST_KEY, organizationId],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/agent-presets', {
        params: { query: { organization_id: organizationId } },
      })
      if (error) throw error
      return data.agent_presets ?? []
    },
  })
}

export function useCreateAgentPreset() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: AgentPresetInput) => {
      const { data, error } = await api.POST('/api/v1/agent-presets', { body })
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [LIST_KEY] }),
  })
}

export function useUpdateAgentPreset() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: AgentPresetUpdateInput }) => {
      const { data, error } = await api.PUT('/api/v1/agent-presets/{agentPresetID}', {
        params: { path: { agentPresetID: id } },
        body,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [LIST_KEY] }),
  })
}

export function useDeleteAgentPreset() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.DELETE('/api/v1/agent-presets/{agentPresetID}', {
        params: { path: { agentPresetID: id } },
      })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [LIST_KEY] }),
  })
}
