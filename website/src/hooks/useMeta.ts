import { useEffect, useMemo } from 'react'
import type { AlternateLink, StructuredDataNode } from '../seo/routeMeta'

type MetaOptions = {
  alternates?: AlternateLink[]
  structuredData?: StructuredDataNode[]
  lang?: string
}

function syncAlternates(alternates: AlternateLink[]) {
  document.head.querySelectorAll('link[rel="alternate"][hreflang]').forEach(node => node.remove())
  alternates.forEach(alternate => {
    const link = document.createElement('link')
    link.setAttribute('rel', 'alternate')
    link.setAttribute('hreflang', alternate.hreflang)
    link.setAttribute('href', alternate.href)
    document.head.appendChild(link)
  })
}

function syncStructuredData(structuredData: StructuredDataNode[]) {
  document.head.querySelectorAll('script[data-route-structured="true"]').forEach(node => node.remove())
  structuredData.forEach(node => {
    const script = document.createElement('script')
    script.type = 'application/ld+json'
    script.dataset.routeStructured = 'true'
    script.textContent = JSON.stringify(node)
    document.head.appendChild(script)
  })
}

export function useMeta(title: string, description: string, canonical?: string, options?: MetaOptions) {
  const alternatesKey = useMemo(() => JSON.stringify(options?.alternates ?? []), [options?.alternates])
  const structuredDataKey = useMemo(() => JSON.stringify(options?.structuredData ?? []), [options?.structuredData])

  useEffect(() => {
    document.title = title

    const setMeta = (selector: string, content: string) => {
      const el = document.querySelector(selector)
      if (el) el.setAttribute('content', content)
    }

    setMeta('meta[name="description"]', description)
    setMeta('meta[property="og:title"]', title)
    setMeta('meta[property="og:description"]', description)
    setMeta('meta[name="twitter:title"]', title)
    setMeta('meta[name="twitter:description"]', description)

    if (canonical) {
      const link = document.querySelector('link[rel="canonical"]')
      if (link) link.setAttribute('href', canonical)
      setMeta('meta[property="og:url"]', canonical)
    }

    if (options?.lang) document.documentElement.lang = options.lang
    if (options?.alternates) syncAlternates(options.alternates)
    if (options?.structuredData) syncStructuredData(options.structuredData)
  }, [title, description, canonical, options?.lang, alternatesKey, structuredDataKey])
}
