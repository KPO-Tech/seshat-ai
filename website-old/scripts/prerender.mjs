import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { Writable } from 'node:stream'
import { fileURLToPath, pathToFileURL } from 'node:url'
import ReactDOMServer from 'react-dom/server'

const { renderToPipeableStream } = ReactDOMServer
const __dirname = dirname(fileURLToPath(import.meta.url))
const websiteDir = resolve(__dirname, '..')
const distDir = resolve(websiteDir, 'dist')
const templatePath = resolve(distDir, 'index.html')
const serverEntryPath = pathToFileURL(resolve(websiteDir, 'dist-server/entry-server.js')).href

const {
  createServerApp,
  PRERENDER_ROUTES,
  getLocaleFromPath,
  getRouteMeta,
} = await import(serverEntryPath)

function renderManagedHead(meta) {
  const alternates = meta.alternates
    .map(alternate => `    <link rel="alternate" hreflang="${alternate.hreflang}" href="${alternate.href}" />`)
    .join('\n')

  const structured = meta.structuredData
    .map(node => `    <script type="application/ld+json" data-route-structured="true">${JSON.stringify(node)}</script>`)
    .join('\n')

  return [
    '    <!-- Primary SEO -->',
    `    <title>${meta.title}</title>`,
    `    <meta name="description" content="${meta.description}" />`,
    '    <meta name="keywords" content="go agent runtime, open source agent runtime, multi-agent runtime, agent runtime go, go ai runtime, agentic runtime, multi-agent AI, AI agent teams, MCP runtime, agent orchestration, LLM orchestration, automation runtime, seshat, seshat ai, cli app, ai automation" />',
    '    <meta name="author" content="Seshat AI" />',
    `    <link rel="canonical" href="${meta.canonical}" />`,
    '',
    '    <!-- Hreflang -->',
    alternates,
    '',
    '    <!-- Open Graph -->',
    '    <meta property="og:type" content="website" />',
    '    <meta property="og:site_name" content="Seshat AI" />',
    `    <meta property="og:title" content="${meta.title}" />`,
    `    <meta property="og:description" content="${meta.description}" />`,
    `    <meta property="og:url" content="${meta.canonical}" />`,
    '    <meta property="og:image" content="https://seshat-ai.com/seshat.png" />',
    '    <meta property="og:image:alt" content="Seshat — AI Agent Runtime" />',
    '',
    '    <!-- Twitter Card -->',
    '    <meta name="twitter:card" content="summary_large_image" />',
    `    <meta name="twitter:title" content="${meta.title}" />`,
    `    <meta name="twitter:description" content="${meta.description}" />`,
    '    <meta name="twitter:image" content="https://seshat-ai.com/seshat.png" />',
    structured ? `\n${structured}` : '',
  ].join('\n')
}

function routeToOutputPath(route) {
  if (route === '/') return resolve(distDir, 'index.html')
  const relative = route.replace(/^\//, '')
  return resolve(distDir, relative, 'index.html')
}

async function renderRoute(url) {
  const app = createServerApp(url)
  return await new Promise((resolvePromise, rejectPromise) => {
    let html = ''
    const stream = new Writable({
      write(chunk, _encoding, callback) {
        html += chunk.toString()
        callback()
      },
    })

    let didPipe = false
    const { pipe } = renderToPipeableStream(app, {
      onAllReady() {
        if (didPipe) return
        didPipe = true
        pipe(stream)
      },
      onError(error) {
        rejectPromise(error)
      },
    })

    stream.on('finish', () => resolvePromise(html))
    stream.on('error', rejectPromise)
  })
}

function generateSitemap(routes) {
  const today = new Date().toISOString().slice(0, 10)
  const entries = routes.map(route => {
    const meta = getRouteMeta(route)
    return [
      '  <url>',
      `    <loc>${meta.canonical}</loc>`,
      ...meta.alternates.map(alternate => `    <xhtml:link rel="alternate" hreflang="${alternate.hreflang}" href="${alternate.href}" />`),
      `    <lastmod>${today}</lastmod>`,
      route.includes('/services') || route.includes('/rest-api') || route.includes('/grpc-api') ? '    <changefreq>monthly</changefreq>' : '    <changefreq>weekly</changefreq>',
      route === '/' || route === '/fr' ? '    <priority>1.0</priority>' : route === '/docs' || route === '/fr/docs' ? '    <priority>0.9</priority>' : route.includes('/docs/') && route.split('/').length > 3 ? '    <priority>0.7</priority>' : '    <priority>0.8</priority>',
      '  </url>',
    ].join('\n')
  })

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
    '        xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...entries,
    '</urlset>',
    '',
  ].join('\n')
}

const template = readFileSync(templatePath, 'utf8')
const routeMetaPattern = /<!-- ROUTE_META_START -->[\s\S]*?<!-- ROUTE_META_END -->/

for (const route of PRERENDER_ROUTES) {
  const meta = getRouteMeta(route)
  const body = await renderRoute(route)
  const documentHtml = template
    .replace('<html lang="en">', `<html lang="${getLocaleFromPath(route)}">`)
    .replace(routeMetaPattern, `<!-- ROUTE_META_START -->\n${renderManagedHead(meta)}\n    <!-- ROUTE_META_END -->`)
    .replace('<div id="root"></div>', `<div id="root">${body}</div>`)

  const outputPath = routeToOutputPath(route)
  mkdirSync(dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, documentHtml, 'utf8')
}

const sitemap = generateSitemap(PRERENDER_ROUTES)
writeFileSync(resolve(distDir, 'sitemap.xml'), sitemap, 'utf8')
writeFileSync(resolve(websiteDir, 'public/sitemap.xml'), sitemap, 'utf8')

console.log(`Prerendered ${PRERENDER_ROUTES.length} routes and wrote sitemap.xml`)
