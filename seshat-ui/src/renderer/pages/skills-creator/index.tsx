import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router'
import {
  Search, Right, Down, FolderClose, FolderOpen,
  FileCode, Close, Sync, MoreOne, Edit, PreviewOpen, Left, Upload,
  // Skill icon picker icons
  Code, CodeBrackets, Bug, Experiment, TestTube, BranchOne, Merge, Terminal,
  RocketOne, Play, Cycle, Refresh, Magic, MagicWand, Lightning, Robot,
  FileText, Notebook, NotebookAndPen, BookOpen, Write, Log,
  Filter, ChartGraph, Monitor, Target, Focus, ZoomIn, Tag,
  Api, Server, DatabaseCode, Link, Connect, Share, SendEmail,
  CheckOne, Star, Flag, Shield, Lock, Key, Info, Timer, Globe,
} from '@icon-park/react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { api } from '@/api/client'
import { useUIStore } from '@/stores/ui'
import { MarkdownView } from '@/components/MarkdownView'

// ─── Types ────────────────────────────────────────────────────────────────────

type Skill = {
  name: string
  display_name: string
  description: string
  source: string
  collection: string
  version: string
  argument_hint: string
  is_hidden: boolean
  user_invocable: boolean
}

type TreeNode = {
  name: string
  path: string
  is_dir: boolean
  children?: TreeNode[]
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
  // Present only for entries pulled from a connected seshat-server's org
  // registry — see internal/cloudskillregistry on the backend.
  source?: 'organization'
}

// ─── Skill icon library (icon-park) — moved from settings/CapabilitiesViews.tsx
// when the Settings → Capabilities → Skills tab merged into this page ─────────

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

// ─── Collection grouping helpers ──────────────────────────────────────────────

const SIDEBAR_COLLECTION_ORDER = ['user', 'builtin', 'managed', 'mcp']
const SIDEBAR_COLLECTION_LABELS: Record<string, string> = {
  user:    'My Skills',
  builtin: 'Built-in',
  managed: 'Managed',
  mcp:     'MCP',
}

function groupForSidebar(skills: Skill[]) {
  const map = new Map<string, Skill[]>()
  for (const sk of skills) {
    const coll = sk.collection || 'user'
    const arr = map.get(coll) ?? []
    arr.push(sk)
    map.set(coll, arr)
  }
  const result: { label: string; skills: Skill[]; readOnly: boolean; collection: string }[] = []
  for (const coll of SIDEBAR_COLLECTION_ORDER) {
    const g = map.get(coll)
    if (g) {
      result.push({ label: SIDEBAR_COLLECTION_LABELS[coll], skills: g, readOnly: coll !== 'user', collection: coll })
      map.delete(coll)
    }
  }
  for (const [coll, g] of map) {
    const label = coll.charAt(0).toUpperCase() + coll.slice(1)
    result.push({ label, skills: g, readOnly: true, collection: coll })
  }
  return result
}

function isUserSkill(skill: Skill) {
  return skill.collection === 'user'
}

// ─── File helpers ─────────────────────────────────────────────────────────────

const EXT_LANG: Record<string, string> = {
  sh: 'bash', bash: 'bash', py: 'python', js: 'javascript', mjs: 'javascript',
  ts: 'typescript', tsx: 'typescript', json: 'json', yaml: 'yaml', yml: 'yaml',
  go: 'go', rs: 'rust', rb: 'ruby', java: 'java', cpp: 'cpp', c: 'c',
  css: 'css', html: 'html', xml: 'xml', toml: 'toml',
}

function langForPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  return EXT_LANG[ext] ?? 'text'
}

