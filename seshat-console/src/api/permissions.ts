import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { components } from '@/api/schema'

export type Permission = components['schemas']['Permission']

/** The permission catalog is small and static per server build - fetch once, cache long. */
export function usePermissionsList() {
  return useQuery({
    queryKey: ['permissions'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/permissions', {})
      if (error) throw error
      return data
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function groupPermissionsByCategory(permissions: Permission[]): Map<string, Permission[]> {
  const groups = new Map<string, Permission[]>()
  for (const permission of permissions) {
    const category = permission.category || 'Other'
    const list = groups.get(category) ?? []
    list.push(permission)
    groups.set(category, list)
  }
  return groups
}
