import { useRoutes } from 'react-router'
import { knowledgeRoutes } from './routes'

export function KnowledgeApp() {
  return useRoutes(knowledgeRoutes)
}
