import createClient from 'openapi-fetch'
import type { paths } from '@/api/schema'
import { useAuthStore } from '@/store/auth'
import { requestStepUp } from '@/store/stepUpModal'

export const api = createClient<paths>({ baseUrl: '' })

// pendingRequestClones lets the step-up retry below replay the exact same
// request after the user re-proves their identity - see onResponse. Cloned
// in onRequest (before openapi-fetch's own fetch() call consumes the
// original's body) and always removed in onResponse regardless of outcome,
// so this never grows unbounded across a session.
const pendingRequestClones = new Map<string, Request>()

api.use({
  onRequest({ request, id }) {
    const token = useAuthStore.getState().token
    if (token) {
      request.headers.set('Authorization', `Bearer ${token}`)
    }
    pendingRequestClones.set(id, request.clone())
    return request
  },
  async onResponse({ response, id }) {
    const retryRequest = pendingRequestClones.get(id)
    pendingRequestClones.delete(id)

    if (response.status === 401) {
      // The session token is gone or expired server-side - drop it locally
      // too so the app falls back to the login screen instead of retrying
      // requests that will keep failing.
      useAuthStore.getState().clear()
      return response
    }

    // See docs/helps/audit-2026-08-29-openwork-den-comparison.md § 9 - a
    // 428 with this specific machine-readable code means the caller is
    // authenticated but needs to prove fresh identity before this
    // particular action proceeds. One interception point here covers every
    // sensitive mutation in the app; none of them need their own handling.
    if (response.status === 428 && retryRequest) {
      let code: string | undefined
      try {
        code = (await response.clone().json())?.error?.code
      } catch {
        // Not a JSON body - fall through and return the original response untouched.
      }
      if (code === 'step_up_required') {
        try {
          await requestStepUp()
          return await fetch(retryRequest)
        } catch {
          // User cancelled the step-up modal - surface the original 428.
          return response
        }
      }
    }
    return response
  },
})
