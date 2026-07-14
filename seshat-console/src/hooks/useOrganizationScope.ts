import { useParams } from 'react-router-dom'

export function useScopedOrganizationId() {
  const { organizationId } = useParams<{ organizationId: string }>()
  return organizationId ?? null
}
