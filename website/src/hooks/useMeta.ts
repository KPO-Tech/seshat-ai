import { useEffect } from 'react'

export function useMeta(title: string, description: string, canonical?: string) {
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
    }
  }, [title, description, canonical])
}
