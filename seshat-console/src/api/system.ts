import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'

export function useDoclingStatus() {
  return useQuery({
    queryKey: ['system', 'docling-status'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/platform/docling-status')
      if (error) throw error
      return data
    },
  })
}
