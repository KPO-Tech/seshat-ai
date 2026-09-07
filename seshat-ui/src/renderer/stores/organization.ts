import { create } from 'zustand'
import type { Organization } from '@/api/types'

type OrganizationState = {
  organizations: Organization[]
  // The org every org-scoped feature that has no other way to know "which
  // organization" (Variables, Automation's Overview job list, job creation)
  // resolves against - the caller's default organization, or the first one
  // if none is marked default. null before the first successful /auth/me
  // (see AuthGuard.tsx) or for a user with no organization at all.
  //
  // Deliberately no switcher: a user in more than one organization has no
  // way to work in a non-default one yet - a known limitation, not an
  // oversight (see docs/helps/audit-2026-09-04-n8n-gap-analysis.md's Tier
  // 3.2 entry).
  currentOrganizationId: string | null
  setOrganizations: (organizations: Organization[]) => void
  reset: () => void
}

export const useOrganizationStore = create<OrganizationState>()((set) => ({
  organizations: [],
  currentOrganizationId: null,
  setOrganizations: (organizations) =>
    set({
      organizations,
      currentOrganizationId: organizations.find((o) => o.is_default)?.id ?? organizations[0]?.id ?? null,
    }),
  reset: () => set({ organizations: [], currentOrganizationId: null }),
}))
