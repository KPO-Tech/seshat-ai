import type { ReactNode } from 'react'
import {
  Api,
  Branch,
  Switch as SwitchIcon,
  Config,
  Merge,
  Time,
  Robot,
  Share,
  DatabaseConfig,
  Mail,
  Puzzle,
  Filter as FilterIcon,
  MessageOne,
  IdCard,
  CooperativeHandshake,
} from '@icon-park/react'
import {
  siPostgresql,
  siMysql,
  siSqlite,
  siRedis,
  siMongodb,
  siElasticsearch,
  siGmail,
  siNotion,
  siStripe,
  siGooglesheets,
  siGooglecalendar,
  siJira,
  siGithub,
  siAsana,
  siLinear,
  siHubspot,
  siIntercom,
  siMailgun,
  siTelegram,
  siDiscord,
  siTrello,
  siAirtable,
  siZendesk,
} from 'simple-icons'

// Real brand/connector logos: simple-icons (CC0-1.0, public-domain icon path
// data - https://simpleicons.org) rather than any asset bundled by a
// dark-mode-only or restrictively-licensed workflow tool. `.hex` is
// deliberately never used as the fill - that would hardcode a brand color
// bypassing the node's own category tint (and, like every other place this
// session touched, would break in light mode).
//
// Every connector-node type registered across the SaaS connectors
// initiative (see helps/roadmap.md's Batch 1-4 entries) gets an entry here
// when simple-icons actually has that brand - checked against the
// installed package's real export list, not assumed from a naming
// convention (several enterprise SaaS marks simple-icons deliberately
// omits: Salesforce, Pipedrive, SendGrid, Postmark, and Microsoft's own
// Outlook/Teams sub-brands all have no entry in this library at all).
// Those fall through to GENERIC_ICONS/fallbackIcon below instead of a
// fabricated logo.
const BRAND_ICONS: Record<string, { path: string; title: string }> = {
  postgres: siPostgresql,
  mysql: siMysql,
  sqlite: siSqlite,
  redis: siRedis,
  mongodb: siMongodb,
  elasticsearch: siElasticsearch,
  gmail_new_messages: siGmail,
  gmail_send_email: siGmail,
  notion_create_page: siNotion,
  stripe_create_customer: siStripe,
  gsheets_append_row: siGooglesheets,
  gcalendar_create_event: siGooglecalendar,
  jira_create_issue: siJira,
  github_create_issue: siGithub,
  asana_create_task: siAsana,
  linear_create_issue: siLinear,
  hubspot_create_contact: siHubspot,
  intercom_create_contact: siIntercom,
  mailgun_send_email: siMailgun,
  telegram_send_message: siTelegram,
  discord_send_message: siDiscord,
  trello_create_card: siTrello,
  airtable_create_record: siAirtable,
  zendesk_create_ticket: siZendesk,
}

function BrandIcon({ path, title, size }: { path: string; title: string; size: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} role="img" aria-label={title}>
      <path d={path} fill="currentColor" />
    </svg>
  )
}

// Generic/logic/control/AI node types have no real-world brand - existing
// @icon-park/react icons only (already a project dependency). The last
// three below are connector nodes whose vendor has no simple-icons entry
// (see BRAND_ICONS' doc comment) - a topically fitting generic glyph
// stands in, deliberately not a fabricated brand mark. teams_send_message
// gets its own entry rather than falling through to fallbackIcon's
// Messaging→Mail bucket: Teams is chat, not email, and Mail read as
// actively wrong for it, not just generic.
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
  teams_send_message: (size) => <MessageOne size={size} />,
  salesforce_create_record: (size) => <IdCard size={size} />,
  pipedrive_create_deal: (size) => <CooperativeHandshake size={size} />,
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
