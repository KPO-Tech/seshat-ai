import { useMutation } from '@tanstack/react-query'
import { api } from '@/api/client'

// useStepUpWithPassword re-proves the caller's own identity for their
// already-existing session - never rotates the password, never issues a
// new session. See docs/helps/audit-2026-08-29-openwork-den-comparison.md
// § 9 and StepUpModal.tsx, the only consumer today (OIDC/SAML step-up is
// backend-complete but has no UI trigger yet - seshat-console has no SSO
// login of its own to make that path reachable).
export function useStepUpWithPassword() {
  return useMutation({
    mutationFn: async (body: { current_password: string }) => {
      const { error } = await api.POST('/api/v1/auth/step-up/password', { body })
      if (error) throw error
    },
  })
}
