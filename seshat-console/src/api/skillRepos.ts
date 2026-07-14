import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { components } from '@/api/schema'

export type SkillRepo = components['schemas']['SkillRepo']
export type SkillRepoInput = components['schemas']['SkillRepoInput']
export type SkillRepoUpdateInput = components['schemas']['SkillRepoUpdateInput']

const LIST_KEY = 'skill-repos'

export function useSkillReposList(organizationId: string | undefined) {
  return useQuery({
    queryKey: [LIST_KEY, organizationId],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/skill-repos', {
        params: { query: { organization_id: organizationId } },
      })
      if (error) throw error
      return data.skill_repos ?? []
    },
  })
}

export function useCreateSkillRepo() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: SkillRepoInput) => {
      const { data, error } = await api.POST('/api/v1/skill-repos', { body })
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [LIST_KEY] }),
  })
}

export function useUpdateSkillRepo() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: SkillRepoUpdateInput }) => {
      const { data, error } = await api.PUT('/api/v1/skill-repos/{skillRepoID}', {
        params: { path: { skillRepoID: id } },
        body,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [LIST_KEY] }),
  })
}

export function useDeleteSkillRepo() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.DELETE('/api/v1/skill-repos/{skillRepoID}', {
        params: { path: { skillRepoID: id } },
      })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [LIST_KEY] }),
  })
}
