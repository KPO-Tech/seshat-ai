import ServicesHero from './ServicesHero'
import ServicesGrid from './ServicesGrid'
import Process from './Process'
import Contact from './Contact'
import { usePageMeta } from '../../hooks/usePageMeta'
import { useTranslation } from '../../hooks/useTranslation'

export default function Services() {
  const { t } = useTranslation()
  usePageMeta(t.meta.services.title, t.meta.services.description)

  return (
    <>
      <ServicesHero />
      <ServicesGrid />
      <Process />
      <Contact />
    </>
  )
}
