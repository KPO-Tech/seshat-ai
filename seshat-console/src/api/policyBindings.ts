import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { components } from '@/api/schema'
import { PROVIDER_SETTINGS_USABLE_KEY } from '@/api/settingsQueryKeys'

export type PolicyBinding = components['schemas']['PolicyBinding']
export type PolicyBindingInput = components['schemas']['PolicyBindingInput']
export type PolicyBindingUpdateInput = components['schemas']['PolicyBindingUpdateInput']

export interface ListParams {
  q?: string
  sort?: string
  order?: 'asc' | 'desc'
  limit?: number
  offset?: number
}

const LIST_KEY = 'policy-bindings'

export function usePolicyBindingsList(organizationId: string | undefined, params: ListParams) {
  return useQuery({
    queryKey: [LIST_KEY, organizationId, params],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/policy-bindings', {
        params: { query: { organization_id: organizationId, ...params } },
      })
      if (error) throw error
      return data
    },
    placeholderData: (previous) => previous,
  })
}

export function useCreatePolicyBinding() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: PolicyBindingInput) => {
      const { data, error } = await api.POST('/api/v1/policy-bindings', { body })
      if (error) throw error
      return data
    },
    // A binding may be scoped to resource_type=provider_setting, in which
    // case it directly changes who ListUsableProviderSettings returns -
    // invalidate unconditionally rather than parsing the binding's own
    // resource_type to decide (this list is cheap and rarely subscribed to
    // outside the chat page it feeds).
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [LIST_KEY] })
      queryClient.invalidateQueries({ queryKey: [PROVIDER_SETTINGS_USABLE_KEY] })
    },
  })
}

export function useUpdatePolicyBinding() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: PolicyBindingUpdateInput }) => {
      const { data, error } = await api.PUT('/api/v1/policy-bindings/{bindingID}', {
        params: { path: { bindingID: id } },
        body,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [LIST_KEY] })
      queryClient.invalidateQueries({ queryKey: [PROVIDER_SETTINGS_USABLE_KEY] })
    },
  })
}

export function useDeletePolicyBinding() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.DELETE('/api/v1/policy-bindings/{bindingID}', {
        params: { path: { bindingID: id } },
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [LIST_KEY] })
      queryClient.invalidateQueries({ queryKey: [PROVIDER_SETTINGS_USABLE_KEY] })
    },
  })
}
