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
import { useMeta } from '../../hooks/useMeta'
import { useTranslation } from '../../hooks/useTranslation'

export default function Home() {
  const { t } = useTranslation()
  useMeta(t.meta.home.title, t.meta.home.description, t.meta.home.canonical)

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
