import { en } from '../i18n/en'
import { fr } from '../i18n/fr'
import { DOC_SECTIONS, findArticle, findSection } from '../pages/docs/docs-nav'

export const SITE_URL = 'https://seshat-ai.com'
const ORG_ID = `${SITE_URL}/#organization`

export type AlternateLink = {
  hreflang: string
  href: string
}

export type StructuredDataNode = Record<string, unknown>

export type RouteMeta = {
  title: string
  description: string
  canonical: string
  alternates: AlternateLink[]
  structuredData: StructuredDataNode[]
}

function trimTrailingSlash(pathname: string) {
  if (pathname === '/') return pathname
  return pathname.replace(/\/+$/, '')
}

export function normalizePathname(pathname: string) {
  const [path] = pathname.split(/[?#]/, 1)
  const cleaned = trimTrailingSlash(path || '/')
  return cleaned.startsWith('/') ? cleaned : `/${cleaned}`
}

export function getLocaleFromPath(pathname: string) {
  return normalizePathname(pathname).startsWith('/fr') ? 'fr' : 'en'
}

export function getCanonicalUrl(pathname: string) {
  const normalized = normalizePathname(pathname)
  return normalized === '/' ? `${SITE_URL}/` : `${SITE_URL}${normalized}`
}

function toEnglishPath(pathname: string) {
  const normalized = normalizePathname(pathname)
  if (!normalized.startsWith('/fr')) return normalized
  const stripped = normalized.replace(/^\/fr/, '')
  return stripped || '/'
}

function toFrenchPath(pathname: string) {
  const normalized = normalizePathname(pathname)
  if (normalized.startsWith('/fr')) return normalized
  return normalized === '/' ? '/fr' : `/fr${normalized}`
}

export function getAlternateLinksForPath(pathname: string): AlternateLink[] {
  const enPath = toEnglishPath(pathname)
  const frPath = toFrenchPath(pathname)
  return [
    { hreflang: 'en', href: getCanonicalUrl(enPath) },
    { hreflang: 'fr', href: getCanonicalUrl(frPath) },
    { hreflang: 'x-default', href: getCanonicalUrl(enPath) },
  ]
}

function makeBreadcrumb(pathname: string, parts: Array<{ name: string; path: string }>): StructuredDataNode {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: parts.map((part, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: part.name,
      item: getCanonicalUrl(pathname.startsWith('/fr') ? toFrenchPath(part.path) : part.path),
    })),
  }
}

function makeTechArticle(pathname: string, title: string, description: string): StructuredDataNode {
  return {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: title,
    description,
    inLanguage: getLocaleFromPath(pathname),
    url: getCanonicalUrl(pathname),
    mainEntityOfPage: getCanonicalUrl(pathname),
    author: { '@id': ORG_ID },
    publisher: { '@id': ORG_ID },
  }
}

function getDocsMeta(pathname: string): RouteMeta | null {
  const normalized = normalizePathname(pathname)
  const withoutLocale = normalized.replace(/^\/fr/, '') || '/'
  const segments = withoutLocale.split('/').filter(Boolean)

  if (withoutLocale === '/docs') {
    const title = 'Seshat Docs | Start Here'
    const description = 'Start here for the Seshat documentation: CLI setup, architecture concepts, Go SDK, APIs, and contribution paths for the open-source agent runtime.'
    return {
      title,
      description,
      canonical: getCanonicalUrl(normalized),
      alternates: getAlternateLinksForPath(normalized),
      structuredData: [
        makeBreadcrumb(normalized, [
          { name: 'Docs', path: '/docs' },
        ]),
      ],
    }
  }

  if (withoutLocale === '/docs/contribution') {
    const title = 'Contribute to Seshat | Seshat Docs'
    const description = 'How to contribute to Seshat across the Go runtime, CLI app, seshat-ai platform, future SDKs, documentation, and domain-specific agent workflows.'
    return {
      title,
      description,
      canonical: getCanonicalUrl(normalized),
      alternates: getAlternateLinksForPath(normalized),
      structuredData: [
        makeBreadcrumb(normalized, [
          { name: 'Docs', path: '/docs' },
          { name: 'Contribution', path: '/docs/contribution' },
        ]),
      ],
    }
  }

  if (segments[0] !== 'docs') return null

  const sectionSlug = segments[1] ?? ''
  const articleSlug = segments[2] ?? ''
  const section = findSection(sectionSlug)

  if (!section) return null

  if (!articleSlug) {
    return {
      title: `${section.title} | Seshat Docs`,
      description: section.desc,
      canonical: getCanonicalUrl(normalized),
      alternates: getAlternateLinksForPath(normalized),
      structuredData: [
        makeBreadcrumb(normalized, [
          { name: 'Docs', path: '/docs' },
          { name: section.title, path: `/docs/${section.slug}` },
        ]),
      ],
    }
  }

  const article = findArticle(sectionSlug, articleSlug)
  if (!article) return null

  const title = `${article.title} | Seshat Docs`
  const description = article.desc ?? `Documentation for ${article.title} in the Seshat docs.`

  return {
    title,
    description,
    canonical: getCanonicalUrl(normalized),
    alternates: getAlternateLinksForPath(normalized),
    structuredData: [
      makeBreadcrumb(normalized, [
        { name: 'Docs', path: '/docs' },
        { name: section.title, path: `/docs/${section.slug}` },
        { name: article.title, path: `/docs/${section.slug}/${article.slug}` },
      ]),
      makeTechArticle(normalized, title, description),
    ],
  }
}

export function getRouteMeta(pathname: string): RouteMeta {
  const normalized = normalizePathname(pathname)
  const docsMeta = getDocsMeta(normalized)
  if (docsMeta) return docsMeta

  const locale = getLocaleFromPath(normalized)
  const translations = locale === 'fr' ? fr : en
  const withoutLocale = normalized.replace(/^\/fr/, '') || '/'

  if (withoutLocale === '/services') {
    return {
      title: translations.meta.services.title,
      description: translations.meta.services.description,
      canonical: getCanonicalUrl(normalized),
      alternates: getAlternateLinksForPath(normalized),
      structuredData: [],
    }
  }

  return {
    title: translations.meta.home.title,
    description: translations.meta.home.description,
    canonical: getCanonicalUrl(normalized),
    alternates: getAlternateLinksForPath(normalized),
    structuredData: [],
  }
}

const docSectionRoutes = DOC_SECTIONS.map(section => `/docs/${section.slug}`)
const docArticleRoutes = DOC_SECTIONS.flatMap(section =>
  section.articles.filter(article => article.available).map(article => `/docs/${section.slug}/${article.slug}`),
)

const englishRoutes = [
  '/',
  '/services',
  '/docs',
  '/docs/contribution',
  ...docSectionRoutes,
  ...docArticleRoutes,
]

export const PRERENDER_ROUTES = Array.from(new Set([
  ...englishRoutes,
  ...englishRoutes.map(route => (route === '/' ? '/fr' : `/fr${route}`)),
]))
