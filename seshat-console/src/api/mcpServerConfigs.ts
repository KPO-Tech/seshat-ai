import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { components } from '@/api/schema'

export type MCPServerConfig = components['schemas']['MCPServerConfig']
export type ResolvedMCPServerConfig = components['schemas']['ResolvedMCPServerConfig']
export type MCPServerConfigInput = components['schemas']['MCPServerConfigInput']
export type MCPServerConfigUpdateInput = components['schemas']['MCPServerConfigUpdateInput']

const LIST_KEY = 'mcp-server-configs'
const RESOLVED_KEY = 'resolved-mcp-server-configs'

export function useMCPServerConfigsList(organizationId: string | undefined) {
  return useQuery({
    queryKey: [LIST_KEY, organizationId],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/mcp-server-configs', {
        params: { query: { organization_id: organizationId } },
      })
      if (error) throw error
      return data.mcp_server_configs ?? []
    },
  })
}

export function useResolvedMCPServerConfigs(organizationId: string | undefined) {
  return useQuery({
    queryKey: [RESOLVED_KEY, organizationId],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/mcp-server-configs/resolve', {
        params: { query: { organization_id: organizationId } },
      })
      if (error) throw error
      return data.mcp_server_configs ?? []
    },
  })
}

export function useCreateMCPServerConfig() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: MCPServerConfigInput) => {
      const { data, error } = await api.POST('/api/v1/mcp-server-configs', { body })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [LIST_KEY] })
      queryClient.invalidateQueries({ queryKey: [RESOLVED_KEY] })
    },
  })
}

export function useUpdateMCPServerConfig() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: MCPServerConfigUpdateInput }) => {
      const { data, error } = await api.PUT('/api/v1/mcp-server-configs/{mcpServerConfigID}', {
        params: { path: { mcpServerConfigID: id } },
        body,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [LIST_KEY] })
      queryClient.invalidateQueries({ queryKey: [RESOLVED_KEY] })
    },
  })
}

export function useDeleteMCPServerConfig() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.DELETE('/api/v1/mcp-server-configs/{mcpServerConfigID}', {
        params: { path: { mcpServerConfigID: id } },
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [LIST_KEY] })
      queryClient.invalidateQueries({ queryKey: [RESOLVED_KEY] })
    },
  })
}
