import { useLocation } from 'react-router-dom'
import { getAlternateLinksForPath, getCanonicalUrl, getLocaleFromPath, type StructuredDataNode } from '../seo/routeMeta'
import { useMeta } from './useMeta'

type PageMetaOptions = {
  structuredData?: StructuredDataNode[]
}

export function usePageMeta(title: string, description: string, options?: PageMetaOptions) {
  const { pathname } = useLocation()
  useMeta(title, description, getCanonicalUrl(pathname), {
    alternates: getAlternateLinksForPath(pathname),
    structuredData: options?.structuredData,
    lang: getLocaleFromPath(pathname),
  })
}
