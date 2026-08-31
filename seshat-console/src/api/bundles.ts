import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { components } from '@/api/schema'

export type BundleManifest = components['schemas']['BundleManifest']
export type BundleManifestSkillRepo = components['schemas']['BundleManifestSkillRepo']
export type BundleManifestMCPServer = components['schemas']['BundleManifestMCPServer']
export type BundleManifestHook = components['schemas']['BundleManifestHook']
export type BundleManifestAgentPreset = components['schemas']['BundleManifestAgentPreset']
export type ExportBundleInput = components['schemas']['ExportBundleInput']
export type BundleImportResult = components['schemas']['BundleImportResult']
export type BundleProvenanceEntry = components['schemas']['BundleProvenanceEntry']
export type BundleResourceType = 'mcp_server_config' | 'hook_config' | 'skill_repo' | 'agent_preset'

// Export/import are one-shot actions with no list of their own to
// invalidate afterward — there is no server-side "bundle" record, the
// manifest only ever exists as the export response and whatever the caller
// saves it as (see bundles.Service.Export's doc comment). Plain mutations,
// same shape as useRunNetworkDiagnostics.
export function useExportBundle() {
  return useMutation({
    mutationFn: async (body: ExportBundleInput) => {
      const { data, error } = await api.POST('/api/v1/bundles/export', { body })
      if (error) throw error
      return data
    },
  })
}

// Importing creates real rows in the four existing registries, so their own
// list pages (Skills/MCP Servers/Agent Presets/Hooks) must refresh — using
// each registry's own list-query key string directly rather than importing
// their hooks, to avoid a circular/unnecessary dependency for just a cache key.
const IMPORTABLE_LIST_KEYS = ['mcp-server-configs', 'hook-configs', 'skill-repos', 'agent-presets']

export function useImportBundle() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: { organization_id: string; manifest: BundleManifest }) => {
      const { data, error } = await api.POST('/api/v1/bundles/import', { body })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      for (const key of IMPORTABLE_LIST_KEYS) queryClient.invalidateQueries({ queryKey: [key] })
    },
  })
}

// useBundleProvenance — the 3rd provenance signal (see § 7 sous-chantier B,
// Etape B5), alongside a registry's own already-displayed created_by_user_id
// and (for skill repos) source. Pass exactly the IDs a registry's own list
// query just returned; resourceIds.length === 0 skips the request entirely
// rather than firing an empty-body call.
export function useBundleProvenance(
  organizationId: string | undefined,
  resourceType: BundleResourceType,
  resourceIds: string[],
) {
  const key = [...resourceIds].sort().join(',')
  return useQuery({
    queryKey: ['bundle-provenance', organizationId, resourceType, key],
    enabled: Boolean(organizationId) && resourceIds.length > 0,
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/bundles/provenance', {
        params: { query: { organization_id: organizationId, resource_type: resourceType, resource_ids: key } },
      })
      if (error) throw error
      return (data.provenance ?? {}) as Record<string, BundleProvenanceEntry>
    },
  })
}
