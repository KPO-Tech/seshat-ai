import createClient from 'openapi-fetch'
import type { paths } from '@/api/schema'
import { useAuthStore } from '@/store/auth'

export const api = createClient<paths>({ baseUrl: '' })

api.use({
  onRequest({ request }) {
    const token = useAuthStore.getState().token
    if (token) {
      request.headers.set('Authorization', `Bearer ${token}`)
    }
    return request
  },
  onResponse({ response }) {
    if (response.status === 401) {
      // The session token is gone or expired server-side - drop it locally
      // too so the app falls back to the login screen instead of retrying
      // requests that will keep failing.
      useAuthStore.getState().clear()
    }
    return response
  },
})
