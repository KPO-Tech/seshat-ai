import ServicesHero from './ServicesHero'
import ServicesGrid from './ServicesGrid'
import Process from './Process'
import Contact from './Contact'
import { usePageMeta } from '../../hooks/usePageMeta'
import { useTranslation } from '../../hooks/useTranslation'

export default function Services() {
  const { lang } = useTranslation()
  usePageMeta(
    lang === 'fr'
      ? 'Services & Equipes IA | Seshat'
      : 'Services & AI Teams | Seshat',
    lang === 'fr'
      ? 'Services Seshat pour workflows documentaires, connaissance interne, finance et operations back-office avec gouvernance, deploiement serieux et pilotage par cas d usage.'
      : 'Seshat services for document workflows, internal knowledge, finance, and back-office operations with governed execution and pilot-first delivery.',
  )

  return (
    <>
      <ServicesHero />
      <ServicesGrid />
      <Process />
      <Contact />
    </>
  )
}
