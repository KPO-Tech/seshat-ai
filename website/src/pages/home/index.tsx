import Hero from './Hero'
import TeamSession from './TeamSession'
import About from './About'
import GitHubRepos from './GitHubRepos'
import Why from './Why'
import Domains from './Domains'
import Portals from './Portals'
import Ecosystem from './Ecosystem'
import Screenshots from './Screenshots'
import AgentSimulator from './AgentSimulator'
import Install from './Install'
import { usePageMeta } from '../../hooks/usePageMeta'
import { useTranslation } from '../../hooks/useTranslation'

export default function Home() {
  const { t } = useTranslation()
  usePageMeta(t.meta.home.title, t.meta.home.description)

  return (
    <>
      <Hero />
      <TeamSession />
      <About />
      <GitHubRepos />
      <Why />
      <Domains />
      <Portals />
      <Ecosystem />
      <Screenshots />
      <AgentSimulator />
      <Install />
    </>
  )
}
