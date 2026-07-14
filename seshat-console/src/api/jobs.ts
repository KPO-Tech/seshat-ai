import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { components } from '@/api/schema'

export type Job = components['schemas']['Job']
export type JobInput = components['schemas']['JobInput']
export type JobUpdateInput = components['schemas']['JobUpdateInput']

const LIST_KEY = 'jobs'

export function useJobsList(organizationId: string | undefined) {
  return useQuery({
    queryKey: [LIST_KEY, organizationId],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/jobs', {
        params: { query: { organization_id: organizationId } },
      })
      if (error) throw error
      return data.jobs ?? []
    },
  })
}

export function useCreateJob() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: JobInput) => {
      const { data, error } = await api.POST('/api/v1/jobs', { body })
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [LIST_KEY] }),
  })
}

export function useUpdateJob() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: JobUpdateInput }) => {
      const { data, error } = await api.PUT('/api/v1/jobs/{jobID}', {
        params: { path: { jobID: id } },
        body,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [LIST_KEY] }),
  })
}

export function useDeleteJob() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.DELETE('/api/v1/jobs/{jobID}', {
        params: { path: { jobID: id } },
      })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [LIST_KEY] }),
  })
}

export function useSetJobPaused() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, paused }: { id: string; paused: boolean }) => {
      const { data, error } = await api.POST(paused ? '/api/v1/jobs/{jobID}/pause' : '/api/v1/jobs/{jobID}/resume', {
        params: { path: { jobID: id } },
      })
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [LIST_KEY] }),
  })
}

export function useTriggerJobNow() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await api.POST('/api/v1/jobs/{jobID}/run', {
        params: { path: { jobID: id } },
      })
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['runs'] }),
  })
}
