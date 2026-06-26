import { useLocation } from 'react-router-dom'
import { getRouteMeta } from '../../seo/routeMeta'
import { usePageMeta } from '../../hooks/usePageMeta'

export function useDocsMeta(title: string, description: string) {
  const { pathname } = useLocation()
  const meta = getRouteMeta(pathname)
  usePageMeta(title, description, {
    structuredData: meta.structuredData,
  })
}
