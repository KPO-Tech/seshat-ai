import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { components } from '@/api/schema'

export type Device = components['schemas']['Device']

export interface DeviceRegisterInput {
  organization_id: string
  name: string
  platform?: string
  app_version?: string
}

const LIST_KEY = 'devices'

export function useDevicesList(organizationId: string | undefined) {
  return useQuery({
    queryKey: [LIST_KEY, organizationId],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/devices', {
        params: { query: { organization_id: organizationId } },
      })
      if (error) throw error
      return data.devices ?? []
    },
  })
}

export function useRegisterDevice() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: DeviceRegisterInput) => {
      const { data, error } = await api.POST('/api/v1/devices', { body })
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [LIST_KEY] }),
  })
}

export function useRevokeDevice() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.DELETE('/api/v1/devices/{deviceID}', {
        params: { path: { deviceID: id } },
      })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [LIST_KEY] }),
  })
}
