import type { Organization } from '@/api/organizations'

export function hasValue(value: string | null | undefined) {
  return Boolean(value && value.trim().length > 0)
}

export function getOrganizationChecklist(organization: Organization | null | undefined) {
  const missing: string[] = []
  if (!organization) return { missing, isReady: true, completionCount: 3 }

  if (!hasValue(organization.description)) missing.push('Add a short description')
  if (!hasValue(organization.website_url)) missing.push('Add the organization website')
  if (!hasValue(organization.support_email)) missing.push('Add a support email')

  return {
    missing,
    isReady: missing.length === 0,
    completionCount: 3 - missing.length,
  }
}