function isMarkdownPath(path: string): boolean {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  return ext === 'md' || ext === 'markdown'
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function SkillsCreatorPage() {
  const navigate = useNavigate()
  const closeAllRightPanels = useUIStore((s) => s.closeAllRightPanels)

  // Close Agent Monitor and any right panel when entering this page
  useEffect(() => { closeAllRightPanels() }, [closeAllRightPanels])

  const [skills, setSkills] = useState<Skill[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null)
  const [fileTree, setFileTree] = useState<TreeNode[]>([])
  const [fileTreeLoading, setFileTreeLoading] = useState(false)
  const [selectedFilePath, setSelectedFilePath] = useState<string>('skill.md')
  const [fileContent, setFileContent] = useState('')
  const [fileContentLoading, setFileContentLoading] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [editValue, setEditValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [enabled, setEnabled] = useState(true)
  const [expandedSkills, setExpandedSkills] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [repoData, setRepoData] = useState<{ installed: RepoInfo[]; catalog: CatalogEntry[] }>({ installed: [], catalog: [] })
  const [repoManagementAvailable, setRepoManagementAvailable] = useState(true)
  const [showInstaller, setShowInstaller] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.get<{ skills: Skill[] }>('/skills')
      const all = data.skills ?? []
      setSkills(all)
      try {
        const repoRes = await api.get<{ installed: RepoInfo[]; catalog: CatalogEntry[] }>('/skills/repos')
        setRepoData(repoRes)
        setRepoManagementAvailable(true)
      } catch {
        // Non-admins get a 403 here (repo management is admin-only) — hide
        // the import affordance rather than surfacing an error for it.
        setRepoManagementAvailable(false)
      }
      return all
    } catch {
      return [] as Skill[]
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const handleToggleEnabled = useCallback(async (skill: Skill) => {
    if (!isUserSkill(skill)) return
    const nextEnabled = !(skill.user_invocable && !skill.is_hidden)
    setActionError(null)
    try {
      await api.put(`/skills/${encodeURIComponent(skill.name)}`, { enabled: nextEnabled })
      const patched = { ...skill, user_invocable: nextEnabled, is_hidden: false }
      setSkills(current => current.map(item => item.name === skill.name ? patched : item))
      // The existing selectedSkill effect recomputes `enabled` whenever this changes.
      setSelectedSkill(current => current?.name === skill.name ? patched : current)
    } catch (e: unknown) {
      setActionError((e as { message?: string })?.message ?? 'Failed to update skill')
    }
  }, [])

  useEffect(() => {
    setEnabled(selectedSkill ? selectedSkill.user_invocable && !selectedSkill.is_hidden : true)
  }, [selectedSkill])

  const fetchFile = useCallback(async (skillName: string, relPath: string) => {
    setFileContentLoading(true)
    setFileContent('')
    try {
      const data = await api.get<{ content: string }>(
        `/skills/${encodeURIComponent(skillName)}/file?path=${encodeURIComponent(relPath)}`
      )
      setFileContent(data.content ?? '')
    } catch {
      setFileContent('')
    } finally {
      setFileContentLoading(false)
    }
  }, [])

  const selectSkill = useCallback(async (skill: Skill) => {
    if (selectedSkill?.name === skill.name && !editMode) return
    setSelectedSkill(skill)
    setEditMode(false)
    setEnabled(skill.user_invocable && !skill.is_hidden)
    setSelectedFilePath('skill.md')
    setFileTree([])
    setFileContent('')

    // Fetch file tree for all skills
    setFileTreeLoading(true)
    try {
      const data = await api.get<{ tree: TreeNode[] }>(
        `/skills/${encodeURIComponent(skill.name)}/tree`
      )
      setFileTree(data.tree ?? [])
    } catch {
      setFileTree([])
    } finally {
      setFileTreeLoading(false)
    }

    await fetchFile(skill.name, 'skill.md')
  }, [selectedSkill, editMode, fetchFile])

  const selectFile = useCallback(async (relPath: string) => {
    if (!selectedSkill) return
    if (selectedFilePath === relPath && !editMode) return
    setSelectedFilePath(relPath)
    setEditMode(false)
    await fetchFile(selectedSkill.name, relPath)
  }, [selectedSkill, selectedFilePath, editMode, fetchFile])

  const toggleExpand = (name: string) => {
    setExpandedSkills(prev => {
      const next = new Set(prev)
      if (next.has(name)) {
        next.delete(name)
      } else {
        next.add(name)
      }
      return next
    })
    const skill = skills.find(s => s.name === name)
    if (skill && !expandedSkills.has(name)) selectSkill(skill)
  }

  const handleSave = async () => {
    if (!selectedSkill) return
    setSaving(true)
    setActionError(null)
    try {
      const skill = selectedSkill
      await api.put(`/skills/${encodeURIComponent(skill.name)}`, {
        display_name: skill.display_name || '',
        description:  skill.description  || '',
        argument_hint: skill.argument_hint || '',
        content: editValue,
        enabled,
      })
      const nextSkill = { ...skill, user_invocable: enabled, is_hidden: !enabled }
      setSelectedSkill(nextSkill)
      setSkills(current => current.map(item => item.name === skill.name ? nextSkill : item))
      setFileContent(editValue)
      setEditMode(false)
    } catch (e: unknown) {
      setActionError((e as { message?: string })?.message ?? 'Failed to save skill')
    } finally { setSaving(false) }
  }

  const handleDelete = async (skill: Skill) => {
    if (!confirm(`Delete skill "${skill.display_name || skill.name}"?`)) return
    setActionError(null)
    try {
      await api.delete(`/skills/${encodeURIComponent(skill.name)}`)
      if (selectedSkill?.name === skill.name) { setSelectedSkill(null); setFileContent(''); setFileTree([]) }
      load()
    } catch (e: unknown) {
      setActionError((e as { message?: string })?.message ?? 'Failed to delete skill')
    }
  }

  const filterSkills = (list: Skill[]) =>
    searchQuery
      ? list.filter(s =>
          s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (s.display_name || '').toLowerCase().includes(searchQuery.toLowerCase())
        )
      : list

  const sidebarGroups = groupForSidebar(skills)

  return (
    <div className="sc-root">
      <style>{SKILLS_CREATOR_CSS}</style>

      {/* ── Secondary sidebar ── */}
      <aside className="sc-sidebar">
        <div className="sc-sidebar-header">
          <button className="sc-back-btn" onClick={() => navigate(-1)} title="Back to Chat">
            <Left size={12} />
          </button>
          <span className="sc-sidebar-title">Skills</span>
          <div className="sc-sidebar-actions">
            <button
              className={`sc-icon-btn${showSearch ? ' active' : ''}`}
              onClick={() => { setShowSearch(v => !v); setTimeout(() => searchRef.current?.focus(), 50) }}
              title="Search"
            >
              <Search size={12} />
            </button>
            {repoManagementAvailable && (
              <button className="sc-icon-btn" onClick={() => setShowInstaller(true)} title="Import skills from a repository">
                <Upload size={12} />
              </button>
            )}
          </div>
        </div>

        {showSearch && (
          <div className="sc-search-wrap">
            <Search size={11} />
            <input
              ref={searchRef}
              className="sc-search-input"
              placeholder="Filter skills…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button className="sc-icon-btn" onClick={() => setSearchQuery('')}><Close size={10} /></button>
            )}
          </div>
        )}

        <div className="sc-sidebar-body">
          {loading ? (
            <div className="sc-sidebar-empty"><Sync size={11} className="sc-spin" /> Loading…</div>
          ) : (
            sidebarGroups.map(group => (
              <SkillSection
                key={group.collection}
                label={group.label}
                skills={filterSkills(group.skills)}
                expanded={expandedSkills}
                selected={selectedSkill}
                selectedFilePath={selectedFilePath}
                fileTree={fileTree}
                fileTreeLoading={fileTreeLoading}
                onToggle={toggleExpand}
                onSelectSkill={selectSkill}
                onSelectFile={selectFile}
                onDelete={handleDelete}
                onToggleEnabled={handleToggleEnabled}
                readOnly={group.readOnly}
                emptyHint={group.collection === 'user' ? 'No personal skills yet' : ''}
              />
            ))
          )}
        </div>
      </aside>

      {/* ── Main editor panel ── */}
      <div className="sc-main">
        {actionError && (
          <div className="sc-action-error" role="alert">
            {actionError}
            <button className="sc-action-error-close" onClick={() => setActionError(null)} aria-label="Dismiss">×</button>
          </div>
        )}
        {selectedSkill ? (
          <SkillEditorPanel
            skill={selectedSkill}
            selectedFilePath={selectedFilePath}
            fileContent={fileContent}
            loading={fileContentLoading}
            editMode={editMode}
            editValue={editValue}
            saving={saving}
            enabled={enabled}
            isEditable={isUserSkill(selectedSkill) && selectedFilePath === 'skill.md'}
            onEditValueChange={setEditValue}
            onToggleEdit={() => {
              if (!editMode) setEditValue(fileContent)
              setEditMode(v => !v)
            }}
            onSave={handleSave}
            onCancel={() => { setEditMode(false); setEditValue(fileContent) }}
            onToggleEnabled={() => setEnabled(v => !v)}
            onDelete={() => handleDelete(selectedSkill)}
          />
        ) : (
          <EmptyState canImport={repoManagementAvailable} onImport={() => setShowInstaller(true)} />
        )}
      </div>

      {showInstaller && (
        <RepoManagerModal
          catalog={repoData.catalog}
          installed={repoData.installed}
          onChanged={() => { load(); setShowInstaller(false) }}
        />
      )}
    </div>
  )
}

