import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { components } from '@/api/schema'

export type SessionInfo = components['schemas']['SessionInfo']

export interface ListParams {
  q?: string
  sort?: string
  order?: 'asc' | 'desc'
  limit?: number
  offset?: number
}

const LIST_KEY = 'sessions'

// Not org-scoped in the traditional sense — visibility is permission-based
// (platform admin sees everyone's, a regular user only ever sees their own
// regardless of filters passed), so organization_id here is an optional
// narrowing filter, not a required scope like Applications/Devices/etc.
export function useSessionsList(organizationId: string | undefined, params: ListParams) {
  return useQuery({
    queryKey: [LIST_KEY, organizationId, params],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/sessions', {
        params: { query: { organization_id: organizationId, ...params } },
      })
      if (error) throw error
      return data
    },
    placeholderData: (previous) => previous,
  })
}

export function useRevokeSession() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.DELETE('/api/v1/sessions/{sessionID}', {
        params: { path: { sessionID: id } },
      })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [LIST_KEY] }),
  })
}
