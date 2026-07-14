import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { components } from '@/api/schema'

export type Application = components['schemas']['Application']
export type ApplicationInput = components['schemas']['ApplicationInput']
export type ApplicationUpdateInput = components['schemas']['ApplicationUpdateInput']

export interface ListParams {
  q?: string
  sort?: string
  order?: 'asc' | 'desc'
  limit?: number
  offset?: number
}

const LIST_KEY = 'applications'

export function useApplicationsList(organizationId: string | undefined, params: ListParams) {
  return useQuery({
    queryKey: [LIST_KEY, organizationId, params],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/applications', {
        params: { query: { organization_id: organizationId, ...params } },
      })
      if (error) throw error
      return data
    },
    placeholderData: (previous) => previous,
  })
}

export function useCreateApplication() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: ApplicationInput) => {
      const { data, error } = await api.POST('/api/v1/applications', { body })
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [LIST_KEY] }),
  })
}

export function useUpdateApplication() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: ApplicationUpdateInput }) => {
      const { data, error } = await api.PUT('/api/v1/applications/{applicationID}', {
        params: { path: { applicationID: id } },
        body,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [LIST_KEY] }),
  })
}

export function useDeleteApplication() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.DELETE('/api/v1/applications/{applicationID}', {
        params: { path: { applicationID: id } },
      })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [LIST_KEY] }),
  })
}
