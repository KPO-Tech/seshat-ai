import { useRoutes } from 'react-router'
import { automationRoutes } from './routes'

export function AutomationApp() {
  return useRoutes(automationRoutes)
}
