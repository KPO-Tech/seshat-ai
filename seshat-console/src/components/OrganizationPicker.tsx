import { Select, Empty } from 'antd'
import { useOrganizationsList } from '@/api/organizations'
import { useConsoleOrgStore } from '@/store/consoleOrg'

// Shared "which organization am I looking at" control for every org-scoped
// page (Corpora, Embedder Settings, Jobs, ...). The selection persists
// across pages/reloads (see useConsoleOrgStore) so switching between, say,
// Corpora and Jobs for the same organization doesn't require re-picking it.
export function OrganizationPicker({ style }: { style?: React.CSSProperties }) {
  const { data } = useOrganizationsList({ sort: 'name', order: 'asc', limit: 200 })
  const organizationId = useConsoleOrgStore((s) => s.organizationId)
  const setOrganizationId = useConsoleOrgStore((s) => s.setOrganizationId)
  const organizations = data?.organizations ?? []

  return (
    <Select
      placeholder="Select an organization"
      style={{ minWidth: 260, ...style }}
      value={organizationId ?? undefined}
      onChange={(value) => setOrganizationId(value)}
      showSearch
      optionFilterProp="label"
      notFoundContent={<Empty description="No organizations" image={Empty.PRESENTED_IMAGE_SIMPLE} />}
      options={organizations.map((org) => ({ value: org.id, label: org.name }))}
    />
  )
}
