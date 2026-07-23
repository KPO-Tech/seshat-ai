import { useMutation, useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { components } from '@/api/schema'

export type UserPreferences = components['schemas']['UserPreferences']
export type UserPreferencesInput = components['schemas']['UserPreferencesInput']

export function useMyPreferences() {
  return useQuery({
    queryKey: ['my-preferences'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/users/me/preferences')
      if (error) throw error
      return data
    },
  })
}

export function useUpdateMyPreferences() {
  return useMutation({
    mutationFn: async (body: UserPreferencesInput) => {
      const { data, error } = await api.PUT('/api/v1/users/me/preferences', { body })
      if (error) throw error
      return data
    },
  })
}
