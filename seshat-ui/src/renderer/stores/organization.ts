import { create } from 'zustand'

type OrganizationState = {
  // The org every org-scoped feature that has no other way to know "which
  // organization" (Variables, Automation's Overview/Projects, job creation)
  // resolves against. Populated straight from GET /auth/me's
  // organization_id (see AuthGuard.tsx) - null before that first successful
  // call, or for a user with no organization at all.
  //
  // Deliberately a single id, not a list to pick from: this backend
  // enforces at most one organization per user account (see seshat-backend's
  // auth.Principal.OrganizationID doc comment), so there is nothing to
  // switch between. An earlier version of this store expected a whole
  // "organizations" array from /auth/me (mirroring seshat-server's own,
  // different /auth/me shape) - that field never actually existed on
  // seshat-backend's response, which left currentOrganizationId stuck at
  // null for every account, always (see docs/helps/audit-2026-09-04-n8n-
  // gap-analysis.md's Tier 3.2 entry for the known "no switcher" limitation
  // this simpler shape is consistent with, not a regression of it).
  currentOrganizationId: string | null
  setCurrentOrganizationId: (id: string | null) => void
  reset: () => void
}

export const useOrganizationStore = create<OrganizationState>()((set) => ({
  currentOrganizationId: null,
  setCurrentOrganizationId: (id) => set({ currentOrganizationId: id }),
  reset: () => set({ currentOrganizationId: null }),
}))
