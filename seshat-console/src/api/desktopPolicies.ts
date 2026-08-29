import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { components } from '@/api/schema'

export type DesktopPolicy = components['schemas']['DesktopPolicy']
export type DesktopPolicyBinding = components['schemas']['DesktopPolicyBinding']
export type DesktopPolicyBindingInput = components['schemas']['DesktopPolicyBindingInput']

const CATALOG_KEY = 'desktop-policy-catalog'
const BINDINGS_KEY = 'desktop-policy-bindings'

// The fixed catalog is not organization-specific data - cached indefinitely,
// same reasoning as a permissions catalog would be.
export function useDesktopPolicyCatalog() {
  return useQuery({
    queryKey: [CATALOG_KEY],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/desktop-policies/catalog', {})
      if (error) throw error
      return data
    },
    staleTime: Infinity,
  })
}

export function useDesktopPolicyBindingsList(organizationId: string | undefined) {
  return useQuery({
    queryKey: [BINDINGS_KEY, organizationId],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/desktop-policy-bindings', {
        params: { query: { organization_id: organizationId } },
      })
      if (error) throw error
      return data
    },
    placeholderData: (previous) => previous,
  })
}

// Upsert - the same call creates a new binding or updates an existing one
// for the same (organization, policy_code, subject_type, subject_id), see
// iam.Service.SetDesktopPolicyBinding.
export function useSetDesktopPolicyBinding() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: DesktopPolicyBindingInput) => {
      const { data, error } = await api.POST('/api/v1/desktop-policy-bindings', { body })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [BINDINGS_KEY] })
    },
  })
}

export function useDeleteDesktopPolicyBinding() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.DELETE('/api/v1/desktop-policy-bindings/{bindingID}', {
        params: { path: { bindingID: id } },
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [BINDINGS_KEY] })
    },
  })
}
