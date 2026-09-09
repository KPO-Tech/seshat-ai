import {
  Code, CodeBrackets, Bug, Experiment, TestTube, BranchOne, Merge, Terminal,
  RocketOne, Play, Cycle, Refresh, Magic, MagicWand, Lightning, Robot,
  FileText, Notebook, NotebookAndPen, BookOpen, Write, Log,
  Search, Filter, ChartGraph, Monitor, Target, Focus, ZoomIn, Tag,
  Edit, FolderOpen,
  Api, Server, DatabaseCode, Link, Connect, Share, SendEmail,
  CheckOne, Star, Flag, Shield, Lock, Key, Info, Timer, Globe,
} from '@icon-park/react'
// ─── Skill icon library (icon-park) — moved from settings/CapabilitiesViews.tsx
// when the Settings → Capabilities → Skills tab merged into this page ─────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type IconComp = React.ComponentType<any>

export const SKILL_ICON_GROUPS: { label: string; icons: { name: string; Icon: IconComp }[] }[] = [
  { label: 'Dev', icons: [
    { name: 'Code',           Icon: Code },
    { name: 'CodeBrackets',   Icon: CodeBrackets },
    { name: 'Terminal',       Icon: Terminal },
    { name: 'Bug',            Icon: Bug },
    { name: 'Experiment',     Icon: Experiment },
    { name: 'TestTube',       Icon: TestTube },
    { name: 'BranchOne',      Icon: BranchOne },
    { name: 'Merge',          Icon: Merge },
  ]},
  { label: 'Build', icons: [
    { name: 'RocketOne',      Icon: RocketOne },
    { name: 'Play',           Icon: Play },
    { name: 'Cycle',          Icon: Cycle },
    { name: 'Refresh',        Icon: Refresh },
    { name: 'Magic',          Icon: Magic },
    { name: 'MagicWand',      Icon: MagicWand },
    { name: 'Lightning',      Icon: Lightning },
    { name: 'Robot',          Icon: Robot },
  ]},
  { label: 'Files', icons: [
    { name: 'FileText',       Icon: FileText },
    { name: 'Notebook',       Icon: Notebook },
    { name: 'NotebookAndPen', Icon: NotebookAndPen },
    { name: 'BookOpen',       Icon: BookOpen },
    { name: 'Write',          Icon: Write },
    { name: 'Edit',           Icon: Edit },
    { name: 'FolderOpen',     Icon: FolderOpen },
    { name: 'Log',            Icon: Log },
  ]},
  { label: 'Search', icons: [
    { name: 'Search',         Icon: Search },
    { name: 'Filter',         Icon: Filter },
    { name: 'ChartGraph',     Icon: ChartGraph },
    { name: 'Monitor',        Icon: Monitor },
    { name: 'Target',         Icon: Target },
    { name: 'Focus',          Icon: Focus },
    { name: 'ZoomIn',         Icon: ZoomIn },
    { name: 'Tag',            Icon: Tag },
  ]},
  { label: 'Network', icons: [
    { name: 'Api',            Icon: Api },
    { name: 'Globe',          Icon: Globe },
    { name: 'Server',         Icon: Server },
    { name: 'DatabaseCode',   Icon: DatabaseCode },
    { name: 'Link',           Icon: Link },
    { name: 'Connect',        Icon: Connect },
    { name: 'Share',          Icon: Share },
    { name: 'SendEmail',      Icon: SendEmail },
  ]},
  { label: 'Status', icons: [
    { name: 'CheckOne',       Icon: CheckOne },
    { name: 'Star',           Icon: Star },
    { name: 'Flag',           Icon: Flag },
    { name: 'Shield',         Icon: Shield },
    { name: 'Lock',           Icon: Lock },
    { name: 'Key',            Icon: Key },
    { name: 'Info',           Icon: Info },
    { name: 'Timer',          Icon: Timer },
  ]},
]

export const SKILL_ICON_LOOKUP: Record<string, IconComp> = Object.fromEntries(
  SKILL_ICON_GROUPS.flatMap(g => g.icons).map(({ name, Icon }) => [name, Icon])
)

const SKILL_ICON_DEFAULTS: [string, string][] = [
  ['commit', 'BranchOne'], ['git', 'BranchOne'],   ['branch', 'BranchOne'],
  ['review', 'Search'],    ['analyze', 'ChartGraph'], ['chart', 'ChartGraph'],
  ['test', 'TestTube'],    ['spec', 'TestTube'],
  ['deploy', 'RocketOne'], ['release', 'RocketOne'], ['launch', 'RocketOne'],
  ['debug', 'Bug'],
  ['doc', 'NotebookAndPen'], ['readme', 'NotebookAndPen'], ['write', 'Write'],
  ['refactor', 'Cycle'],   ['clean', 'Cycle'],
  ['merge', 'Merge'],      ['migrate', 'Merge'],
  ['search', 'Search'],    ['find', 'Search'],
  ['build', 'Code'],       ['compile', 'Code'],
  ['lint', 'CheckOne'],    ['check', 'CheckOne'],   ['format', 'Edit'],
  ['generate', 'Magic'],   ['magic', 'Magic'],
  ['api', 'Api'],          ['server', 'Server'],    ['network', 'Connect'],
  ['data', 'DatabaseCode'], ['db', 'DatabaseCode'],
  ['file', 'FileText'],    ['folder', 'FolderOpen'],
  ['log', 'Log'],          ['monitor', 'Monitor'],
  ['security', 'Shield'],  ['auth', 'Lock'],        ['key', 'Key'],
  ['share', 'Share'],      ['export', 'Share'],
  ['robot', 'Robot'],      ['ai', 'Robot'],
  ['star', 'Star'],        ['flag', 'Flag'],
  ['time', 'Timer'],       ['link', 'Link'],
  ['script', 'Terminal'],  ['bash', 'Terminal'],
  ['target', 'Target'],    ['globe', 'Globe'],      ['translate', 'Globe'],
  ['code', 'CodeBrackets'], ['experiment', 'Experiment'],
]

export function getDefaultIconName(skillName: string): string {
  const lower = skillName.toLowerCase()
  for (const [kw, icon] of SKILL_ICON_DEFAULTS) {
    if (lower.includes(kw)) return icon
  }
  return 'Code'
}

const SKILL_ICON_STORE_KEY = 'nexus:skill-icons'

export function loadSkillIcons(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(SKILL_ICON_STORE_KEY) ?? '{}') }
  catch { return {} }
}

export function saveSkillIcon(skillName: string, iconName: string) {
  const store = loadSkillIcons()
  store[skillName] = iconName
  localStorage.setItem(SKILL_ICON_STORE_KEY, JSON.stringify(store))
}
