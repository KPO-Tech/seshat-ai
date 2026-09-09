import { useRoutes } from 'react-router'
import { inboxRoutes } from './routes'

export function InboxApp() {
  return useRoutes(inboxRoutes)
}
