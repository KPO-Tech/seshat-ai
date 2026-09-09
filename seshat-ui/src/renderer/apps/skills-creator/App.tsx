import { useRoutes } from 'react-router'
import { skillsCreatorRoutes } from './routes'

export function SkillsCreatorApp() {
  return useRoutes(skillsCreatorRoutes)
}
