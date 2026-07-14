import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { components } from '@/api/schema'

export type Provider = components['schemas']['Provider']
export type ProviderInput = components['schemas']['ProviderInput']
export type ProviderUpdateInput = components['schemas']['ProviderUpdateInput']

export interface ListParams {
  q?: string
  sort?: string
  order?: 'asc' | 'desc'
  limit?: number
  offset?: number
}

const LIST_KEY = 'providers'

export function useProvidersList(organizationId: string | undefined, params: ListParams) {
  return useQuery({
    queryKey: [LIST_KEY, organizationId, params],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/providers', {
        params: { query: { organization_id: organizationId, ...params } },
      })
      if (error) throw error
      return data
    },
    placeholderData: (previous) => previous,
  })
}

export function useCreateProvider() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: ProviderInput) => {
      const { data, error } = await api.POST('/api/v1/providers', { body })
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [LIST_KEY] }),
  })
}

export function useUpdateProvider() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: ProviderUpdateInput }) => {
      const { data, error } = await api.PUT('/api/v1/providers/{providerID}', {
        params: { path: { providerID: id } },
        body,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [LIST_KEY] }),
  })
}

export function useDeleteProvider() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.DELETE('/api/v1/providers/{providerID}', {
        params: { path: { providerID: id } },
      })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [LIST_KEY] }),
  })
}
