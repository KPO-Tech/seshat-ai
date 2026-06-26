import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SITE_URL = 'https://seshat-ai.com'

const DOC_SECTIONS = [
  {
    slug: 'getting-started',
    articles: ['installation', 'quick-start', 'configuration', 'first-agent'],
  },
  {
    slug: 'concepts',
    articles: ['what-is-seshat', 'mono-run', 'runtime-modes', 'agent-teams', 'memory-rag', 'skills-mcp', 'tools'],
  },
  {
    slug: 'sdk',
    articles: ['go', 'providers', 'agent', 'prompt', 'go-tools', 'workflows', 'multi-agent', 'dev-integration', 'grpc-api', 'rest-api'],
  },
  {
    slug: 'guides',
    articles: ['cli'],
  },
  {
    slug: 'learn',
    articles: ['agent-runtime', 'why-go', 'mono-run-explained', 'technical-hypotheses'],
  },
]

const STATIC_ROUTES = [
  { path: '/', changefreq: 'weekly', priority: '1.0' },
  { path: '/services', changefreq: 'monthly', priority: '0.8' },
  { path: '/docs', changefreq: 'weekly', priority: '0.9' },
  { path: '/docs/contribution', changefreq: 'monthly', priority: '0.7' },
]

const SECTION_ROUTES = DOC_SECTIONS.map(section => ({
  path: `/docs/${section.slug}`,
  changefreq: 'weekly',
  priority: '0.8',
}))

const ARTICLE_ROUTES = DOC_SECTIONS.flatMap(section =>
  section.articles.map(article => ({
    path: `/docs/${section.slug}/${article}`,
    changefreq: 'monthly',
    priority: '0.7',
  })),
)

const ALL_ROUTES = [...STATIC_ROUTES, ...SECTION_ROUTES, ...ARTICLE_ROUTES]
const today = new Date().toISOString().slice(0, 10)

function absoluteUrl(path) {
  if (path === '/') return `${SITE_URL}/`
  return `${SITE_URL}${path}`
}

function localizedPath(path, locale) {
  if (locale === 'en') return path
  if (path === '/') return '/fr'
  return `/fr${path}`
}

function renderUrl(route, locale) {
  const path = localizedPath(route.path, locale)
  return [
    '  <url>',
    `    <loc>${absoluteUrl(path)}</loc>`,
    `    <xhtml:link rel="alternate" hreflang="en" href="${absoluteUrl(localizedPath(route.path, 'en'))}" />`,
    `    <xhtml:link rel="alternate" hreflang="fr" href="${absoluteUrl(localizedPath(route.path, 'fr'))}" />`,
    `    <xhtml:link rel="alternate" hreflang="x-default" href="${absoluteUrl(localizedPath(route.path, 'en'))}" />`,
    `    <lastmod>${today}</lastmod>`,
    `    <changefreq>${route.changefreq}</changefreq>`,
    `    <priority>${route.priority}</priority>`,
    '  </url>',
  ].join('\n')
}

const xml = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
  '        xmlns:xhtml="http://www.w3.org/1999/xhtml">',
  ...ALL_ROUTES.flatMap(route => [renderUrl(route, 'en'), renderUrl(route, 'fr')]),
  '</urlset>',
  '',
].join('\n')

const __dirname = dirname(fileURLToPath(import.meta.url))
const outputPath = resolve(__dirname, '../public/sitemap.xml')

mkdirSync(dirname(outputPath), { recursive: true })
writeFileSync(outputPath, xml, 'utf8')

console.log(`Generated sitemap with ${ALL_ROUTES.length * 2} URLs at ${outputPath}`)
