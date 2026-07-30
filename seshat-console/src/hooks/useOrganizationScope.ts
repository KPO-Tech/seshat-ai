import { useParams } from 'react-router'

export function useScopedOrganizationId() {
  const { organizationId } = useParams<{ organizationId: string }>()
  return organizationId ?? null
}
