import { useRoutes } from 'react-router'
import { schedulingRoutes } from './routes'

export function SchedulingApp() {
  return useRoutes(schedulingRoutes)
}
