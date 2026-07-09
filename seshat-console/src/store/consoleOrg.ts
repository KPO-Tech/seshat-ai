import { create } from 'zustand'

const STORAGE_KEY = 'seshat-console:selected-org'

interface ConsoleOrgState {
  organizationId: string | null
  setOrganizationId: (id: string | null) => void
}

// Which organization org-scoped pages (Corpora, Embedder Settings, Jobs, ...)
// operate on. A platform admin isn't necessarily a member of every
// organization (IsAdmin bypasses membership entirely), so this is picked
// from the full admin organization list, not derived from the logged-in
// user's own memberships.
export const useConsoleOrgStore = create<ConsoleOrgState>((set) => ({
  organizationId: localStorage.getItem(STORAGE_KEY),
  setOrganizationId: (id) => {
    if (id) localStorage.setItem(STORAGE_KEY, id)
    else localStorage.removeItem(STORAGE_KEY)
    set({ organizationId: id })
  },
}))
