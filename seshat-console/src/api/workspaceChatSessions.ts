import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { components } from '@/api/schema'

export type WorkspaceChatSessionSummary = components['schemas']['WorkspaceChatSessionSummary']

export interface ListParams {
  q?: string
  sort?: string
  order?: 'asc' | 'desc'
  limit?: number
  offset?: number
}

const LIST_KEY = 'workspace-chat-sessions'

// Admin-visibility list across an organization's members (requires
// organization.manage server-side) - distinct from the owner-scoped single-
// session reload the personal Workspace > Chat screen itself uses
// (src/features/workspaceChat/transport.ts), which this file doesn't touch.
export function useWorkspaceChatSessionsList(organizationId: string | undefined, params: ListParams) {
  return useQuery({
    queryKey: [LIST_KEY, organizationId, params],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/workspace-chat/sessions', {
        params: { query: { organization_id: organizationId, ...params } },
      })
      if (error) throw error
      return data
    },
    placeholderData: (previous) => previous,
  })
}
