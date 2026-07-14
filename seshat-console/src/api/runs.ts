import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { components } from '@/api/schema'

export type Run = components['schemas']['Run']
export type RunStatus = NonNullable<Run['status']>

export interface ListParams {
  sort?: string
  order?: 'asc' | 'desc'
  limit?: number
  offset?: number
}

const LIST_KEY = 'runs'

export function useRunsList(
  organizationId: string | undefined,
  filters: { jobId?: string; status?: RunStatus },
  params: ListParams,
) {
  return useQuery({
    queryKey: [LIST_KEY, organizationId, filters, params],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/runs', {
        params: {
          query: { organization_id: organizationId, job_id: filters.jobId, status: filters.status, ...params },
        },
      })
      if (error) throw error
      return data
    },
    placeholderData: (previous) => previous,
  })
}

export function useCancelRun() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await api.POST('/api/v1/runs/{runID}/cancel', {
        params: { path: { runID: id } },
      })
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [LIST_KEY] }),
  })
}
