import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { components } from '@/api/schema'

export type HookConfig = components['schemas']['HookConfig']
export type HookConfigInput = components['schemas']['HookConfigInput']
export type HookConfigUpdateInput = components['schemas']['HookConfigUpdateInput']

const LIST_KEY = 'hook-configs'

export function useHookConfigsList(organizationId: string | undefined) {
  return useQuery({
    queryKey: [LIST_KEY, organizationId],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/hook-configs', {
        params: { query: { organization_id: organizationId } },
      })
      if (error) throw error
      return data.hook_configs ?? []
    },
  })
}

export function useCreateHookConfig() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: HookConfigInput) => {
      const { data, error } = await api.POST('/api/v1/hook-configs', { body })
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [LIST_KEY] }),
  })
}

export function useUpdateHookConfig() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: HookConfigUpdateInput }) => {
      const { data, error } = await api.PUT('/api/v1/hook-configs/{hookConfigID}', {
        params: { path: { hookConfigID: id } },
        body,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [LIST_KEY] }),
  })
}

export function useDeleteHookConfig() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.DELETE('/api/v1/hook-configs/{hookConfigID}', {
        params: { path: { hookConfigID: id } },
      })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [LIST_KEY] }),
  })
}
