import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Plus, Search, Close, Sync, Attention, Down,
  Edit, Upload, Check, Terminal, Globe,
  // Skill icon picker icons
  Code, CodeBrackets, Bug, Experiment, TestTube, BranchOne, Merge,
  RocketOne, Play, Cycle, Refresh, Magic, MagicWand, Lightning, Robot,
  FileText, Notebook, NotebookAndPen, BookOpen, Write, FolderOpen, Log,
  Filter, ChartGraph, Monitor, Target, Focus, ZoomIn, Tag,
  Api, Server, DatabaseCode, Link, Connect, Share, SendEmail,
  CheckOne, Star, Flag, Shield, Lock, Key, Info, Timer,
} from '@icon-park/react'
import { api } from '@/api/client'

// ─── Types ────────────────────────────────────────────────────────────────────

type Skill = {
  name: string
  display_name: string
  description: string
  user_invocable: boolean
  source: string
  collection: string
  version: string
  is_hidden: boolean
  argument_hint: string
  enabled: boolean
}

type RepoInfo = {
  name: string
  url: string
  skill_count: number
}

type CatalogEntry = {
  name: string
  url: string
  description: string
  installed: boolean
}

type MCPServer = {
  id: string
  name: string
  display_name: string
  server_type: string   // stdio | http | sse | ws
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
  headers?: Record<string, string>
  timeout_secs: number
  icon: string
  enabled: boolean
  source: string        // 'db' | 'file'
  created_at: number
  updated_at: number
}

type ReloadStatus = { name: string; ok: boolean; tools: number; error?: string }

const EMPTY_SERVER: Omit<MCPServer, 'id' | 'source' | 'created_at' | 'updated_at'> = {
  name: '', display_name: '', server_type: 'stdio',
  command: '', args: [], env: {}, url: '', headers: {},
  timeout_secs: 30, icon: '🔌', enabled: true,
}

type CapTab = 'skills' | 'mcp' | 'multimodal'

// ─── Skill icon library (icon-park) ──────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type IconComp = React.ComponentType<any>

const SKILL_ICON_GROUPS: { label: string; icons: { name: string; Icon: IconComp }[] }[] = [
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

const SKILL_ICON_LOOKUP: Record<string, IconComp> = Object.fromEntries(
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

function getDefaultIconName(skillName: string): string {
  const lower = skillName.toLowerCase()
  for (const [kw, icon] of SKILL_ICON_DEFAULTS) {
    if (lower.includes(kw)) return icon
  }
  return 'Code'
}

// ─── Skill icon persistence (localStorage) ───────────────────────────────────

const SKILL_ICON_STORE_KEY = 'nexus:skill-icons'

function loadSkillIcons(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(SKILL_ICON_STORE_KEY) ?? '{}') }
  catch { return {} }
}

function saveSkillIcon(skillName: string, iconName: string) {
  const store = loadSkillIcons()
  store[skillName] = iconName
  localStorage.setItem(SKILL_ICON_STORE_KEY, JSON.stringify(store))
}

function isSkillEnabled(skill: Skill): boolean {
  return skill.enabled !== false
}


// ─── Top-level view ───────────────────────────────────────────────────────────

export function CapabilitiesView() {
  const [tab, setTab] = useState<CapTab>('skills')

  return (
    <div className="sv-view">
      <header className="sv-view-header" style={{ marginBottom: 28 }}>
        <div className="sv-header-info">
          <h1>Capabilities</h1>
          <p>Skills, MCP servers, and multimodal extensions for your agents</p>
        </div>
      </header>

      <div className="caps-tabs">
        {(['skills', 'mcp', 'multimodal'] as CapTab[]).map(t => (
          <button
            key={t}
            className={`caps-tab-btn ${tab === t ? 'active' : ''}`}
            onClick={() => setTab(t)}
          >
            {t === 'skills' ? 'Skills' : t === 'mcp' ? 'MCP' : 'Multimodal'}
          </button>
        ))}
      </div>

      <div className="caps-tab-content">
        {tab === 'skills'     && <SkillsPanel />}
        {tab === 'mcp'        && <McpPanel />}
        {tab === 'multimodal' && <MultimodalPanel />}
      </div>
    </div>
  )
}

// ─── Skills panel ─────────────────────────────────────────────────────────────