// ─── Skill section in sidebar ─────────────────────────────────────────────────

function SkillSection({
  label, skills, expanded, selected, selectedFilePath, fileTree, fileTreeLoading,
  onToggle, onSelectSkill, onSelectFile, onDelete, onToggleEnabled, readOnly = false, emptyHint,
}: {
  label: string
  skills: Skill[]
  expanded: Set<string>
  selected: Skill | null
  selectedFilePath: string
  fileTree: TreeNode[]
  fileTreeLoading: boolean
  onToggle: (name: string) => void
  onSelectSkill: (skill: Skill) => void
  onSelectFile: (relPath: string) => void
  onDelete: (skill: Skill) => void
  onToggleEnabled: (skill: Skill) => void
  readOnly?: boolean
  emptyHint: string
}) {
  const [sectionOpen, setSectionOpen] = useState(true)

  return (
    <div className="sc-section">
      <button className="sc-section-header" onClick={() => setSectionOpen(v => !v)}>
        <span className="sc-section-label">{label}</span>
        {sectionOpen ? <Down size={10} /> : <Right size={10} />}
      </button>
      {sectionOpen && (
        <div className="sc-section-body">
          {skills.length === 0 ? (
            emptyHint ? <div className="sc-sidebar-empty">{emptyHint}</div> : null
          ) : (
            skills.map(skill => (
              <SkillTreeItem
                key={skill.name}
                skill={skill}
                isExpanded={expanded.has(skill.name)}
                isSelected={selected?.name === skill.name}
                selectedFilePath={selected?.name === skill.name ? selectedFilePath : null}
                fileTree={selected?.name === skill.name ? fileTree : []}
                fileTreeLoading={selected?.name === skill.name ? fileTreeLoading : false}
                onToggle={() => onToggle(skill.name)}
                onSelect={() => onSelectSkill(skill)}
                onSelectFile={onSelectFile}
                onDelete={readOnly ? undefined : () => onDelete(skill)}
                onToggleEnabled={readOnly ? undefined : () => onToggleEnabled(skill)}
              />
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ─── Individual tree item ─────────────────────────────────────────────────────

function SkillTreeItem({
  skill, isExpanded, isSelected, selectedFilePath, fileTree, fileTreeLoading,
  onToggle, onSelect, onSelectFile, onDelete, onToggleEnabled,
}: {
  skill: Skill
  isExpanded: boolean
  isSelected: boolean
  selectedFilePath: string | null
  fileTree: TreeNode[]
  fileTreeLoading: boolean
  onToggle: () => void
  onSelect: () => void
  onSelectFile: (relPath: string) => void
  onDelete?: () => void
  onToggleEnabled?: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerPos, setPickerPos] = useState({ top: 0, left: 0 })
  const [iconName, setIconName] = useState<string>(() => {
    const store = loadSkillIcons()
    return store[skill.name] ?? getDefaultIconName(skill.name)
  })
  const iconBtnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const handle = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [menuOpen])

  const displayName = skill.display_name || skill.name
  const isEnabled = skill.user_invocable && !skill.is_hidden
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
    <div className="sc-tree-item-wrap">
      {/* Skill folder row */}
      <div className={`sc-tree-folder${isSelected ? ' selected' : ''}${onToggleEnabled && !isEnabled ? ' skill-off' : ''}`}>
        <button className="sc-tree-folder-btn" onClick={onToggle}>
          <span className="sc-tree-chevron">
            {isExpanded ? <Down size={10} /> : <Right size={10} />}
          </span>
          <span className="sc-tree-name">{displayName}</span>
        </button>
        <button
          ref={iconBtnRef}
          className="sc-tree-icon-btn"
          onClick={handleIconClick}
          title="Change icon"
        >
          <IconComp size={12} />
        </button>
        {onToggleEnabled && (
          <label
            className="caps-skill-toggle-lbl"
            title={isEnabled ? 'Disable' : 'Enable'}
            onClick={e => e.stopPropagation()}
          >
            <input type="checkbox" checked={isEnabled} onChange={onToggleEnabled} />
            <span className="caps-skill-toggle-track" />
          </label>
        )}
        {onDelete && (
          <div className="sc-tree-menu-wrap" ref={menuRef}>
            <button
              className={`sc-tree-menu-btn${menuOpen ? ' open' : ''}`}
              onClick={e => { e.stopPropagation(); setMenuOpen(v => !v) }}
            >
              <MoreOne size={11} />
            </button>
            {menuOpen && (
              <div className="sc-tree-menu">
                <button onClick={() => { setMenuOpen(false); onDelete() }} className="danger">
                  <Close size={10} /> Delete skill
                </button>
              </div>
            )}
          </div>
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

      {/* Expanded file tree */}
      {isExpanded && (
        <div className="sc-tree-children">
          {fileTreeLoading ? (
            <div className="sc-tree-loading"><Sync size={10} className="sc-spin" /></div>
          ) : fileTree.length === 0 ? (
            // Fallback: skill.md always exists even if tree failed
            <button
              className={`sc-tree-file${selectedFilePath === 'skill.md' ? ' active-file' : ''}`}
              onClick={() => { onSelect(); onSelectFile('skill.md') }}
            >
              <span className="sc-tree-file-icon"><FileCode size={11} /></span>
              <span className="sc-tree-file-name sc-skill-md">skill.md</span>
            </button>
          ) : (
            <FileTreeNodes
              nodes={fileTree}
              selectedFilePath={selectedFilePath}
              depth={1}
              onSelectFile={p => { onSelect(); onSelectFile(p) }}
            />
          )}
        </div>
      )}
    </div>
  )
}

// ─── Recursive file tree nodes ────────────────────────────────────────────────

function FileTreeNodes({
  nodes, selectedFilePath, depth, onSelectFile,
}: {
  nodes: TreeNode[]
  selectedFilePath: string | null
  depth: number
  onSelectFile: (relPath: string) => void
}) {
  return (
    <>
      {nodes.map(node => (
        <FileTreeNode
          key={node.path}
          node={node}
          selectedFilePath={selectedFilePath}
          depth={depth}
          onSelectFile={onSelectFile}
        />
      ))}
    </>
  )
}

function FileTreeNode({
  node, selectedFilePath, depth, onSelectFile,
}: {
  node: TreeNode
  selectedFilePath: string | null
  depth: number
  onSelectFile: (relPath: string) => void
}) {
  const [open, setOpen] = useState(depth <= 1)
  const indent = depth * 10

  if (node.is_dir) {
    return (
      <div>
        <button
          className="sc-tree-dir"
          style={{ paddingLeft: indent + 4 }}
          onClick={() => setOpen(v => !v)}
        >
          <span className="sc-tree-chevron">{open ? <Down size={10} /> : <Right size={10} />}</span>
          <span className="sc-tree-folder-icon">
            {open ? <FolderOpen size={11} /> : <FolderClose size={11} />}
          </span>
          <span className="sc-tree-file-name">{node.name}</span>
        </button>
        {open && node.children && (
          <FileTreeNodes
            nodes={node.children}
            selectedFilePath={selectedFilePath}
            depth={depth + 1}
            onSelectFile={onSelectFile}
          />
        )}
      </div>
    )
  }

  const isSkillMd = node.name === 'skill.md'
  return (
    <button
      className={`sc-tree-file${selectedFilePath === node.path ? ' active-file' : ''}`}
      style={{ paddingLeft: indent + 4 }}
      onClick={() => onSelectFile(node.path)}
    >
      <span className="sc-tree-file-icon"><FileCode size={11} /></span>
      <span className={`sc-tree-file-name${isSkillMd ? ' sc-skill-md' : ''}`}>{node.name}</span>
    </button>
  )
}

// ─── Editor panel ─────────────────────────────────────────────────────────────

function SkillEditorPanel({
  skill, selectedFilePath, fileContent, loading, editMode, editValue, saving, enabled, isEditable,
  onEditValueChange, onToggleEdit, onSave, onCancel, onToggleEnabled, onDelete,
}: {
  skill: Skill
  selectedFilePath: string
  fileContent: string
  loading: boolean
  editMode: boolean
  editValue: string
  saving: boolean
  enabled: boolean
  isEditable: boolean
  onEditValueChange: (v: string) => void
  onToggleEdit: () => void
  onSave: () => void
  onCancel: () => void
  onToggleEnabled: () => void
  onDelete: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const handle = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [menuOpen])

  const displayName = skill.display_name || skill.name
  const collectionLabel = SIDEBAR_COLLECTION_LABELS[skill.collection] ?? skill.collection
  const isMd = isMarkdownPath(selectedFilePath)
  const lang = isMd ? 'markdown' : langForPath(selectedFilePath)

  // For skill.md, strip YAML frontmatter before rendering
  const renderedBody = isMd ? parseSkillContent(fileContent).body : fileContent

  return (
    <div className="sc-editor-root">
      {/* ── Top bar ── */}
      <div className="sc-editor-topbar">
        <h1 className="sc-editor-title">{displayName}</h1>
        <div className="sc-editor-topbar-right">
          {isEditable && (
            <label className="sc-toggle-wrap" title={enabled ? 'Disable' : 'Enable'}>
              <input type="checkbox" checked={enabled} onChange={onToggleEnabled} />
              <span className="sc-toggle-track" />
              <span className="sc-toggle-label">{enabled ? 'Enabled' : 'Disabled'}</span>
            </label>
          )}
          {!isEditable && (
            <span className="sc-readonly-badge">Read-only</span>
          )}
          {skill.collection === 'user' && (
            <div ref={menuRef}>
              <button
                className={`sc-icon-btn${menuOpen ? ' active' : ''}`}
                onClick={() => setMenuOpen(v => !v)}
                title="More options"
              >
                <MoreOne size={15} />
              </button>
              {menuOpen && (
                <div className="sc-editor-menu">
                  {isEditable && (
                    <button onClick={() => { setMenuOpen(false); onToggleEdit() }}>
                      <Edit size={11} /> {editMode ? 'Cancel editing' : 'Edit skill'}
                    </button>
                  )}
                  <button className="danger" onClick={() => { setMenuOpen(false); onDelete() }}>
                    <Close size={11} /> Delete skill
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Metadata bar ── */}
      <div className="sc-metadata-bar">
        <div className="sc-meta-item">
          <span className="sc-meta-label">Trigger</span>
          <span className="sc-meta-value">
            <span className="sc-meta-slash">/{skill.name}</span>
            {skill.argument_hint && <span className="sc-meta-hint"> {skill.argument_hint}</span>}
          </span>
        </div>
        <div className="sc-meta-item">
          <span className="sc-meta-label">Collection</span>
          <span className="sc-meta-value">{collectionLabel}</span>
        </div>
        {skill.version && (
          <div className="sc-meta-item">
            <span className="sc-meta-label">Version</span>
            <span className="sc-meta-value">v{skill.version}</span>
          </div>
        )}
      </div>

      {/* ── Description ── */}
      {skill.description && (
        <div className="sc-description-bar">
          <span className="sc-desc-label">Description</span>
          <p className="sc-desc-text">{skill.description}</p>
        </div>
      )}

      {/* ── Content area ── */}
      <div className="sc-content-area">
        <div className="sc-content-toolbar">
          <span className="sc-content-filename">
            <FileCode size={11} />
            {selectedFilePath}
          </span>
          <div className="sc-content-toolbar-right">
            {isEditable && editMode ? (
              <>
                <button className="sc-toolbar-btn cancel" onClick={onCancel}>Cancel</button>
                <button className="sc-toolbar-btn save" onClick={onSave} disabled={saving}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </>
            ) : isEditable ? (
              <>
                <button className="sc-view-btn active" title="Preview">
                  <PreviewOpen size={12} />
                </button>
                <button className="sc-view-btn" onClick={onToggleEdit} title="Edit raw markdown">
                  <Edit size={12} />
                </button>
              </>
            ) : isMd ? (
              <button className="sc-view-btn active" title="Preview">
                <PreviewOpen size={12} />
              </button>
            ) : (
              <span className="sc-lang-tag">{lang}</span>
            )}
          </div>
        </div>

        <div className="sc-content-body">
          {loading ? (
            <div className="sc-content-loading"><Sync size={13} className="sc-spin" /> Loading…</div>
          ) : editMode ? (
            <textarea
              className="sc-editor-textarea"
              value={editValue}
              onChange={e => onEditValueChange(e.target.value)}
              spellCheck={false}
            />
          ) : isMd ? (
            renderedBody ? (
              <div className="sc-markdown-wrap">
                <MarkdownView>{renderedBody}</MarkdownView>
              </div>
            ) : (
              <div className="sc-content-empty">
                {isEditable
                  ? <><span>No content yet. </span><button className="sc-inline-link" onClick={onToggleEdit}>Start editing</button></>
                  : <span>Empty file.</span>
                }
              </div>
            )
          ) : (
            <div className="sc-code-wrap">
              <SyntaxHighlighter
                language={lang}
                style={vscDarkPlus as any}
                customStyle={{
                  margin: 0,
                  padding: '16px 18px',
                  background: 'transparent',
                  fontSize: 13,
                  lineHeight: 1.7,
                  height: '100%',
                  overflow: 'auto',
                }}
                wrapLongLines={false}
              >
                {fileContent || ''}
              </SyntaxHighlighter>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ canImport, onImport }: { canImport: boolean; onImport: () => void }) {
  return (
    <div className="sc-empty-state">
      <div className="sc-empty-icon">
        <FileCode size={33} />
      </div>
      <h2>No skill selected</h2>
      <p>
        Select a skill from the sidebar{canImport ? ', or import one from a repository' : ''}.
        {' '}Need a brand new skill, or a bigger rewrite? Ask the main assistant — it has
        direct access to your skills folder on this machine.
      </p>
      {canImport && (
        <button className="sc-empty-btn" onClick={onImport}>
          <Upload size={11} /> Import skills
        </button>
      )}
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseSkillContent(raw: string): { frontmatter: string; body: string } {
  if (!raw.startsWith('---')) return { frontmatter: '', body: raw }
  const parts = raw.split('---')
  if (parts.length < 3) return { frontmatter: '', body: raw }
  return { frontmatter: parts[1].trim(), body: parts.slice(2).join('---').trim() }
}

// ─── Skill icon picker ────────────────────────────────────────────────────────

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
                  <Icon size={15} />
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

function RepoManagerModal({ catalog, installed, onChanged }: {
  catalog: CatalogEntry[]
  installed: RepoInfo[]
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
          <h2>Import skills</h2>
          <button className="modal-close-btn" onClick={onChanged}><Close size={16} /></button>
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
                {installing && installing === url.trim() ? <Sync size={10} /> : <Upload size={10} />}
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
                        <div className="repo-entry-name">
                          {entry.name}
                          {entry.source === 'organization' && (
                            <span className="repo-origin-badge">from your organization</span>
                          )}
                        </div>
                        {entry.description && <div className="repo-entry-desc">{entry.description}</div>}
                      </div>
                      {isInstalled ? (
                        <button
                          className="repo-uninstall-btn"
                          onClick={() => uninstallRepo(entry.name)}
                          disabled={isUninstalling}
                        >
                          <Close size={10} />
                          {isUninstalling ? 'Removing…' : 'Uninstall'}
                        </button>
                      ) : (
                        <button
                          className="repo-install-btn"
                          onClick={() => installRepo(entry.url)}
                          disabled={!!installing}
                        >
                          {isInstalling ? <Sync size={10} /> : <Upload size={10} />}
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
                      <Close size={10} />
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

// ─── CSS ──────────────────────────────────────────────────────────────────────

const SKILLS_CREATOR_CSS = `
/* ── Root layout ── */
.sc-root {
  display: flex;
  height: 100%;
  width: 100%;
  overflow: hidden;
  background: var(--color-bg);
}

/* ── Secondary sidebar ── */
.sc-sidebar {
  width: 240px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--color-border-subtle);
  background: var(--color-bg);
  overflow: hidden;
}

.sc-sidebar-header {
  display: flex;
  align-items: center;
  gap: 5px;
  justify-content: space-between;
  padding: 7px 8px 6px;
  flex-shrink: 0;
}

.sc-back-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 5px;
  background: transparent;
  border: none;
  color: var(--color-text-muted);
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.15s, color 0.15s;
}
.sc-back-btn:hover {
  background: var(--color-hover);
  color: var(--color-text);
}

.sc-sidebar-title {
  font-size: 11px;
  font-weight: 700;
  color: var(--color-text);
  letter-spacing: 0.01em;
}

.sc-sidebar-actions {
  display: flex;
  gap: 3px;
}

.sc-search-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 7px 6px;
  color: var(--color-text-muted);
}

.sc-search-input {
  flex: 1;
  background: none;
  border: none;
  color: var(--color-text);
  font-size: 10px;
  outline: none;
  font-family: inherit;
}

.sc-sidebar-body {
  flex: 1;
  overflow-y: auto;
  padding-bottom: 17px;
}

.sc-sidebar-empty {
  padding: 8px 11px;
  font-size: 10px;
  color: var(--color-text-muted);
  display: flex;
  align-items: center;
  gap: 5px;
}

/* ── Sidebar sections ── */
.sc-section { margin-bottom: 4px; }

.sc-section-header {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 10px;
  background: none;
  border: none;
  color: var(--color-text-muted);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  cursor: pointer;
}

.sc-section-header:hover { color: var(--color-text-secondary); }
.sc-section-body { padding: 0 3px; }

/* ── Tree items ── */
.sc-tree-item-wrap { margin-bottom: 1px; }

.sc-tree-folder {
  display: flex;
  align-items: center;
  border-radius: 6px;
  transition: background 0.1s;
}

.sc-tree-folder:hover { background: var(--color-hover); }
.sc-tree-folder.selected { background: var(--color-surface-elevated); }

.sc-tree-folder-btn {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 4px 6px;
  background: none;
  border: none;
  color: var(--color-text-secondary);
  font-size: 11px;
  text-align: left;
  cursor: pointer;
  min-width: 0;
}

.sc-tree-folder-btn:hover { color: var(--color-text); }

.sc-tree-chevron {
  color: var(--color-text-muted);
  flex-shrink: 0;
  width: 12px;
  display: flex;
  align-items: center;
}

.sc-tree-folder-icon {
  color: var(--color-text-muted);
  flex-shrink: 0;
  display: flex;
}

.sc-tree-folder.selected .sc-tree-folder-icon { color: var(--color-cta); }

.sc-tree-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
  font-size: 11px;
}

.sc-tree-menu-wrap { position: relative; flex-shrink: 0; }

.sc-tree-menu-btn {
  width: 26px; height: 26px;
  background: none; border: none;
  color: var(--color-text-muted);
  border-radius: 5px;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s;
  margin-right: 4px;
}

.sc-tree-folder:hover .sc-tree-menu-btn,
.sc-tree-menu-btn.open { opacity: 1; }
.sc-tree-menu-btn:hover { background: var(--color-hover); color: var(--color-text); }

.sc-tree-menu {
  position: absolute;
  right: 0; top: calc(100% + 4px);
  background: var(--color-surface-elevated);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 4px;
  min-width: 148px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.2);
  z-index: 50;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.sc-tree-menu button {
  width: 100%; background: none; border: none;
  color: var(--color-text);
  font-size: 10px; border-radius: 5px;
  padding: 5px 7px;
  display: flex; align-items: center; gap: 5px;
  cursor: pointer; text-align: left;
}

.sc-tree-menu button:hover { background: var(--color-hover); }
.sc-tree-menu button.danger { color: var(--color-error); }

.sc-tree-children { padding-left: 17px; }

.sc-tree-file {
  display: flex; align-items: center; gap: 5px;
  width: 100%;
  padding: 4px 6px;
  background: none; border: none;
  color: var(--color-text-secondary);
  font-size: 10px;
  border-radius: 5px;
  cursor: pointer;
  text-align: left;
}

.sc-tree-file:hover { background: var(--color-hover); color: var(--color-text); }
.sc-tree-file.active-file .sc-skill-md { color: var(--color-cta); font-weight: 700; }

.sc-tree-file-icon { color: var(--color-text-muted); flex-shrink: 0; display: flex; }
.sc-tree-file-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* ── Main area ── */
.sc-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.sc-action-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 9px;
  padding: 7px 11px;
  background: rgba(var(--color-error-rgb), 0.12);
  border-bottom: 1px solid rgba(var(--color-error-rgb), 0.28);
  font-size: 11px;
  color: #fca5a5;
  flex-shrink: 0;
}

.sc-action-error-close {
  background: none;
  border: none;
  color: #fca5a5;
  font-size: 15px;
  line-height: 1;
  cursor: pointer;
  padding: 0 2px;
  flex-shrink: 0;
}

/* ── Editor root ── */
.sc-editor-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

/* ── Top bar ── */
.sc-editor-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 11px 20px 8px;
  border-bottom: 1px solid var(--color-border-subtle);
  flex-shrink: 0;
  position: relative;
}

.sc-editor-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--color-text);
  margin: 0;
}

.sc-editor-topbar-right {
  display: flex;
  align-items: center;
  gap: 9px;
}

.sc-editor-menu {
  position: absolute;
  right: 28px; top: calc(100% + 4px);
  background: var(--color-surface-elevated);
  border: 1px solid var(--color-border);
  border-radius: 9px;
  padding: 4px;
  min-width: 160px;
  box-shadow: 0 10px 28px rgba(0,0,0,0.2);
  z-index: 50;
  display: flex; flex-direction: column; gap: 2px;
}

.sc-editor-menu button {
  width: 100%; background: none; border: none;
  color: var(--color-text); font-size: 11px;
  border-radius: 6px; padding: 6px 8px;
  display: flex; align-items: center; gap: 6px;
  cursor: pointer; text-align: left;
}

.sc-editor-menu button:hover { background: var(--color-hover); }
.sc-editor-menu button.danger { color: var(--color-error); }

/* ── Toggle ── */
.sc-toggle-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}

.sc-toggle-wrap input { display: none; }

.sc-toggle-track {
  width: 36px; height: 20px;
  background: var(--color-border);
  border-radius: 8px;
  transition: background 0.2s;
  display: block;
  position: relative;
}

.sc-toggle-track::after {
  content: '';
  position: absolute;
  top: 3px; left: 3px;
  width: 14px; height: 14px;
  border-radius: 50%;
  background: white;
  transition: transform 0.2s;
}

.sc-toggle-wrap input:checked ~ .sc-toggle-track { background: var(--color-cta); }
.sc-toggle-wrap input:checked ~ .sc-toggle-track::after { transform: translateX(16px); }

.sc-toggle-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-secondary);
}

/* ── Metadata bar ── */
.sc-metadata-bar {
  display: flex;
  gap: 24px;
  padding: 8px 20px;
  border-bottom: 1px solid var(--color-border-subtle);
  flex-shrink: 0;
  flex-wrap: wrap;
}

.sc-meta-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.sc-meta-label {
  font-size: 10px;
  font-weight: 700;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.sc-meta-value {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text);
  display: flex;
  align-items: center;
  gap: 5px;
}

.sc-meta-slash {
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  color: var(--color-cta);
  background: var(--color-primary-subtle);
  padding: 2px 5px;
  border-radius: 4px;
}

.sc-meta-hint {
  font-size: 10px;
  color: var(--color-text-muted);
  font-family: var(--font-mono, monospace);
}

/* ── Description bar ── */
.sc-description-bar {
  padding: 8px 20px;
  border-bottom: 1px solid var(--color-border-subtle);
  flex-shrink: 0;
}

.sc-desc-label {
  font-size: 10px;
  font-weight: 700;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 5px;
  display: block;
}

.sc-desc-text {
  font-size: 11px;
  color: var(--color-text-secondary);
  line-height: 1.55;
  margin: 0;
}

/* ── Content area ── */
.sc-content-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  margin: 20px 24px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 12px;
}

.sc-content-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 7px 11px;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.sc-content-filename {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 10px;
  font-weight: 600;
  color: var(--color-text-muted);
  font-family: var(--font-mono, monospace);
}

.sc-content-toolbar-right {
  display: flex;
  align-items: center;
  gap: 5px;
}

.sc-view-btn {
  width: 30px; height: 30px;
  background: none; border: 1px solid transparent;
  color: var(--color-text-muted);
  border-radius: 6px;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
  transition: all 0.15s;
}

.sc-view-btn:hover { color: var(--color-text); background: var(--color-hover); }
.sc-view-btn.active { color: var(--color-cta); background: var(--color-primary-subtle); border-color: var(--color-primary-subtle); }

.sc-toolbar-btn {
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 10px;
  font-weight: 700;
  cursor: pointer;
  border: none;
}

.sc-toolbar-btn.save { background: var(--color-cta); color: white; }
.sc-toolbar-btn.save:disabled { opacity: 0.5; cursor: not-allowed; }
.sc-toolbar-btn.cancel { background: var(--color-surface-elevated); color: var(--color-text-secondary); border: 1px solid var(--color-border); }

.sc-content-body {
  flex: 1;
  overflow-y: auto;
  padding: 17px 20px;
}

.sc-content-loading {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--color-text-muted);
  font-size: 11px;
  padding: 34px 0;
  justify-content: center;
}

.sc-content-empty {
  color: var(--color-text-muted);
  font-size: 12px;
  padding: 34px 0;
  text-align: center;
}

.sc-inline-link {
  background: none; border: none;
  color: var(--color-cta);
  font-size: 12px;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.sc-editor-textarea {
  width: 100%;
  min-height: 300px;
  background: transparent;
  border: none;
  color: var(--color-text);
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  line-height: 1.7;
  resize: none;
  outline: none;
}

.sc-markdown-wrap {
  font-size: 12px;
  line-height: 1.75;
  color: var(--color-text);
}

/* ── Empty state ── */
.sc-empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 9px;
  color: var(--color-text-muted);
  padding: 34px;
}

.sc-empty-icon { opacity: 0.25; }
.sc-empty-state h2 { font-size: 15px; font-weight: 700; color: var(--color-text-secondary); margin: 0; }
.sc-empty-state p { font-size: 12px; margin: 0; color: var(--color-text-muted); text-align: center; }

.sc-empty-btn {
  display: flex; align-items: center; gap: 5px;
  background: var(--color-cta); color: white;
  border: none; padding: 6px 14px; border-radius: 8px;
  font-size: 11px; font-weight: 700; cursor: pointer;
  margin-top: 8px;
}

.sc-empty-btn:hover { opacity: 0.9; }

/* ── Shared helpers ── */
.sc-icon-btn {
  background: none; border: none;
  color: var(--color-text-muted);
  width: 28px; height: 28px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 5px; cursor: pointer;
}
.sc-icon-btn:hover, .sc-icon-btn.active { background: var(--color-hover); color: var(--color-text); }

@keyframes sc-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
.sc-spin { animation: sc-spin 0.9s linear infinite; display: inline-flex; }

/* ── File tree nodes ── */
.sc-tree-dir {
  display: flex;
  align-items: center;
  gap: 3px;
  width: 100%;
  background: transparent;
  border: none;
  color: var(--color-text-muted);
  cursor: pointer;
  text-align: left;
  padding: 2px 6px;
  font-size: 10px;
  border-radius: 3px;
  transition: background 0.1s, color 0.1s;
}
.sc-tree-dir:hover {
  background: var(--color-hover);
  color: var(--color-text);
}
.sc-tree-dir .sc-tree-file-name {
  color: var(--color-text-muted);
}
.sc-tree-dir:hover .sc-tree-file-name {
  color: var(--color-text);
}

.sc-tree-loading {
  display: flex;
  align-items: center;
  padding: 3px 14px;
  color: var(--color-text-muted);
  font-size: 10px;
  opacity: 0.6;
}

/* ── Lang tag in toolbar ── */
.sc-lang-tag {
  font-size: 10px;
  font-weight: 700;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-family: var(--font-mono, monospace);
  padding: 2px 4px;
  border-radius: 3px;
  background: color-mix(in srgb, var(--color-text-muted) 10%, transparent);
}

/* ── Code view ── */
.sc-code-wrap {
  flex: 1;
  min-height: 0;
  overflow: auto;
  background: var(--color-bg-code, #1e1e1e);
}

/* ══════════════════════════════════════════════════════════════
   Skill icon + toggle + repo import — moved from
   settings/CapabilitiesViews.tsx when its Skills tab merged here
══════════════════════════════════════════════════════════════ */

.sc-tree-icon-btn {
  width: 20px; height: 20px; border-radius: 5px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  background: none; border: none; cursor: pointer;
  color: var(--color-text-muted);
  transition: background 0.1s, color 0.1s;
}
.sc-tree-icon-btn:hover { background: var(--color-hover); color: var(--color-text); }

.sc-tree-folder.skill-off { opacity: 0.5; }

/* ── Skill toggle ── */
.caps-skill-toggle-lbl { position: relative; display: inline-flex; cursor: pointer; flex-shrink: 0; }
.caps-skill-toggle-lbl input { opacity: 0; width: 0; height: 0; position: absolute; }
.caps-skill-toggle-track {
  width: 28px; height: 16px; background: var(--color-border);
  border-radius: 8px; transition: background 0.2s; display: block;
}
.caps-skill-toggle-lbl input:checked ~ .caps-skill-toggle-track { background: var(--color-cta); }
.caps-skill-toggle-track::after {
  content: ''; position: absolute; top: 2px; left: 2px;
  width: 12px; height: 12px; border-radius: 50%;
  background: white; transition: transform 0.2s;
}
.caps-skill-toggle-lbl input:checked ~ .caps-skill-toggle-track::after { transform: translateX(12px); }

/* ── Icon picker panel ── */
.sip-panel {
  position: fixed; z-index: 9999;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 9px; padding: 7px 8px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.2), 0 2px 8px rgba(0,0,0,0.12);
  width: 292px;
}
.sip-group { margin-bottom: 8px; }
.sip-group:last-child { margin-bottom: 0; }
.sip-group-label {
  font-size: 10px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.07em; color: var(--color-text-muted);
  margin-bottom: 3px; padding: 0 2px;
}
.sip-group-icons { display: flex; flex-wrap: wrap; gap: 2px; }
.sip-icon-btn {
  width: 30px; height: 30px; padding: 0;
  display: flex; align-items: center; justify-content: center;
  background: none; border: none; cursor: pointer; border-radius: 5px;
  color: var(--color-text-secondary); transition: background 0.1s, color 0.1s;
}
.sip-icon-btn:hover { background: var(--color-hover); color: var(--color-text); }
.sip-icon-btn.active { background: var(--color-primary-subtle); color: var(--color-cta); }

/* ── Repo import modal ── */
.repo-modal-shell { max-width: 520px; }

.repo-url-row {
  display: flex; gap: 8px; align-items: stretch;
}

.repo-section-title {
  font-size: 10px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.07em; color: var(--color-text-muted);
  margin-bottom: 10px;
}

.repo-catalog-list {
  display: flex; flex-direction: column; gap: 6px;
}

.repo-catalog-entry {
  display: flex; align-items: center; gap: 9px;
  background: var(--color-surface); border: 1px solid var(--color-border);
  border-radius: 8px; padding: 8px 10px;
}

.repo-entry-info { flex: 1; min-width: 0; }
.repo-entry-name { font-size: 11px; font-weight: 700; color: var(--color-text); }
.repo-entry-desc { font-size: 10px; color: var(--color-text-muted); margin-top: 2px; }
.repo-origin-badge {
  font-size: 10px; font-weight: 600; color: var(--color-text-muted);
  background: var(--color-hover); padding: 2px 4px; border-radius: 3px;
  margin-left: 8px; vertical-align: middle;
}

.repo-install-btn {
  display: flex; align-items: center; gap: 4px;
  background: var(--color-cta); color: white;
  border: none; padding: 4px 8px; border-radius: 6px;
  font-size: 10px; font-weight: 700; cursor: pointer;
  white-space: nowrap; flex-shrink: 0;
  transition: opacity 0.15s;
}
.repo-install-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.repo-install-btn:hover:not(:disabled) { opacity: 0.9; }

.repo-uninstall-btn {
  display: flex; align-items: center; gap: 4px;
  background: var(--color-hover); color: var(--color-text-muted);
  border: 1px solid var(--color-border); padding: 4px 8px; border-radius: 6px;
  font-size: 10px; font-weight: 600; cursor: pointer;
  white-space: nowrap; flex-shrink: 0;
  transition: color 0.15s, background 0.15s;
}
.repo-uninstall-btn:hover:not(:disabled) { color: var(--color-error); border-color: var(--color-error); background: rgba(var(--color-error-rgb),0.06); }
.repo-uninstall-btn:disabled { opacity: 0.6; cursor: not-allowed; }

.caps-reload-btn {
  display: flex; align-items: center; gap: 5px;
  background: var(--color-cta); color: white; border: none;
  padding: 7px 12px; border-radius: 8px;
  font-size: 11px; font-weight: 700; cursor: pointer;
  white-space: nowrap;
}
.caps-reload-btn:disabled { opacity: 0.6; cursor: not-allowed; }

.caps-error {
  font-size: 11px; color: var(--color-error);
  padding: 8px 11px; border-radius: 6px;
  background: rgba(var(--color-error-rgb, 255,77,79), 0.08);
  margin-bottom: 16px;
}

/* ── Shared modal chrome (mirrors settings/SettingsNav.tsx's
   SETTINGS_SHARED_CSS — duplicated here rather than imported, since this
   page isn't nested under Settings) ── */
.modal-backdrop {
  position: fixed; inset: 0; background: rgba(0,0,0,0.4);
  display: flex; align-items: center; justify-content: center;
  z-index: 1000; backdrop-filter: blur(2px);
  padding: 24px; box-sizing: border-box;
}
.modal-shell {
  background: var(--color-bg); width: 100%; max-width: 560px;
  border-radius: 14px; box-shadow: 0 30px 80px rgba(0,0,0,0.2);
  animation: slide-up 0.3s ease-out;
  display: flex; flex-direction: column;
  max-height: calc(100vh - 48px); overflow: hidden;
}
.modal-header {
  padding: 14px 18px; display: flex; align-items: center;
  justify-content: space-between; border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}
.modal-header h2 { font-size: var(--font-size-lg); margin: 0; font-weight: 700; color: var(--color-text); }
.modal-close-btn { background: none; border: none; color: var(--color-text-muted); cursor: pointer; display: flex; }
.modal-content { padding: 16px 18px; overflow-y: auto; flex: 1; min-height: 0; }
.modal-footer {
  padding: 12px 18px; display: flex; justify-content: flex-end; gap: 8px;
  border-top: 1px solid var(--color-border); flex-shrink: 0;
}
.modal-btn-submit { background: var(--color-cta); color: white; border: none; padding: 7px 16px; border-radius: 8px; font-weight: 700; cursor: pointer; font-size: var(--font-size-xs); }
.modal-btn-submit:disabled { opacity: 0.5; cursor: not-allowed; }

.sv-field { display: flex; flex-direction: column; gap: 6px; }
.sv-field label { font-size: var(--font-size-xs); font-weight: 600; color: var(--color-text-secondary); }
.sv-input-box input {
  width: 100%;
  background: var(--color-surface);
  border: 1.5px solid var(--color-border);
  padding: 7px 10px;
  border-radius: 8px;
  color: var(--color-text);
  font-size: var(--font-size-sm);
  outline: none;
  font-family: inherit;
}
.sv-input-box input:focus { border-color: var(--color-primary); }
`

