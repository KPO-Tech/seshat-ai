import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { components } from '@/api/schema'

type Organization = components['schemas']['Organization']
type OrganizationInput = components['schemas']['OrganizationInput']

export interface ListParams {
  q?: string
  sort?: string
  order?: 'asc' | 'desc'
  limit?: number
  offset?: number
}

const LIST_KEY = 'organizations'

export function useOrganizationsList(params: ListParams) {
  return useQuery({
    queryKey: [LIST_KEY, params],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/organizations', { params: { query: params } })
      if (error) throw error
      return data
    },
    placeholderData: (previous) => previous,
  })
}

export function useCreateOrganization() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: OrganizationInput) => {
      const { data, error } = await api.POST('/api/v1/organizations', { body })
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [LIST_KEY] }),
  })
}

export function useUpdateOrganization() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: OrganizationInput }) => {
      const { data, error } = await api.PUT('/api/v1/organizations/{organizationID}', {
        params: { path: { organizationID: id } },
        body,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [LIST_KEY] }),
  })
}

export function useDeleteOrganization() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.DELETE('/api/v1/organizations/{organizationID}', {
        params: { path: { organizationID: id } },
      })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [LIST_KEY] }),
  })
}

export type { Organization, OrganizationInput }