function SkillsPanel() {
  const [skills, setSkills] = useState<Skill[]>([])
  const [repoData, setRepoData] = useState<{ installed: RepoInfo[]; catalog: CatalogEntry[] }>({ installed: [], catalog: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [showInstaller, setShowInstaller] = useState(false)
  const [repoManagementAvailable, setRepoManagementAvailable] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const skillRes = await api.get<{ skills: Skill[]; count: number }>('/skills')
      let repoRes: { installed: RepoInfo[]; catalog: CatalogEntry[] } = { installed: [], catalog: [] }
      let reposAvailable = true
      try {
        repoRes = await api.get<{ installed: RepoInfo[]; catalog: CatalogEntry[] }>('/skills/repos')
      } catch {
        reposAvailable = false
      }
      setSkills(skillRes.skills ?? [])
      setRepoData(repoRes)
      setRepoManagementAvailable(reposAvailable)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load skills')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleDelete = async (skill: Skill) => {
    if (!confirm(`Delete skill "${skill.display_name || skill.name}"?`)) return
    try {
      await api.delete(`/skills/${encodeURIComponent(skill.name)}`)
      setSkills(s => s.filter(x => x.name !== skill.name))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to delete skill')
    }
  }

  const handleToggle = async (skill: Skill) => {
    if (!isUserSkill(skill)) return
    const nextEnabled = !isSkillEnabled(skill)
    try {
      await api.put("/skills/" + encodeURIComponent(skill.name), { enabled: nextEnabled })
      setSkills(current => current.map(entry => entry.name === skill.name ? { ...entry, enabled: nextEnabled } : entry))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to update skill")
    }
  }

  const filtered = query
    ? skills.filter(s =>
        (s.display_name || s.name).toLowerCase().includes(query.toLowerCase()) ||
        s.description.toLowerCase().includes(query.toLowerCase())
      )
    : skills

  const groups = groupSkillsByCollection(filtered)
  const enabledCount = filtered.filter(isSkillEnabled).length

  return (
    <>
      <div className="caps-tab-header">
        <div className="caps-header-left">
          <span className="caps-count-badge">
            {loading ? '…' : `${enabledCount}/${filtered.length} active`}
          </span>
          <button className="caps-icon-btn" title="Refresh" onClick={load}>
            <Sync size={16} />
          </button>
        </div>
        <div className="caps-header-right">
          <div className="caps-search-box">
            <Search size={14} />
            <input
              type="text"
              placeholder="Search skills…"
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </div>
          {repoManagementAvailable && (
            <button className="caps-add-mcp-btn" onClick={() => setShowInstaller(true)}>
              <Plus size={14} /> Install Skills
            </button>
          )}
        </div>
      </div>

      {error && <div className="caps-error">{error}</div>}

      {loading ? (
        <div className="caps-loading">Loading skills…</div>
      ) : groups.length === 0 ? (
        <div className="caps-empty">No skills found{query ? ` for "${query}"` : ''}</div>
      ) : (
        <div className="caps-skills-groups">
          {groups.map(g => (
            <SkillGroup
              key={g.collection}
              collection={g.collection}
              skills={g.skills}
              onToggle={handleToggle}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {repoManagementAvailable && showInstaller && (
        <RepoManagerModal
          catalog={repoData.catalog}
          installed={repoData.installed}
          onClose={() => setShowInstaller(false)}
          onChanged={() => { load(); setShowInstaller(false) }}
        />
      )}
    </>
  )
}

// ─── Collection grouping helpers ──────────────────────────────────────────────

const KNOWN_COLLECTIONS_ORDER = ['builtin', 'managed', 'user']
const TRAILING_COLLECTIONS = ['project', 'mcp']

const COLLECTION_LABEL: Record<string, string> = {
  builtin: 'Built-in',
  managed: 'Managed',
  user: 'User',
  mcp: 'MCP',
  project: 'Project',
}

function groupSkillsByCollection(skills: Skill[]) {
  const map = new Map<string, Skill[]>()
  for (const sk of skills) {
    const coll = sk.collection || 'user'
    const arr = map.get(coll) ?? []
    arr.push(sk)
    map.set(coll, arr)
  }
  const result: { collection: string; skills: Skill[] }[] = []
  for (const coll of KNOWN_COLLECTIONS_ORDER) {
    const g = map.get(coll)
    if (g) { result.push({ collection: coll, skills: g }); map.delete(coll) }
  }
  const repoCols = [...map.keys()].filter(k => !TRAILING_COLLECTIONS.includes(k)).sort()
  for (const coll of repoCols) {
    result.push({ collection: coll, skills: map.get(coll)! }); map.delete(coll)
  }
  for (const coll of TRAILING_COLLECTIONS) {
    const g = map.get(coll)
    if (g) result.push({ collection: coll, skills: g })
  }
  return result
}

function SkillGroup({ collection, skills, onToggle, onDelete }: {
  collection: string
  skills: Skill[]
  onToggle: (skill: Skill) => void
  onDelete: (skill: Skill) => void
}) {
  const [open, setOpen] = useState(true)
  const label = COLLECTION_LABEL[collection] ?? collection.charAt(0).toUpperCase() + collection.slice(1)
  const isRepo = !KNOWN_COLLECTIONS_ORDER.includes(collection) && !TRAILING_COLLECTIONS.includes(collection)

  return (
    <div className="caps-skill-group">
      <button className="caps-group-header" onClick={() => setOpen(o => !o)}>
        <Down size={12} style={{ transform: open ? 'none' : 'rotate(-90deg)', transition: 'transform 0.15s', flexShrink: 0 }} />
        <span className="caps-group-name">{label}</span>
        {isRepo && <span className="caps-repo-pill">repo</span>}
        <span className="caps-group-count">{skills.length}</span>
      </button>
      {open && (
        <div className="caps-skills-list">
          {skills.map(skill => (
            <SkillItem
              key={skill.name}
              skill={skill}
              onToggle={() => onToggle(skill)}
              onDelete={() => onDelete(skill)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

const COLLECTION_COLORS: Record<string, string> = {
  builtin:  'var(--color-cta)',
  managed:  '#FF7D00',
  mcp:      '#0FC6C2',
  user:     '#7B61FF',
  project:  '#00B42A',
}

const KNOWN_COLLECTIONS = new Set(['builtin', 'managed', 'mcp', 'user', 'project'])

function collectionColor(collection: string): string {
  return COLLECTION_COLORS[collection] ?? '#6366f1'
}

function collectionTag(collection: string): string {
  if (collection === 'builtin') return 'Built-in'
  if (collection === 'managed') return 'Managed'
  if (collection === 'mcp')     return 'MCP'
  if (collection === 'user')    return 'User'
  if (collection === 'project') return 'Project'
  return collection  // repo name
}

function isUserSkill(skill: Skill) {
  return skill.collection === 'user'
}

function SkillItem({ skill, onToggle, onDelete }: {
  skill: Skill
  onToggle: () => void
  onDelete: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerPos, setPickerPos] = useState({ top: 0, left: 0 })
  const [iconName, setIconName] = useState<string>(() => {
    const store = loadSkillIcons()
    return store[skill.name] ?? getDefaultIconName(skill.name)
  })
  const iconBtnRef = useRef<HTMLButtonElement>(null)

  const display  = skill.display_name || skill.name
  const enabled  = isSkillEnabled(skill)
  const color    = collectionColor(skill.collection)
  const tag      = collectionTag(skill.collection)
  const isRepo   = skill.collection && !KNOWN_COLLECTIONS.has(skill.collection)
  const IconComp = SKILL_ICON_LOOKUP[iconName] ?? Code

  const handleIconClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (iconBtnRef.current) {
      const r = iconBtnRef.current.getBoundingClientRect()
      const pickerH = 280
      const top = r.bottom + 6 + pickerH > window.innerHeight ? r.top - pickerH - 6 : r.bottom + 6
      const left = Math.min(r.left, window.innerWidth - 300)
      setPickerPos({ top, left })
    }
    setPickerOpen(p => !p)
  }

  const handleIconSelect = (name: string) => {
    setIconName(name)
    saveSkillIcon(skill.name, name)
    setPickerOpen(false)
  }

  return (
    <div className={`caps-skill-item ${enabled ? '' : 'skill-off'}`}>
      <button
        ref={iconBtnRef}
        className="caps-skill-icon-btn"
        style={{ background: color }}
        onClick={handleIconClick}
        title="Change icon"
      >
        <IconComp size={20} />
      </button>

      <div className="caps-skill-info">
        <div className="caps-skill-name">
          {display}
          <span className="caps-skill-tag">{tag}</span>
          {skill.version && <span className="caps-skill-version">v{skill.version}</span>}
          <code className="caps-skill-slash">/{skill.name}</code>
        </div>
        {skill.description ? (
          <button className="caps-skill-expand-btn" onClick={() => setExpanded(e => !e)}>
            <Down size={11} style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }} />
            {expanded ? 'Hide' : 'Description'}
          </button>
        ) : null}
        {expanded && skill.description && (
          <p className="caps-skill-desc">{skill.description}</p>
        )}
      </div>

      <div className="caps-skill-actions">
        {isUserSkill(skill) && (
          <label className="caps-skill-toggle-lbl" title={enabled ? 'Disable' : 'Enable'}>
            <input type="checkbox" checked={enabled} onChange={onToggle} />
            <span className="caps-skill-toggle-track" />
          </label>
        )}
        {isUserSkill(skill) && (
          <button className="caps-mini-btn danger" title="Delete" onClick={onDelete}>
            <Close size={13} />
          </button>
        )}
      </div>

      {pickerOpen && (
        <SkillIconPicker
          pos={pickerPos}
          currentIcon={iconName}
          onSelect={handleIconSelect}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  )
}

function SkillIconPicker({ pos, currentIcon, onSelect, onClose }: {
  pos: { top: number; left: number }
  currentIcon: string
  onSelect: (name: string) => void
  onClose: () => void
}) {
  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 9998 }} onClick={onClose} />
      <div className="sip-panel" style={{ top: pos.top, left: pos.left }}>
        {SKILL_ICON_GROUPS.map(group => (
          <div key={group.label} className="sip-group">
            <div className="sip-group-label">{group.label}</div>
            <div className="sip-group-icons">
              {group.icons.map(({ name, Icon }) => (
                <button
                  key={name}
                  className={`sip-icon-btn ${name === currentIcon ? 'active' : ''}`}
                  onClick={() => onSelect(name)}
                  title={name}
                >
                  <Icon size={18} />
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

// ─── Repo manager modal ───────────────────────────────────────────────────────

function repoNameFromURL(url: string): string {
  return url.replace(/\.git$/, '').split('/').filter(Boolean).pop() ?? url
}

function RepoManagerModal({ catalog, installed, onClose, onChanged }: {
  catalog: CatalogEntry[]
  installed: RepoInfo[]
  onClose: () => void
  onChanged: () => void
}) {
  const [url, setUrl] = useState('')
  const [installing, setInstalling] = useState<string | null>(null)
  const [uninstalling, setUninstalling] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [localInstalled, setLocalInstalled] = useState<Set<string>>(
    () => new Set([...catalog.filter(c => c.installed).map(c => c.name), ...installed.map(r => r.name)])
  )

  const installRepo = async (repoUrl: string) => {
    const name = repoNameFromURL(repoUrl)
    setInstalling(repoUrl)
    setErr(null)
    try {
      await api.post('/skills/repos', { url: repoUrl })
      setLocalInstalled(s => { const n = new Set(s); n.add(name); return n })
      setUrl('')
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed to install')
    } finally {
      setInstalling(null)
    }
  }

  const uninstallRepo = async (name: string) => {
    setUninstalling(name)
    setErr(null)
    try {
      await api.delete(`/skills/repos/${encodeURIComponent(name)}`)
      setLocalInstalled(s => { const n = new Set(s); n.delete(name); return n })
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed to uninstall')
    } finally {
      setUninstalling(null)
    }
  }

  // Repos installed but not in catalog
  const installedNames = localInstalled
  const uncataloged = installed.filter(r => !catalog.some(c => c.name === r.name) && installedNames.has(r.name))

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onChanged()}>
      <div className="modal-shell repo-modal-shell">
        <div className="modal-header">
          <h2>Install Skills</h2>
          <button className="modal-close-btn" onClick={onChanged}><Close size={20} /></button>
        </div>
        <div className="modal-content" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {err && <div className="caps-error">{err}</div>}

          <div className="sv-field">
            <label>Install from GitHub</label>
            <div className="repo-url-row">
              <div className="sv-input-box" style={{ flex: 1 }}>
                <input
                  type="text"
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  placeholder="https://github.com/user/skill-collection"
                  onKeyDown={e => e.key === 'Enter' && url.trim() && installRepo(url.trim())}
                />
              </div>
              <button
                className="caps-reload-btn"
                disabled={!url.trim() || !!installing}
                onClick={() => installRepo(url.trim())}
              >
                {installing && installing === url.trim() ? <Sync size={12} /> : <Upload size={12} />}
                {installing && installing === url.trim() ? 'Installing…' : 'Install'}
              </button>
            </div>
          </div>

          {catalog.length > 0 && (
            <div>
              <div className="repo-section-title">Featured collections</div>
              <div className="repo-catalog-list">
                {catalog.map(entry => {
                  const isInstalled = installedNames.has(entry.name)
                  const isUninstalling = uninstalling === entry.name
                  const isInstalling = installing === entry.url
                  return (
                    <div key={entry.name} className="repo-catalog-entry">
                      <div className="repo-entry-info">
                        <div className="repo-entry-name">{entry.name}</div>
                        {entry.description && <div className="repo-entry-desc">{entry.description}</div>}
                      </div>
                      {isInstalled ? (
                        <button
                          className="repo-uninstall-btn"
                          onClick={() => uninstallRepo(entry.name)}
                          disabled={isUninstalling}
                        >
                          <Close size={11} />
                          {isUninstalling ? 'Removing…' : 'Uninstall'}
                        </button>
                      ) : (
                        <button
                          className="repo-install-btn"
                          onClick={() => installRepo(entry.url)}
                          disabled={!!installing}
                        >
                          {isInstalling ? <Sync size={11} /> : <Upload size={11} />}
                          {isInstalling ? 'Installing…' : 'Install'}
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {uncataloged.length > 0 && (
            <div>
              <div className="repo-section-title">Other installed</div>
              <div className="repo-catalog-list">
                {uncataloged.map(repo => (
                  <div key={repo.name} className="repo-catalog-entry">
                    <div className="repo-entry-info">
                      <div className="repo-entry-name">{repo.name}</div>
                      <div className="repo-entry-desc">{repo.skill_count} skill{repo.skill_count !== 1 ? 's' : ''}</div>
                    </div>
                    <button
                      className="repo-uninstall-btn"
                      onClick={() => uninstallRepo(repo.name)}
                      disabled={uninstalling === repo.name}
                    >
                      <Close size={11} />
                      {uninstalling === repo.name ? 'Removing…' : 'Uninstall'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="modal-btn-submit" onClick={onChanged}>Done</button>
        </div>
      </div>
    </div>
  )
}

// ─── MCP panel ────────────────────────────────────────────────────────────────

function McpPanel() {
  const [servers, setServers] = useState<MCPServer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pendingReload, setPendingReload] = useState(false)
  const [reloading, setReloading] = useState(false)
  const [reloadStatuses, setReloadStatuses] = useState<ReloadStatus[] | null>(null)
  const [modal, setModal] = useState<{ mode: 'add' | 'edit'; server?: MCPServer } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.get<{ servers: MCPServer[]; count: number }>('/mcp/config')
      setServers(data.servers ?? [])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load MCP servers')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleToggle = async (id: string, enabled: boolean) => {
    await api.put(`/mcp/config/${id}`, { enabled })
    setServers(s => s.map(x => x.id === id ? { ...x, enabled } : x))
    setPendingReload(true)
  }

  const handleDelete = async (id: string) => {
    await api.delete(`/mcp/config/${id}`)
    setServers(s => s.filter(x => x.id !== id))
    setPendingReload(true)
  }

  const handleSave = async (data: Partial<MCPServer> & { id?: string }) => {
    if (data.id) {
      const updated = await api.put<MCPServer>(`/mcp/config/${data.id}`, data)
      setServers(s => s.map(x => x.id === data.id ? updated : x))
    } else {
      const created = await api.post<MCPServer>('/mcp/config', { ...data, enabled: true })
      setServers(s => [...s, created])
    }
    setPendingReload(true)
    setModal(null)
  }

  const handleImportJSON = () => { fileInputRef.current?.click() }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await file.text()
    let parsed: unknown
    try { parsed = JSON.parse(text) } catch { setError('Invalid JSON file'); return }
    const result = await api.post<{ imported: number; message: string }>('/mcp/config/import-json', parsed)
    await load()
    setPendingReload(true)
    setError(null)
    if (result.imported > 0) {
      setReloadStatuses([{ name: 'import', ok: true, tools: result.imported, error: undefined }])
      setTimeout(() => setReloadStatuses(null), 3000)
    }
    e.target.value = ''
  }

  const handleReload = async () => {
    setReloading(true)
    setReloadStatuses(null)
    try {
      const result = await api.post<{ reloaded: number; servers: ReloadStatus[] }>('/mcp/reload')
      setReloadStatuses(result.servers ?? [])
      setPendingReload(false)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Reload failed')
    } finally {
      setReloading(false)
    }
  }

  return (
    <>
      <div className="sv-card">
        <div className="sv-card-head">
          <div className="caps-mcp-header">
            <div className="sv-card-brand">
              <div>
                <div className="sv-brand-name">MCP Servers</div>
                <div className="sv-brand-sub">Tools exposed to agents via Model Context Protocol</div>
              </div>
            </div>
            <div className="caps-mcp-actions-bar">
              {pendingReload && (
                <span className="caps-reload-badge">
                  <Attention size={12} /> Reload required
                </span>
              )}
              <button className="caps-icon-btn" title="Refresh list" onClick={load}>
                <Sync size={16} />
              </button>
              <button className="caps-import-json-btn" onClick={handleImportJSON} title="Import from mcp.json">
                <Upload size={14} /> Load JSON
              </button>
              <button
                className={`caps-reload-btn ${reloading ? 'loading' : ''}`}
                onClick={handleReload}
                disabled={reloading}
              >
                <Sync size={14} /> {reloading ? 'Reloading…' : 'Apply & Reload'}
              </button>
              <button className="caps-add-mcp-btn" onClick={() => setModal({ mode: 'add' })}>
                <Plus size={14} /> Add server
              </button>
            </div>
          </div>
        </div>

        <div className="sv-card-body">
          {error && <div className="caps-error">{error}</div>}

          {reloadStatuses && (
            <div className="caps-reload-result">
              {reloadStatuses.map(s => (
                <div key={s.name} className={`caps-reload-row ${s.ok ? 'ok' : 'err'}`}>
                  {s.ok ? <Check size={13} /> : <Attention size={13} />}
                  <span>{s.name}</span>
                  {s.ok && <span className="caps-reload-tools">{s.tools} tools</span>}
                  {s.error && <span className="caps-reload-error">{s.error}</span>}
                </div>
              ))}
            </div>
          )}

          {loading ? (
            <div className="caps-loading">Loading servers…</div>
          ) : servers.length === 0 ? (
            <div className="caps-empty">
              No MCP servers configured. Add one or load from mcp.json.
            </div>
          ) : (
            <div className="caps-mcp-list">
              {servers.map(srv => (
                <McpServerCard
                  key={srv.id}
                  server={srv}
                  onToggle={handleToggle}
                  onEdit={() => setModal({ mode: 'edit', server: srv })}
                  onDelete={() => handleDelete(srv.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {modal && (
        <McpServerModal
          mode={modal.mode}
          server={modal.server}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}
    </>
  )
}

function McpServerCard({
  server, onToggle, onEdit, onDelete,
}: {
  server: MCPServer
  onToggle: (id: string, enabled: boolean) => void
  onEdit: () => void
  onDelete: () => void
}) {
  const isStdio = server.server_type === 'stdio'

  return (
    <div className={`caps-mcp-card ${server.enabled ? '' : 'disabled'}`}>
      <div className="caps-mcp-card-left">
        <div className="caps-mcp-icon">{server.icon || '🔌'}</div>
        <div className="caps-mcp-info">
          <div className="caps-mcp-title">
            <span className="caps-mcp-name">{server.display_name || server.name}</span>
            <span className="caps-mcp-type-badge">
              {isStdio ? <Terminal size={11} /> : <Globe size={11} />}
              {server.server_type}
            </span>
            {server.source === 'file' && (
              <span className="caps-mcp-source-badge">from file</span>
            )}
          </div>
          <div className="caps-mcp-detail">
            {isStdio
              ? <code>{server.command}{server.args?.length ? ' ' + server.args.join(' ') : ''}</code>
              : <code>{server.url}</code>
            }
          </div>
        </div>
      </div>
      <div className="caps-mcp-actions">
        <label className="caps-mcp-toggle" title={server.enabled ? 'Disable' : 'Enable'}>
          <input
            type="checkbox"
            checked={server.enabled}
            onChange={e => onToggle(server.id, e.target.checked)}
          />
          <span className="caps-toggle-track" />
        </label>
        <button className="caps-mini-btn" title="Edit" onClick={onEdit}>
          <Edit size={13} />
        </button>
        <button className="caps-mini-btn danger" title="Delete" onClick={onDelete}>
          <Close size={13} />
        </button>
      </div>
    </div>
  )
}

// ─── MCP Server add/edit modal ────────────────────────────────────────────────

function McpServerModal({
  mode, server, onSave, onClose,
}: {
  mode: 'add' | 'edit'
  server?: MCPServer
  onSave: (data: Partial<MCPServer> & { id?: string }) => Promise<void>
  onClose: () => void
}) {
  const [form, setForm] = useState({
    name:         server?.name         ?? '',
    display_name: server?.display_name ?? '',
    server_type:  server?.server_type  ?? 'stdio',
    command:      server?.command      ?? '',
    args_raw:     (server?.args ?? []).join(' '),
    env_raw:      Object.entries(server?.env ?? {}).map(([k,v]) => `${k}=${v}`).join('\n'),
    url:          server?.url          ?? '',
    timeout_secs: server?.timeout_secs ?? 30,
    icon:         server?.icon         ?? '🔌',
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const set = (k: keyof typeof form, v: string | number) =>
    setForm(f => ({ ...f, [k]: v }))

  const isStdio = form.server_type === 'stdio'

  const parseArgs = (raw: string): string[] =>
    raw.trim() ? raw.trim().split(/\s+/) : []

  const parseEnv = (raw: string): Record<string, string> => {
    const out: Record<string, string> = {}
    raw.split('\n').forEach(line => {
      const idx = line.indexOf('=')
      if (idx > 0) out[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
    })
    return out
  }

  const handleSave = async () => {
    if (!form.name.trim()) { setErr('Name is required'); return }
    if (isStdio && !form.command.trim()) { setErr('Command is required for stdio servers'); return }
    if (!isStdio && !form.url.trim()) { setErr('URL is required for http/sse servers'); return }
    setSaving(true)
    setErr(null)
    try {
      await onSave({
        id:          server?.id,
        name:        form.name.trim(),
        display_name: form.display_name.trim(),
        server_type: form.server_type,
        command:     form.command.trim(),
        args:        parseArgs(form.args_raw),
        env:         parseEnv(form.env_raw),
        url:         form.url.trim(),
        timeout_secs: Number(form.timeout_secs),
        icon:        form.icon.trim() || '🔌',
      })
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed to save')
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-shell mcp-modal-shell">
        <div className="modal-header">
          <h2>{mode === 'add' ? 'Add MCP Server' : 'Edit MCP Server'}</h2>
          <button className="modal-close-btn" onClick={onClose}><Close size={20} /></button>
        </div>
        <div className="modal-content" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {err && <div className="caps-error">{err}</div>}

          <div className="mcp-form-row-2">
            <div className="sv-field">
              <label>Icon (emoji)</label>
              <div className="sv-input-box">
                <input
                  type="text"
                  value={form.icon}
                  onChange={e => set('icon', e.target.value)}
                  placeholder="🔌"
                  style={{ width: 60, textAlign: 'center', fontSize: 22 }}
                />
              </div>
            </div>
            <div className="sv-field" style={{ flex: 1 }}>
              <label>Name (unique key)</label>
              <div className="sv-input-box">
                <input
                  type="text"
                  value={form.name}
                  onChange={e => set('name', e.target.value)}
                  placeholder="e.g. filesystem"
                  disabled={mode === 'edit'}
                />
              </div>
            </div>
          </div>

          <div className="sv-field">
            <label>Display name</label>
            <div className="sv-input-box">
              <input
                type="text"
                value={form.display_name}
                onChange={e => set('display_name', e.target.value)}
                placeholder="e.g. Filesystem Tools"
              />
            </div>
          </div>

          <div className="sv-field">
            <label>Transport</label>
            <div className="sv-input-box">
              <select
                value={form.server_type}
                onChange={e => set('server_type', e.target.value)}
              >
                <option value="stdio">stdio (subprocess)</option>
                <option value="http">HTTP</option>
                <option value="sse">SSE</option>
                <option value="ws">WebSocket</option>
              </select>
            </div>
          </div>

          {isStdio ? (
            <>
              <div className="sv-field">
                <label>Command</label>
                <div className="sv-input-box">
                  <input
                    type="text"
                    value={form.command}
                    onChange={e => set('command', e.target.value)}
                    placeholder="e.g. npx or /usr/bin/python3"
                  />
                </div>
              </div>
              <div className="sv-field">
                <label>Arguments (space-separated)</label>
                <div className="sv-input-box">
                  <input
                    type="text"
                    value={form.args_raw}
                    onChange={e => set('args_raw', e.target.value)}
                    placeholder="-y @modelcontextprotocol/server-filesystem /tmp"
                  />
                </div>
              </div>
              <div className="sv-field">
                <label>Environment variables (KEY=VALUE, one per line)</label>
                <textarea
                  className="mcp-env-textarea"
                  value={form.env_raw}
                  onChange={e => set('env_raw', e.target.value)}
                  placeholder={"PATH=/usr/local/bin\nNODE_ENV=production"}
                  rows={3}
                />
              </div>
            </>
          ) : (
            <div className="sv-field">
              <label>URL</label>
              <div className="sv-input-box">
                <input
                  type="text"
                  value={form.url}
                  onChange={e => set('url', e.target.value)}
                  placeholder="http://localhost:3000/mcp"
                />
              </div>
            </div>
          )}

          <div className="sv-field">
            <label>Timeout (seconds)</label>
            <div className="sv-input-box">
              <input
                type="number"
                value={form.timeout_secs}
                onChange={e => set('timeout_secs', e.target.value)}
                min={5}
                max={300}
                style={{ width: 100 }}
              />
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="modal-btn-cancel" onClick={onClose}>Cancel</button>
          <button className="modal-btn-submit" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : mode === 'add' ? 'Add Server' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Multimodal panel ─────────────────────────────────────────────────────────

function MultimodalPanel() {
  return (
    <>
      <div className="sv-card" style={{ marginBottom: 24 }}>
        <div className="sv-card-head">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div className="sv-card-brand">
              <div>
                <div className="sv-brand-name">Image Generation</div>
                <div className="sv-brand-sub">Generate images directly in conversations</div>
              </div>
            </div>
            <input type="checkbox" />
          </div>
        </div>
        <div className="sv-card-body">
          <div className="sv-toggle-row">
            <div>
              <div className="sv-setting-label">Image Model</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--color-text-muted)', fontSize: 13 }}>
              No available image models, configure a provider first. <Attention size={14} />
            </div>
          </div>
        </div>
      </div>

      <div className="sv-card">
        <div className="sv-card-head">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div className="sv-card-brand">
              <div>
                <div className="sv-brand-name">Speech to Text</div>
                <div className="sv-brand-sub">Voice input provider for chat on desktop and WebUI</div>
              </div>
            </div>
            <input type="checkbox" defaultChecked />
          </div>
        </div>
        <div className="sv-card-body">
          <div className="sv-field">
            <label>Provider</label>
            <div className="sv-select-static">
              <div className="sv-select-box">
                <span>OpenAI Whisper</span>
                <Down size={16} />
              </div>
            </div>
          </div>
          <div className="sv-field">
            <label>API Key</label>
            <div className="sv-input-box">
              <input type="password" placeholder="••••••••" />
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

// ─── CSS ──────────────────────────────────────────────────────────────────────

export const CAPABILITIES_CSS = `
/* ── Tab switcher ── */
.caps-tabs {
  display: flex;
  gap: 2px;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 4px;
  width: fit-content;
  margin-bottom: 28px;
}

.caps-tab-btn {
  background: transparent;
  border: none;
  padding: 7px 18px;
  border-radius: 7px;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all 0.15s;
  text-transform: capitalize;
}

.caps-tab-btn:hover {
  color: var(--color-text);
  background: var(--color-hover);
}

.caps-tab-btn.active {
  background: var(--color-surface-elevated);
  color: var(--color-text);
  box-shadow: 0 1px 3px rgba(0,0,0,0.12);
}

.caps-tab-content { display: flex; flex-direction: column; }

/* ── Shared header bar ── */
.caps-tab-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
}

.caps-header-left { display: flex; align-items: center; gap: 10px; }
.caps-header-right { display: flex; align-items: center; gap: 12px; }

.caps-count-badge {
  font-size: 13px;
  font-weight: 700;
  color: var(--color-text-muted);
}

.caps-icon-btn {
  background: transparent; border: none;
  color: var(--color-text-secondary); cursor: pointer;
  padding: 6px; display: flex; border-radius: 6px;
}
.caps-icon-btn:hover { background: var(--color-hover); }

.caps-search-box {
  background: var(--color-bg); border: 1px solid var(--color-border);
  border-radius: 8px; padding: 6px 12px;
  display: flex; align-items: center; gap: 8px;
  width: 240px; color: var(--color-text-muted);
}
.caps-search-box input {
  background: none; border: none; color: var(--color-text);
  font-size: 13px; outline: none; width: 100%; font-family: inherit;
}

.caps-import-btn {
  background: var(--color-bg); border: 1px solid var(--color-border);
  color: var(--color-text); padding: 6px 14px; border-radius: 8px;
  font-size: 13px; font-weight: 600;
  display: flex; align-items: center; gap: 8px; cursor: pointer;
}

/* ── Skills grid (2 columns) ── */
.caps-skills-list {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.caps-skill-item {
  background: var(--color-surface, var(--color-bg));
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 14px 14px;
  display: flex; gap: 12px; align-items: center;
  transition: opacity 0.2s, border-color 0.15s;
}
.caps-skill-item:hover { border-color: var(--color-border-subtle, var(--color-border)); }
.caps-skill-item.skill-off { opacity: 0.42; }

/* ── Skill icon button ── */
.caps-skill-icon-btn {
  width: 38px; height: 38px; border-radius: 10px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  color: white; border: none; cursor: pointer; padding: 0;
  transition: transform 0.15s, filter 0.15s;
}
.caps-skill-icon-btn:hover { transform: scale(1.1); filter: brightness(1.15); }

.caps-skill-info { flex: 1; min-width: 0; }
.caps-skill-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }

.caps-skill-name {
  font-size: 13px; font-weight: 700; margin-bottom: 0;
  display: flex; align-items: center; gap: 6px; color: var(--color-text);
  flex-wrap: wrap;
}

.caps-skill-tag {
  font-size: 10px; color: var(--color-cta);
  background: var(--color-primary-subtle);
  padding: 1px 5px; border-radius: 4px; font-weight: 600;
}
.caps-skill-version { font-size: 10px; color: var(--color-text-muted); font-weight: 500; }
.caps-skill-slash {
  font-size: 10px; font-weight: 600; color: var(--color-cta);
  background: var(--color-primary-subtle);
  padding: 1px 5px; border-radius: 4px;
  font-family: var(--font-mono, monospace);
}

.caps-skill-expand-btn {
  display: inline-flex; align-items: center; gap: 4px;
  background: none; border: none; cursor: pointer;
  font-size: 11px; color: var(--color-text-muted);
  padding: 2px 5px; border-radius: 4px; margin-top: 4px;
  font-family: inherit; transition: color 0.1s, background 0.1s;
}
.caps-skill-expand-btn:hover { color: var(--color-text); background: var(--color-hover); }

.caps-skill-desc {
  font-size: 12px; color: var(--color-text-secondary); line-height: 1.55; margin: 6px 0 0;
}

/* ── Skill toggle ── */
.caps-skill-toggle-lbl { position: relative; display: inline-flex; cursor: pointer; flex-shrink: 0; }
.caps-skill-toggle-lbl input { opacity: 0; width: 0; height: 0; position: absolute; }
.caps-skill-toggle-track {
  width: 34px; height: 19px; background: var(--color-border);
  border-radius: 10px; transition: background 0.2s; display: block;
}
.caps-skill-toggle-lbl input:checked ~ .caps-skill-toggle-track { background: var(--color-cta); }
.caps-skill-toggle-track::after {
  content: ''; position: absolute; top: 2px; left: 2px;
  width: 15px; height: 15px; border-radius: 50%;
  background: white; transition: transform 0.2s;
}
.caps-skill-toggle-lbl input:checked ~ .caps-skill-toggle-track::after { transform: translateX(15px); }

/* ── Icon picker panel ── */
.sip-panel {
  position: fixed; z-index: 9999;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 12px; padding: 10px 12px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.2), 0 2px 8px rgba(0,0,0,0.12);
  width: 292px;
}
.sip-group { margin-bottom: 8px; }
.sip-group:last-child { margin-bottom: 0; }
.sip-group-label {
  font-size: 9px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.07em; color: var(--color-text-muted);
  margin-bottom: 3px; padding: 0 2px;
}
.sip-group-icons { display: flex; flex-wrap: wrap; gap: 2px; }
.sip-icon-btn {
  width: 30px; height: 30px; padding: 0;
  display: flex; align-items: center; justify-content: center;
  background: none; border: none; cursor: pointer; border-radius: 6px;
  color: var(--color-text-secondary); transition: background 0.1s, color 0.1s;
}
.sip-icon-btn:hover { background: var(--color-hover); color: var(--color-text); }
.sip-icon-btn.active { background: var(--color-primary-subtle); color: var(--color-cta); }

/* ── Skill collection groups ── */
.caps-skills-groups {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.caps-skill-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.caps-group-header {
  display: flex; align-items: center; gap: 8px;
  background: none; border: none; cursor: pointer;
  padding: 4px 6px; border-radius: 6px;
  font-size: 12px; font-weight: 700;
  color: var(--color-text-secondary);
  text-align: left; width: 100%;
  transition: color 0.1s, background 0.1s;
}
.caps-group-header:hover { color: var(--color-text); background: var(--color-hover); }

.caps-group-name { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; }

.caps-repo-pill {
  font-size: 9px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.06em; color: var(--color-cta);
  background: var(--color-primary-subtle);
  padding: 1px 5px; border-radius: 4px;
}

.caps-group-count {
  font-size: 11px; font-weight: 600;
  color: var(--color-text-muted);
  margin-left: auto;
}

/* ── Repo manager modal ── */
.repo-modal-shell { max-width: 520px; }

.repo-url-row {
  display: flex; gap: 10px; align-items: stretch;
}

.repo-section-title {
  font-size: 11px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.07em; color: var(--color-text-muted);
  margin-bottom: 10px;
}

.repo-catalog-list {
  display: flex; flex-direction: column; gap: 8px;
}

.repo-catalog-entry {
  display: flex; align-items: center; gap: 12px;
  background: var(--color-surface); border: 1px solid var(--color-border);
  border-radius: 10px; padding: 12px 14px;
}

.repo-entry-info { flex: 1; min-width: 0; }
.repo-entry-name { font-size: 13px; font-weight: 700; color: var(--color-text); }
.repo-entry-desc { font-size: 12px; color: var(--color-text-muted); margin-top: 2px; }

.repo-install-btn {
  display: flex; align-items: center; gap: 5px;
  background: var(--color-cta); color: white;
  border: none; padding: 6px 12px; border-radius: 8px;
  font-size: 12px; font-weight: 700; cursor: pointer;
  white-space: nowrap; flex-shrink: 0;
  transition: opacity 0.15s;
}
.repo-install-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.repo-install-btn:hover:not(:disabled) { opacity: 0.9; }

.repo-uninstall-btn {
  display: flex; align-items: center; gap: 5px;
  background: var(--color-hover); color: var(--color-text-muted);
  border: 1px solid var(--color-border); padding: 6px 12px; border-radius: 8px;
  font-size: 12px; font-weight: 600; cursor: pointer;
  white-space: nowrap; flex-shrink: 0;
  transition: color 0.15s, background 0.15s;
}
.repo-uninstall-btn:hover:not(:disabled) { color: var(--color-error); border-color: var(--color-error); background: rgba(239,68,68,0.06); }
.repo-uninstall-btn:disabled { opacity: 0.6; cursor: not-allowed; }

.skill-modal-shell { max-width: 600px; }
.skill-content-textarea { min-height: 160px; }

/* ── MCP modal ── */
.mcp-modal-shell { max-width: 560px; }

/* ── MCP header + action bar ── */
.caps-mcp-header {
  display: flex; align-items: flex-start; justify-content: space-between;
  gap: 16px; flex-wrap: wrap;
}
.caps-mcp-actions-bar {
  display: flex; gap: 8px; align-items: center;
  flex-wrap: wrap; justify-content: flex-end;
}

/* ── MCP ── */
.caps-add-mcp-btn {
  background: var(--color-surface); border: 1px solid var(--color-border);
  color: var(--color-text); padding: 6px 12px; border-radius: 16px;
  font-size: 12px; font-weight: 600;
  display: flex; align-items: center; gap: 6px; cursor: pointer;
}
.caps-add-mcp-btn:hover { background: var(--color-hover); }

.caps-import-json-btn {
  background: var(--color-surface); border: 1px solid var(--color-border);
  color: var(--color-text); padding: 6px 12px; border-radius: 8px;
  font-size: 12px; font-weight: 600;
  display: flex; align-items: center; gap: 6px; cursor: pointer;
}
.caps-import-json-btn:hover { background: var(--color-hover); }

.caps-reload-btn {
  background: var(--color-cta); color: white;
  border: none; padding: 6px 14px; border-radius: 8px;
  font-size: 12px; font-weight: 700;
  display: flex; align-items: center; gap: 6px; cursor: pointer;
}
.caps-reload-btn:disabled { opacity: 0.6; cursor: not-allowed; }

.caps-reload-badge {
  display: flex; align-items: center; gap: 4px;
  font-size: 11px; font-weight: 600;
  color: #f59e0b; background: rgba(245,158,11,0.1);
  padding: 3px 8px; border-radius: 6px;
  border: 1px solid rgba(245,158,11,0.25);
}

.caps-reload-result {
  display: flex; flex-direction: column; gap: 4px;
  background: var(--color-surface); border: 1px solid var(--color-border);
  border-radius: 10px; padding: 12px 16px;
}
.caps-reload-row {
  display: flex; align-items: center; gap: 8px;
  font-size: 13px;
}
.caps-reload-row.ok { color: var(--color-success, #22c55e); }
.caps-reload-row.err { color: var(--color-error, #ef4444); }
.caps-reload-tools { color: var(--color-text-muted); font-size: 12px; }
.caps-reload-error { color: var(--color-error, #ef4444); font-size: 12px; }

.caps-mcp-list { display: flex; flex-direction: column; gap: 8px; }

.caps-mcp-card {
  display: flex; align-items: center; justify-content: space-between;
  background: var(--color-surface); border: 1px solid var(--color-border);
  border-radius: 12px; padding: 14px 18px;
  transition: opacity 0.15s;
}
.caps-mcp-card.disabled { opacity: 0.55; }

.caps-mcp-card-left { display: flex; align-items: center; gap: 14px; flex: 1; min-width: 0; }

.caps-mcp-icon { font-size: 24px; line-height: 1; flex-shrink: 0; width: 36px; text-align: center; }

.caps-mcp-info { flex: 1; min-width: 0; }
.caps-mcp-title { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; flex-wrap: wrap; }
.caps-mcp-name { font-weight: 700; font-size: 14px; color: var(--color-text); }

.caps-mcp-type-badge {
  display: flex; align-items: center; gap: 4px;
  font-size: 11px; font-weight: 600;
  background: var(--color-primary-subtle); color: var(--color-cta);
  padding: 2px 7px; border-radius: 5px;
}
.caps-mcp-source-badge {
  font-size: 10px; font-weight: 600; color: var(--color-text-muted);
  background: var(--color-hover); padding: 2px 6px; border-radius: 4px;
}

.caps-mcp-detail code {
  font-size: 12px; color: var(--color-text-muted);
  font-family: var(--font-mono, monospace);
  background: var(--color-hover); padding: 2px 6px; border-radius: 4px;
  display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  max-width: 400px;
}

.caps-mcp-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }

/* toggle switch */
.caps-mcp-toggle { position: relative; display: inline-flex; cursor: pointer; }
.caps-mcp-toggle input { opacity: 0; width: 0; height: 0; position: absolute; }
.caps-toggle-track {
  width: 36px; height: 20px; background: var(--color-border);
  border-radius: 10px; transition: background 0.2s; display: block;
}
.caps-mcp-toggle input:checked ~ .caps-toggle-track { background: var(--color-cta); }
.caps-toggle-track::after {
  content: ''; position: absolute; top: 3px; left: 3px;
  width: 14px; height: 14px; border-radius: 50%;
  background: white; transition: transform 0.2s;
}
.caps-mcp-toggle input:checked ~ .caps-toggle-track::after { transform: translateX(16px); }

.mcp-form-row-2 { display: grid; grid-template-columns: auto 1fr; gap: 16px; align-items: end; }
.mcp-env-textarea {
  width: 100%; background: var(--color-surface);
  border: 1.5px solid var(--color-border); border-radius: 10px;
  padding: 10px 14px; color: var(--color-text); font-family: var(--font-mono, monospace);
  font-size: 13px; line-height: 1.5; resize: vertical; outline: none; box-sizing: border-box;
}
.mcp-env-textarea:focus { border-color: var(--color-primary); }

.caps-mini-btn.danger:hover { color: var(--color-error, #ef4444); background: rgba(239,68,68,0.08); }

.caps-mcp-item {
  background: var(--color-surface); border-radius: 12px;
  padding: 12px 16px; display: flex; align-items: center; justify-content: space-between;
}

.caps-item-left { display: flex; align-items: center; gap: 10px; color: var(--color-text-secondary); }
.caps-mcp-name { font-weight: 600; font-size: 14px; color: var(--color-text); }

.caps-mcp-meta {
  font-size: 11px; color: var(--color-text-muted);
  background: var(--color-surface); border: 1px solid var(--color-border);
  padding: 1px 6px; border-radius: 4px;
}

.caps-mcp-tools {
  font-size: 11px; color: var(--color-text-muted); font-weight: 500;
}

.caps-mcp-error {
  display: flex; align-items: center; gap: 4px;
  font-size: 11px; color: var(--color-error);
}

.caps-mcp-dot {
  width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
}
.caps-mcp-dot.connected { background: #00B42A; }
.caps-mcp-dot.failed    { background: var(--color-error); }
.caps-mcp-dot.pending   { background: var(--color-text-muted); }

.caps-mini-btn { background: none; border: none; color: var(--color-text-muted); cursor: pointer; display: flex; padding: 4px; border-radius: 4px; }
.caps-mini-btn:hover { color: var(--color-text); background: var(--color-hover); }

/* ── States ── */
.caps-loading, .caps-empty {
  font-size: 14px; color: var(--color-text-muted);
  padding: 48px 0; text-align: center;
}

.caps-error {
  font-size: 13px; color: var(--color-error);
  padding: 12px 16px; border-radius: 8px;
  background: rgba(var(--color-error-rgb, 255,77,79), 0.08);
  margin-bottom: 16px;
}
`
