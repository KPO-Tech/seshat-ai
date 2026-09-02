import type { ReactNode } from 'react'
import { Api, Branch, Switch as SwitchIcon, Config, Merge, Time, Robot, Share, DatabaseConfig, Mail, Puzzle, Filter as FilterIcon } from '@icon-park/react'
import { siPostgresql, siMysql, siSqlite, siRedis, siMongodb, siElasticsearch, siGmail } from 'simple-icons'

// Real brand/connector logos: simple-icons (CC0-1.0, public-domain icon path
// data - https://simpleicons.org) rather than any asset bundled by a
// dark-mode-only or restrictively-licensed workflow tool. `.hex` is
// deliberately never used as the fill - that would hardcode a brand color
// bypassing the node's own category tint (and, like every other place this
// session touched, would break in light mode).
const BRAND_ICONS: Record<string, { path: string; title: string }> = {
  postgres: siPostgresql,
  mysql: siMysql,
  sqlite: siSqlite,
  redis: siRedis,
  mongodb: siMongodb,
  elasticsearch: siElasticsearch,
  gmail_new_messages: siGmail,
}

function BrandIcon({ path, title, size }: { path: string; title: string; size: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} role="img" aria-label={title}>
      <path d={path} fill="currentColor" />
    </svg>
  )
}

// Generic/logic/control/AI node types have no real-world brand - existing
// @icon-park/react icons only (already a project dependency).
const GENERIC_ICONS: Record<string, (size: number) => ReactNode> = {
  http_request: (size) => <Api size={size} />,
  filter: (size) => <FilterIcon size={size} />,
  if: (size) => <Branch size={size} />,
  switch: (size) => <SwitchIcon size={size} />,
  set: (size) => <Config size={size} />,
  merge: (size) => <Merge size={size} />,
  wait: (size) => <Time size={size} />,
  agent: (size) => <Robot size={size} />,
  subworkflow: (size) => <Share size={size} />,
}

// Fallback for any node type the live catalog registers that this map
// doesn't know about yet (new backend node type shipped without a frontend
// redeploy) - keyword-matched on the type's own Category so it never
// renders nothing/throws, mirroring how CATEGORY_COLORS already degrades
// gracefully for an unrecognized category.
function fallbackIcon(category: string, size: number): ReactNode {
  const c = category.toLowerCase()
  if (c.includes('ai')) return <Robot size={size} />
  if (c.includes('data')) return <DatabaseConfig size={size} />
  if (c.includes('messag')) return <Mail size={size} />
  return <Puzzle size={size} />
}

export function resolveNodeIcon(dfType: string, category: string, size = 16): ReactNode {
  const brand = BRAND_ICONS[dfType]
  if (brand) return <BrandIcon path={brand.path} title={brand.title} size={size} />
  const generic = GENERIC_ICONS[dfType]
  if (generic) return generic(size)
  return fallbackIcon(category, size)
}

// Converts a category accent hex (from GraphEditor's CATEGORY_COLORS, never
// a raw dark/light-mode hardcode) into a low-alpha background for an icon
// square. Only handles the "#rrggbb" shape those colors are always in.
export function tintColor(hex: string, alpha = 0.16): string {
  const clean = hex.replace('#', '')
  if (clean.length !== 6) return hex
  const r = Number.parseInt(clean.slice(0, 2), 16)
  const g = Number.parseInt(clean.slice(2, 4), 16)
  const b = Number.parseInt(clean.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
