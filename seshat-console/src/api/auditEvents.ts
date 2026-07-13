import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { components } from '@/api/schema'

export type AuditEvent = components['schemas']['AuditEvent']

export interface ListParams {
  q?: string
  sort?: string
  order?: 'asc' | 'desc'
  limit?: number
  offset?: number
}

export interface AuditEventFilters {
  organizationId?: string
  actorUserId?: string
  action?: string
  resourceType?: string
}

const LIST_KEY = 'audit-events'

export function useAuditEventsList(filters: AuditEventFilters, params: ListParams) {
  return useQuery({
    queryKey: [LIST_KEY, filters, params],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/audit-events', {
        params: {
          query: {
            organization_id: filters.organizationId,
            actor_user_id: filters.actorUserId,
            action: filters.action,
            resource_type: filters.resourceType,
            ...params,
          },
        },
      })
      if (error) throw error
      return data
    },
    placeholderData: (previous) => previous,
  })
}
