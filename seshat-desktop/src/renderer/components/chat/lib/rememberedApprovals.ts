import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Identifies "this exact command" for the purposes of remembering a user's
// approval decision across future prompts in the same install - bash is
// matched on the literal command string (that's what a user means by "this
// command"), file tools on the target path, everything else falls back to
// the full input shape so at least identical calls are recognized. Ported
// from seshat-ui's lib/permissionSignature.ts.
export function permissionSignature(toolName: string, input: Record<string, unknown>): string {
  if (toolName === 'bash' && typeof input.command === 'string') {
    return `bash::${input.command.trim()}`
  }
  const filePath = input.file_path
  if (typeof filePath === 'string' && filePath) {
    return `${toolName}::${filePath}`
  }
  try {
    return `${toolName}::${JSON.stringify(input)}`
  } catch {
    return toolName
  }
}

type RememberedApprovalsState = {
  remembered: Record<string, boolean>
  remember: (signature: string) => void
  forget: (signature: string) => void
  isRemembered: (signature: string) => boolean
}

// "Always allow" from an approval card - future matching tool.permission_required
// events are auto-approved without ever showing the card again. Persisted
// (not session-scoped) since "always" is what the user asked for.
export const useRememberedApprovalsStore = create<RememberedApprovalsState>()(
  persist(
    (set, get) => ({
      remembered: {},
      remember: (signature) => set((state) => ({ remembered: { ...state.remembered, [signature]: true } })),
      forget: (signature) => set((state) => {
        const next = { ...state.remembered }
        delete next[signature]
        return { remembered: next }
      }),
      isRemembered: (signature) => Boolean(get().remembered[signature])
    }),
    { name: 'seshat-desktop-remembered-approvals' }
  )
)
