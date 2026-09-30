import { create } from 'zustand'

// stepUpModal — the client-side half of
// docs/helps/audit-2026-08-29-openwork-den-comparison.md § 9: a single
// global modal instance that api/client.ts's response middleware opens
// whenever ANY request comes back with error.code === "step_up_required",
// then waits on before automatically retrying that same request. No
// individual mutation (delete organization, delete user, delete provider,
// rotate SCIM token) needs its own step-up handling - this one interception
// point covers all of them.
interface StepUpModalState {
  isOpen: boolean
  resolve: (() => void) | null
  reject: ((reason?: unknown) => void) | null
  open: (resolve: () => void, reject: (reason?: unknown) => void) => void
  close: () => void
}

export const useStepUpModalStore = create<StepUpModalState>((set, get) => ({
  isOpen: false,
  resolve: null,
  reject: null,
  open: (resolve, reject) => {
    const current = get()
    if (current.isOpen) {
      // A second request already hit step_up_required while the modal from
      // a first one is still open - resolve/reject both waiters together
      // once the single modal actually completes, rather than opening a
      // second modal on top of it.
      const prevResolve = current.resolve
      const prevReject = current.reject
      set({
        resolve: () => {
          prevResolve?.()
          resolve()
        },
        reject: (reason) => {
          prevReject?.(reason)
          reject(reason)
        },
      })
      return
    }
    set({ isOpen: true, resolve, reject })
  },
  close: () => set({ isOpen: false, resolve: null, reject: null }),
}))

// requestStepUp is what api/client.ts calls: opens the modal (or joins an
// already-open one) and resolves once the user successfully re-proves their
// identity, or rejects if they cancel.
export function requestStepUp(): Promise<void> {
  return new Promise((resolve, reject) => {
    useStepUpModalStore.getState().open(resolve, reject)
  })
}
