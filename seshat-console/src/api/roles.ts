import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { components } from '@/api/schema'

export type Role = components['schemas']['Role']
export type RoleInput = components['schemas']['RoleInput']

const LIST_KEY = 'roles'

// Not paginated server-side (catalog-sized: 4 system roles + however many
// custom roles one organization defines), matches how Devices/Jobs work.
export function useRolesList(organizationId: string | undefined) {
  return useQuery({
    queryKey: [LIST_KEY, organizationId],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/roles', {
        params: { query: { organization_id: organizationId } },
      })
      if (error) throw error
      return data
    },
  })
}

export function useCreateRole() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: RoleInput) => {
      const { data, error } = await api.POST('/api/v1/roles', { body })
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [LIST_KEY] }),
  })
}

export function useUpdateRole() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ code, body }: { code: string; body: RoleInput }) => {
      const { data, error } = await api.PUT('/api/v1/roles/{roleCode}', {
        params: { path: { roleCode: code } },
        body,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [LIST_KEY] }),
  })
}

export function useDeleteRole() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ code, organizationId }: { code: string; organizationId: string }) => {
      const { error } = await api.DELETE('/api/v1/roles/{roleCode}', {
        params: { path: { roleCode: code }, query: { organization_id: organizationId } },
      })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [LIST_KEY] }),
  })
}
