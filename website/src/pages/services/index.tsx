import ServicesHero from './ServicesHero'
import ServicesGrid from './ServicesGrid'
import Process from './Process'
import Contact from './Contact'
import { useMeta } from '../../hooks/useMeta'
import { useTranslation } from '../../hooks/useTranslation'

export default function Services() {
  const { t } = useTranslation()
  useMeta(t.meta.services.title, t.meta.services.description, t.meta.services.canonical)

  return (
    <>
      <ServicesHero />
      <ServicesGrid />
      <Process />
      <Contact />
    </>
  )
}
