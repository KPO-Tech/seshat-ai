import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { components } from '@/api/schema'

export type User = components['schemas']['User']

export interface ListParams {
  q?: string
  sort?: string
  order?: 'asc' | 'desc'
  limit?: number
  offset?: number
}

// Inline request bodies in openapi.yaml (not named schemas) — create attaches
// an organization+role in the same call (system roles only, see
// canonicalRoleCode server-side), update is platform-fields only.
export interface UserCreateInput {
  email: string
  password: string
  display_name: string
  organization_id?: string
  role?: 'owner' | 'admin' | 'member' | 'viewer'
  is_admin?: boolean
}

export interface UserUpdateInput {
  email: string
  display_name: string
  is_admin?: boolean
}

const LIST_KEY = 'users'

export function useUsersList(params: ListParams, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: [LIST_KEY, params],
    enabled: options?.enabled,
    // Platform-admin only server-side (requireAdmin) — a non-admin org
    // owner/manager gets a 403 that retrying can't fix, so don't hammer it.
    retry: false,
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/users', { params: { query: params } })
      if (error) throw error
      return data
    },
    placeholderData: (previous) => previous,
  })
}

export function useCreateUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: UserCreateInput) => {
      const { data, error } = await api.POST('/api/v1/users', { body })
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [LIST_KEY] }),
  })
}

export function useUpdateUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: UserUpdateInput }) => {
      const { data, error } = await api.PUT('/api/v1/users/{userID}', {
        params: { path: { userID: id } },
        body,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [LIST_KEY] }),
  })
}

export function useDeleteUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.DELETE('/api/v1/users/{userID}', {
        params: { path: { userID: id } },
      })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [LIST_KEY] }),
  })
}

export function useRevokeUserSessions() {
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await api.DELETE('/api/v1/users/{userID}/sessions', {
        params: { path: { userID: id } },
      })
      if (error) throw error
      return data
    },
  })
}
