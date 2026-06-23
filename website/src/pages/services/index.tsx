import ServicesHero from './ServicesHero'
import ServicesGrid from './ServicesGrid'
import Process from './Process'
import Contact from './Contact'
import { useMeta } from '../../hooks/useMeta'

export default function Services() {
  useMeta(
    'Services & Enterprise — Seshat AI',
    'Professional integration, custom agent deployment and enterprise support for Seshat. Build a real AI workforce with expert guidance from the team behind the runtime.',
    'https://seshat-ai.com/services'
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
