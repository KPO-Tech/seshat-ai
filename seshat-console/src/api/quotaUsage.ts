import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { components } from '@/api/schema'

export type UsageSummary = components['schemas']['UsageSummary']

export function useMyQuotaUsage() {
  return useQuery({
    queryKey: ['my-quota-usage'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/users/me/quota-usage')
      if (error) throw error
      return data
    },
  })
}
