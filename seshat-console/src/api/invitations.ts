import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { components } from '@/api/schema'

export type Invitation = components['schemas']['Invitation']
export type InvitationStatus = 'pending' | 'accepted' | 'revoked' | 'expired'

export interface ListParams {
  q?: string
  sort?: string
  order?: 'asc' | 'desc'
  limit?: number
  offset?: number
}

export interface InvitationCreateInput {
  organization_id: string
  email: string
  role: string
  expires_in_days?: number
}

const LIST_KEY = 'invitations'

export function useInvitationsList(
  organizationId: string | undefined,
  status: InvitationStatus | undefined,
  params: ListParams,
) {
  return useQuery({
    queryKey: [LIST_KEY, organizationId, status, params],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/invitations', {
        params: { query: { organization_id: organizationId, status, ...params } },
      })
      if (error) throw error
      return data
    },
    placeholderData: (previous) => previous,
  })
}

export function useCreateInvitation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: InvitationCreateInput) => {
      const { data, error } = await api.POST('/api/v1/invitations', { body })
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [LIST_KEY] }),
  })
}

export function useRevokeInvitation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await api.POST('/api/v1/invitations/{invitationID}/revoke', {
        params: { path: { invitationID: id } },
      })
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [LIST_KEY] }),
  })
}
