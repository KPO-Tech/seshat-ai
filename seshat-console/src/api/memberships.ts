import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { components } from '@/api/schema'

export type Membership = components['schemas']['Membership']

export interface ListParams {
  q?: string
  sort?: string
  order?: 'asc' | 'desc'
  limit?: number
  offset?: number
}

export interface MembershipCreateInput {
  organization_id: string
  user_id: string
  role: string
}

export interface OrganizationMemberCreateInput {
  organization_id: string
  email: string
  display_name: string
  role?: string
  group_ids?: string[]
}

const LIST_KEY = 'memberships'

export function useMembershipsList(organizationId: string | undefined, params: ListParams) {
  return useQuery({
    queryKey: [LIST_KEY, organizationId, params],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/memberships', {
        params: { query: { organization_id: organizationId, ...params } },
      })
      if (error) throw error
      return data
    },
    placeholderData: (previous) => previous,
  })
}

export function useCreateMembership() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: MembershipCreateInput) => {
      const { data, error } = await api.POST('/api/v1/memberships', { body })
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [LIST_KEY] }),
  })
}

// Sibling of useCreateMembership: creates the account too instead of
// attaching an existing user - see the backend's CreateOrganizationMember
// doc comment for why there's no password field. The new member is emailed
// a welcome link to set their own password.
export function useCreateOrganizationMember() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: OrganizationMemberCreateInput) => {
      const { data, error } = await api.POST('/api/v1/memberships/direct', { body })
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [LIST_KEY] }),
  })
}

export function useUpdateMembership() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, role }: { id: string; role: string }) => {
      const { data, error } = await api.PUT('/api/v1/memberships/{membershipID}', {
        params: { path: { membershipID: id } },
        body: { role },
      })
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [LIST_KEY] }),
  })
}

export function useConfirmMembership() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await api.POST('/api/v1/memberships/{membershipID}/confirm', {
        params: { path: { membershipID: id } },
      })
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [LIST_KEY] }),
  })
}

export function useDeleteMembership() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.DELETE('/api/v1/memberships/{membershipID}', {
        params: { path: { membershipID: id } },
      })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [LIST_KEY] }),
  })
}
