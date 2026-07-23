import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { components } from '@/api/schema'

export type UserMemory = components['schemas']['UserMemory']
export type UserMemoryInput = components['schemas']['UserMemoryInput']
export type UserMemoryUpdateInput = components['schemas']['UserMemoryUpdateInput']

const LIST_KEY = 'my-memories'

export function useMyMemoriesList() {
  return useQuery({
    queryKey: [LIST_KEY],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/users/me/memories')
      if (error) throw error
      return data.memories ?? []
    },
  })
}

export function useCreateMyMemory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: UserMemoryInput) => {
      const { data, error } = await api.POST('/api/v1/users/me/memories', { body })
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [LIST_KEY] }),
  })
}

export function useUpdateMyMemory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: UserMemoryUpdateInput }) => {
      const { data, error } = await api.PUT('/api/v1/users/me/memories/{memoryID}', {
        params: { path: { memoryID: id } },
        body,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [LIST_KEY] }),
  })
}

export function useDeleteMyMemory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.DELETE('/api/v1/users/me/memories/{memoryID}', {
        params: { path: { memoryID: id } },
      })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [LIST_KEY] }),
  })
}

export function useDeleteAllMyMemories() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await api.DELETE('/api/v1/users/me/memories')
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [LIST_KEY] }),
  })
}
