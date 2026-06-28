import Hero from './Hero'
import GitHubRepos from './GitHubRepos'
import Why from './Why'
import Ecosystem from './Ecosystem'
import Screenshots from './Screenshots'
import Install from './Install'
import { usePageMeta } from '../../hooks/usePageMeta'
import { useTranslation } from '../../hooks/useTranslation'

export default function Home() {
  const { t } = useTranslation()
  usePageMeta(t.meta.home.title, t.meta.home.description)

  return (
    <>
      <Hero />
      <Why />
      <Ecosystem />
      <GitHubRepos />
      <Screenshots />
      <Install />
    </>
  )
}
