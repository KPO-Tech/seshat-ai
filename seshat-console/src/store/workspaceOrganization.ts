import { create } from 'zustand'

const STORAGE_KEY = 'seshat-console:selected-org'

interface WorkspaceOrganizationState {
  organizationId: string | null
  setOrganizationId: (id: string | null) => void
}

// Stores the shell workspace selection when the user is outside an
// org-scoped URL. Inside /orgs/:organizationId/... routes, the URL remains
// the source of truth and AppLayout keeps this store in sync.
export const useWorkspaceOrganizationStore = create<WorkspaceOrganizationState>((set) => ({
  organizationId: localStorage.getItem(STORAGE_KEY),
  setOrganizationId: (id) => {
    if (id) localStorage.setItem(STORAGE_KEY, id)
    else localStorage.removeItem(STORAGE_KEY)
    set({ organizationId: id })
  },
}))
