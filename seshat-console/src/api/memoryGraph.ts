import { useMutation, useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { components } from '@/api/schema'

export type MemoryGraph = components['schemas']['MemoryGraph']
export type MemoryEntityInput = components['schemas']['MemoryEntityInput']
export type MemoryObservationInput = components['schemas']['MemoryObservationInput']

export function useSearchMyMemoryNodes(query: string | undefined) {
  return useQuery({
    queryKey: ['my-memory-graph-search', query],
    enabled: Boolean(query && query.trim()),
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/users/me/memory-graph/search', {
        params: { query: { query } },
      })
      if (error) throw error
      return data
    },
  })
}

export function useGetMyMemoryContext(query: string | undefined, maxTokens: number | undefined) {
  return useQuery({
    queryKey: ['my-memory-graph-context', query, maxTokens],
    enabled: Boolean(query && query.trim()),
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/users/me/memory-graph/context', {
        params: { query: { query, max_tokens: maxTokens } },
      })
      if (error) throw error
      return data
    },
  })
}

export function useOpenMyMemoryNodes() {
  return useMutation({
    mutationFn: async (names: string[]) => {
      const { data, error } = await api.POST('/api/v1/users/me/memory-graph/open', {
        body: { names },
      })
      if (error) throw error
      return data
    },
  })
}

export function useUpsertMyMemoryEntities() {
  return useMutation({
    mutationFn: async (entities: MemoryEntityInput[]) => {
      const { data, error } = await api.POST('/api/v1/users/me/memory-graph/entities', {
        body: { entities },
      })
      if (error) throw error
      return data
    },
  })
}

export function useAddMyMemoryObservations() {
  return useMutation({
    mutationFn: async (observations: MemoryObservationInput[]) => {
      const { data, error } = await api.POST('/api/v1/users/me/memory-graph/observations', {
        body: { observations },
      })
      if (error) throw error
      return data
    },
  })
}
