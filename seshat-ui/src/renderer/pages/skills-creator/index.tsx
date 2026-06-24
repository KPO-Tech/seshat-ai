import { useState, useEffect, useCallback, useRef, KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search, Plus, Right, Down, FolderClose, FolderOpen,
  FileCode, Close, Sync, MoreOne, Edit, PreviewOpen, ArrowLeft, Left,
  Robot, Send, Copy, CheckOne,
} from '@icon-park/react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { api } from '@/api/client'
import { useUIStore } from '@/stores/ui'
import { MarkdownView } from '@/components/MarkdownView'
import { NexusLogo } from '@/components/NexusLogo'

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

type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
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
  const closeRightPanel = useUIStore((s) => s.closeRightPanel)

  // Close Agent Monitor and any right panel when entering this page
  useEffect(() => { closeRightPanel() }, [closeRightPanel])

  const [chatOpen, setChatOpen] = useState(() => {
    try { return localStorage.getItem('sc-agent-open') === 'true' } catch { return false }
  })
  const [agentWidth, setAgentWidth] = useState(() => {
    try { return Number(localStorage.getItem('sc-agent-width')) || 360 } catch { return 360 }
  })
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatSessionId, setChatSessionId] = useState<string | null>(null)

  const toggleChat = () => {
    setChatOpen(v => {
      const next = !v
      try { localStorage.setItem('sc-agent-open', String(next)) } catch {}
      return next
    })
  }
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
  const [creating, setCreating] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.get<{ skills: Skill[] }>('/skills')
      const all = data.skills ?? []
      setSkills(all)
      return all
    } catch {
      return [] as Skill[]
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

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
      next.has(name) ? next.delete(name) : next.add(name)
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
            <Left size={15} />
          </button>
          <span className="sc-sidebar-title">Skills</span>
          <div className="sc-sidebar-actions">
            <button
              className="sc-icon-btn"
              onClick={toggleChat}
              title="SkillAgent"
              style={chatOpen ? { color: 'var(--color-accent, #f97316)' } : undefined}
            >
              <Robot size={15} />
            </button>
            <button
              className={`sc-icon-btn${showSearch ? ' active' : ''}`}
              onClick={() => { setShowSearch(v => !v); setTimeout(() => searchRef.current?.focus(), 50) }}
              title="Search"
            >
              <Search size={15} />
            </button>
            <button className="sc-icon-btn" onClick={() => { setCreating(true); setSelectedSkill(null) }} title="New skill">
              <Plus size={15} />
            </button>
          </div>
        </div>

        {showSearch && (
          <div className="sc-search-wrap">
            <Search size={13} />
            <input
              ref={searchRef}
              className="sc-search-input"
              placeholder="Filter skills…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button className="sc-icon-btn" onClick={() => setSearchQuery('')}><Close size={12} /></button>
            )}
          </div>
        )}

        <div className="sc-sidebar-body">
          {loading ? (
            <div className="sc-sidebar-empty"><Sync size={14} className="sc-spin" /> Loading…</div>
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
        {creating ? (
          <CreateSkillPanel
            onCancel={() => setCreating(false)}
            onCreated={(name) => {
              setCreating(false)
              load().then((all) => {
                const skill = all.find((item) => item.name === name)
                if (skill) selectSkill(skill)
              })
            }}
          />
        ) : selectedSkill ? (
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
          <EmptyState onNew={() => { setCreating(true); setSelectedSkill(null) }} />
        )}
      </div>

      {/* ── SkillAgent panel — right side ── */}
      {chatOpen && (
        <SkillAgentPanel
          selectedSkill={selectedSkill}
          messages={chatMessages}
          sessionId={chatSessionId}
          width={agentWidth}
          onWidthChange={(w) => {
            setAgentWidth(w)
            try { localStorage.setItem('sc-agent-width', String(w)) } catch {}
          }}
          onMessagesChange={setChatMessages}
          onSessionIdChange={setChatSessionId}
          onApply={(content) => {
            if (!selectedSkill || !isUserSkill(selectedSkill)) return
            setFileContent(content)
            setEditValue(content)
            setSelectedFilePath('skill.md')
            setEditMode(false)
          }}
          onClose={toggleChat}
        />
      )}
    </div>
  )
}

// ─── Skill section in sidebar ─────────────────────────────────────────────────

function SkillSection({
  label, skills, expanded, selected, selectedFilePath, fileTree, fileTreeLoading,
  onToggle, onSelectSkill, onSelectFile, onDelete, readOnly = false, emptyHint,
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
  readOnly?: boolean
  emptyHint: string
}) {
  const [sectionOpen, setSectionOpen] = useState(true)

  return (
    <div className="sc-section">
      <button className="sc-section-header" onClick={() => setSectionOpen(v => !v)}>
        <span className="sc-section-label">{label}</span>
        {sectionOpen ? <Down size={12} /> : <Right size={12} />}
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
  onToggle, onSelect, onSelectFile, onDelete,
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

  return (
    <div className="sc-tree-item-wrap">
      {/* Skill folder row */}
      <div className={`sc-tree-folder${isSelected ? ' selected' : ''}`}>
        <button className="sc-tree-folder-btn" onClick={onToggle}>
          <span className="sc-tree-chevron">
            {isExpanded ? <Down size={11} /> : <Right size={11} />}
          </span>
          <span className="sc-tree-folder-icon">
            {isExpanded ? <FolderOpen size={15} /> : <FolderClose size={15} />}
          </span>
          <span className="sc-tree-name">{displayName}</span>
        </button>
        {onDelete && (
          <div className="sc-tree-menu-wrap" ref={menuRef}>
            <button
              className={`sc-tree-menu-btn${menuOpen ? ' open' : ''}`}
              onClick={e => { e.stopPropagation(); setMenuOpen(v => !v) }}
            >
              <MoreOne size={13} />
            </button>
            {menuOpen && (
              <div className="sc-tree-menu">
                <button onClick={() => { setMenuOpen(false); onDelete() }} className="danger">
                  <Close size={12} /> Delete skill
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Expanded file tree */}
      {isExpanded && (
        <div className="sc-tree-children">
          {fileTreeLoading ? (
            <div className="sc-tree-loading"><Sync size={11} className="sc-spin" /></div>
          ) : fileTree.length === 0 ? (
            // Fallback: skill.md always exists even if tree failed
            <button
              className={`sc-tree-file${selectedFilePath === 'skill.md' ? ' active-file' : ''}`}
              onClick={() => { onSelect(); onSelectFile('skill.md') }}
            >
              <span className="sc-tree-file-icon"><FileCode size={13} /></span>
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
            {open ? <FolderOpen size={13} /> : <FolderClose size={13} />}
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
      <span className="sc-tree-file-icon"><FileCode size={13} /></span>
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
                <MoreOne size={18} />
              </button>
              {menuOpen && (
                <div className="sc-editor-menu">
                  {isEditable && (
                    <button onClick={() => { setMenuOpen(false); onToggleEdit() }}>
                      <Edit size={13} /> {editMode ? 'Cancel editing' : 'Edit skill'}
                    </button>
                  )}
                  <button className="danger" onClick={() => { setMenuOpen(false); onDelete() }}>
                    <Close size={13} /> Delete skill
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
            <FileCode size={13} />
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
                  <PreviewOpen size={15} />
                </button>
                <button className="sc-view-btn" onClick={onToggleEdit} title="Edit raw markdown">
                  <Edit size={15} />
                </button>
              </>
            ) : isMd ? (
              <button className="sc-view-btn active" title="Preview">
                <PreviewOpen size={15} />
              </button>
            ) : (
              <span className="sc-lang-tag">{lang}</span>
            )}
          </div>
        </div>

        <div className="sc-content-body">
          {loading ? (
            <div className="sc-content-loading"><Sync size={16} className="sc-spin" /> Loading…</div>
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

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="sc-empty-state">
      <div className="sc-empty-icon">
        <FileCode size={40} />
      </div>
      <h2>No skill selected</h2>
      <p>Select a skill from the sidebar, or create a new one.</p>
      <button className="sc-empty-btn" onClick={onNew}>
        <Plus size={14} /> New Skill
      </button>
    </div>
  )
}

// ─── Create skill panel ───────────────────────────────────────────────────────

function CreateSkillPanel({
  onCancel, onCreated,
}: {
  onCancel: () => void
  onCreated: (name: string) => void
}) {
  const [form, setForm] = useState({
    name: '', display_name: '', description: '', argument_hint: '', content: '',
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => { nameRef.current?.focus() }, [])

  const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }))

  // Auto-slugify name
  const handleNameChange = (v: string) => {
    const slug = v.toLowerCase().replace(/[^a-z0-9-_]/g, '-').replace(/-+/g, '-')
    set('name', slug)
  }

  const slugPreview = form.name.trim() || 'skill-name'
  const displayPreview = form.display_name.trim() || slugPreview
  const descPreview = form.description.trim() || 'No description'

  const handleCreate = async () => {
    const name = form.name.trim()
    if (!name) { setErr('Name is required'); nameRef.current?.focus(); return }
    setSaving(true)
    setErr(null)
    try {
      await api.post('/skills', { ...form, name })
      onCreated(name)
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed to create skill')
      setSaving(false)
    }
  }

  const canSubmit = form.name.trim().length > 0 && !saving

  return (
    <div className="csp-root">

      {/* ── Top bar ── */}
      <div className="csp-topbar">
        <button className="csp-back-btn" onClick={onCancel}>
          <ArrowLeft size={16} />
          <span>Back</span>
        </button>
        <div className="csp-topbar-center">
          <span className="csp-topbar-title">New skill</span>
        </div>
        <div className="csp-topbar-actions">
          <button className="csp-cancel-btn" onClick={onCancel}>Cancel</button>
          <button className="csp-create-btn" onClick={handleCreate} disabled={!canSubmit}>
            {saving ? (
              <><Sync size={13} className="sc-spin" /> Creating…</>
            ) : (
              <>Create skill</>
            )}
          </button>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="csp-body">

        {/* ── Left column: identity + metadata ── */}
        <div className="csp-col-meta">

          {/* Command name */}
          <div className="csp-field-group">
            <div className="csp-field-label">Slash command</div>
            <div className="csp-field-hint">Unique key used to invoke the skill in chat</div>
            <div className="csp-name-input-wrap">
              <span className="csp-name-slash">/</span>
              <input
                ref={nameRef}
                className="csp-name-input"
                type="text"
                value={form.name}
                onChange={e => handleNameChange(e.target.value)}
                placeholder="skill-name"
                spellCheck={false}
                autoComplete="off"
              />
            </div>
          </div>

          {/* Display name */}
          <div className="csp-field-group">
            <div className="csp-field-label">Display name</div>
            <input
              className="csp-input"
              type="text"
              value={form.display_name}
              onChange={e => set('display_name', e.target.value)}
              placeholder="e.g. Review Pull Request"
            />
          </div>

          {/* Description */}
          <div className="csp-field-group">
            <div className="csp-field-label">Description</div>
            <div className="csp-field-hint">Shown in the / picker when the user types</div>
            <textarea
              className="csp-textarea csp-desc-textarea"
              value={form.description}
              onChange={e => set('description', e.target.value)}
              placeholder="What does this skill do? When should it be used?"
              rows={3}
            />
          </div>

          {/* Argument hint */}
          <div className="csp-field-group">
            <div className="csp-field-label">Argument hint <span className="csp-optional">optional</span></div>
            <input
              className="csp-input csp-mono"
              type="text"
              value={form.argument_hint}
              onChange={e => set('argument_hint', e.target.value)}
              placeholder="[branch name]"
            />
          </div>

          {/* Live preview card */}
          <div className="csp-preview-section">
            <div className="csp-field-label">Preview</div>
            <div className="csp-preview-card">
              <div className="csp-preview-row">
                <span className="csp-preview-slash">/{slugPreview}</span>
                {form.argument_hint && (
                  <span className="csp-preview-args">{form.argument_hint}</span>
                )}
              </div>
              <div className="csp-preview-name">{displayPreview}</div>
              <div className="csp-preview-desc">{descPreview}</div>
            </div>
          </div>

          {err && <div className="csp-error">{err}</div>}
        </div>

        {/* ── Right column: prompt content ── */}
        <div className="csp-col-content">
          <div className="csp-content-header">
            <div className="csp-field-label">Prompt content</div>
            <div className="csp-field-hint">The full instructions sent to the model when this skill is invoked</div>
          </div>
          <div className="csp-editor-wrap">
            <div className="csp-editor-toolbar">
              <span className="csp-editor-lang">markdown</span>
              <span className="csp-char-count">{form.content.length} chars</span>
            </div>
            <textarea
              className="csp-prompt-editor"
              value={form.content}
              onChange={e => set('content', e.target.value)}
              placeholder={PROMPT_PLACEHOLDER}
              spellCheck={false}
            />
          </div>
        </div>

      </div>
    </div>
  )
}

// ─── SkillAgent panel ────────────────────────────────────────────────────────

const AGENT_ACTIONS = [
  { icon: '✦', label: 'Create a new skill',  desc: "I'll help you scaffold a new skill from scratch.", prompt: 'Help me create a new SeshatOS skill from scratch.' },
  { icon: '◎', label: 'Explain a skill',     desc: "I'll explain how a skill works.",                 prompt: 'Explain how SeshatOS skills work and what skill.md should contain.' },
  { icon: '✎', label: 'Improve a skill',     desc: "I'll help you optimize or refactor your skill.",  prompt: 'Help me improve and optimize my current skill.' },
  { icon: '⬡', label: 'Test a skill',        desc: "I'll help you test and debug your skill.",        prompt: 'How can I test and debug my SeshatOS skill effectively?' },
  { icon: '◈', label: 'Browse skills',       desc: 'See examples of existing skills.',                prompt: 'Show me examples of well-written SeshatOS skills.' },
]

function SkillAgentPanel({
  selectedSkill, messages, sessionId, width, onWidthChange,
  onMessagesChange, onSessionIdChange, onApply, onClose,
}: {
  selectedSkill: Skill | null
  messages: ChatMessage[]
  sessionId: string | null
  width: number
  onWidthChange: (w: number) => void
  onMessagesChange: (msgs: ChatMessage[]) => void
  onSessionIdChange: (id: string | null) => void
  onApply: (content: string) => void
  onClose: () => void
}) {
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const dragging = useRef(false)
  const dragStartX = useRef(0)
  const dragStartW = useRef(width)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Resize drag handle
  const onDragStart = (e: React.MouseEvent) => {
    e.preventDefault()
    dragging.current = true
    dragStartX.current = e.clientX
    dragStartW.current = width
    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return
      const delta = dragStartX.current - ev.clientX
      onWidthChange(Math.max(280, Math.min(600, dragStartW.current + delta)))
    }
    const onUp = () => {
      dragging.current = false
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  const send = useCallback(async (text: string) => {
    const t = text.trim()
    if (!t || loading) return

    const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', content: t }
    const nextMsgs = [...messages, userMsg]
    onMessagesChange(nextMsgs)
    setInput('')
    setLoading(true)

    // Build context note for the selected skill (backend handles the full system prompt)
    let skillContext: string | undefined
    if (!sessionId && selectedSkill) {
      skillContext = `Selected skill context:\n- Name: ${selectedSkill.name}\n- Display name: ${selectedSkill.display_name || selectedSkill.name}\n- Description: ${selectedSkill.description || '(none)'}\n- Collection: ${selectedSkill.collection}`
    }

    try {
      const resp = await api.post<{ session_id: string; content: string }>('/query', {
        prompt: t,
        session_id: sessionId ?? undefined,
        execution_origin: 'skill_agent',
        append_system_prompt: skillContext,
      })
      if (!sessionId) onSessionIdChange(resp.session_id)
      onMessagesChange([...nextMsgs, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: resp.content,
      }])
    } catch (e: unknown) {
      onMessagesChange([...nextMsgs, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `⚠ ${(e as { message?: string })?.message ?? 'Failed to reach SkillAgent'}`,
      }])
    } finally {
      setLoading(false)
    }
  }, [loading, messages, sessionId, selectedSkill, onMessagesChange, onSessionIdChange])

  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) }
  }

  const clearConversation = () => { onMessagesChange([]); onSessionIdChange(null) }

  return (
    <div className="sca-panel" style={{ width }}>
      {/* Resize handle on left edge */}
      <div className="sca-resize-handle" onMouseDown={onDragStart} title="Drag to resize" />

      {/* Header */}
      <div className="sca-header">
        <div className="sca-header-left">
          <NexusLogo size={20} className="sca-logo-img" />
          <span className="sca-title">SkillAgent</span>
        </div>
        <div className="sca-header-right">
          {messages.length > 0 && (
            <button className="sca-icon-btn" title="Clear conversation" onClick={clearConversation}>
              <Sync size={13} />
            </button>
          )}
          <button className="sca-icon-btn" title="Close SkillAgent" onClick={onClose}>
            <Close size={13} />
          </button>
        </div>
      </div>

      {/* Messages / welcome */}
      <div className="sca-messages">
        {messages.length === 0 ? (
          <div className="sca-welcome">
            <div className="sca-welcome-card">
              <p className="sca-welcome-greeting">👋 Hi! I'm <strong>SkillAgent</strong>.</p>
              <p className="sca-welcome-sub">I'm here to help you create, improve,<br />and test skills.</p>
              <p className="sca-welcome-sub">Ask me anything about skills!</p>
            </div>

            <p className="sca-section-label">How can I help you today?</p>

            <div className="sca-actions">
              {AGENT_ACTIONS.map(action => (
                <button
                  key={action.label}
                  className="sca-action-card"
                  onClick={() => send(action.prompt)}
                >
                  <span className="sca-action-icon">{action.icon}</span>
                  <div className="sca-action-text">
                    <span className="sca-action-label">{action.label}</span>
                    <span className="sca-action-desc">{action.desc}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map(msg => (
              <AgentMessage key={msg.id} msg={msg} onApply={onApply} />
            ))}
            {loading && (
              <div className="sca-msg sca-msg-assistant">
                <div className="sca-typing">
                  <span className="sca-dot" /><span className="sca-dot" /><span className="sca-dot" />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      {/* Input area */}
      <div className="sca-input-wrap">
        <textarea
          ref={inputRef}
          className="sca-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Ask SkillAgent…"
          rows={3}
          disabled={loading}
        />
        <div className="sca-input-footer">
          <div className="sca-input-extras">
            <button className="sca-extra-btn" title="Attach file (coming soon)" disabled>
              <span style={{ fontSize: 16 }}>📎</span>
            </button>
            <button
              className="sca-extra-btn"
              title="Insert skill context"
              onClick={() => {
                if (selectedSkill) setInput(v => v + `\n\nCurrent skill: /${selectedSkill.name}`)
              }}
            >
              <span style={{ fontSize: 14, fontFamily: 'monospace', fontWeight: 700 }}>{'{}'}</span>
            </button>
          </div>
          <button
            className={`sca-send-btn${!input.trim() || loading ? ' disabled' : ''}`}
            onClick={() => send(input)}
            disabled={!input.trim() || loading}
            title="Send (Enter)"
          >
            <Send size={15} />
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Agent message with Apply button on code blocks ───────────────────────────

function AgentMessage({ msg, onApply }: { msg: ChatMessage; onApply: (content: string) => void }) {
  if (msg.role === 'user') {
    return (
      <div className="sca-msg sca-msg-user">
        <div className="sca-bubble-user">{msg.content}</div>
      </div>
    )
  }

  // Parse content: split on ```fenced blocks to identify code blocks
  const parts = parseAgentContent(msg.content)

  return (
    <div className="sca-msg sca-msg-assistant">
      <div className="sca-bubble-assistant">
        {parts.map((part, i) =>
          part.type === 'text' ? (
            <div key={i} className="sca-text-part">
              <MarkdownView>{part.content}</MarkdownView>
            </div>
          ) : (
            <AgentCodeBlock
              key={i}
              lang={part.lang}
              content={part.content}
              onApply={part.lang === 'markdown' || part.lang === 'md' || part.lang === '' ? onApply : undefined}
            />
          )
        )}
      </div>
    </div>
  )
}

type ContentPart = { type: 'text'; content: string } | { type: 'code'; lang: string; content: string }

function parseAgentContent(raw: string): ContentPart[] {
  const parts: ContentPart[] = []
  const regex = /```(\w*)\n?([\s\S]*?)```/g
  let lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = regex.exec(raw)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', content: raw.slice(lastIndex, match.index) })
    }
    parts.push({ type: 'code', lang: match[1] || '', content: match[2].trimEnd() })
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < raw.length) {
    parts.push({ type: 'text', content: raw.slice(lastIndex) })
  }
  return parts
}

function AgentCodeBlock({
  lang, content, onApply,
}: {
  lang: string
  content: string
  onApply?: (content: string) => void
}) {
  const [copied, setCopied] = useState(false)

  const copy = () => {
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  const displayLang = lang || 'text'

  return (
    <div className="sca-code-block">
      <div className="sca-code-toolbar">
        <span className="sca-code-lang">{displayLang}</span>
        <div className="sca-code-actions">
          <button className="sca-code-btn" onClick={copy} title="Copy">
            {copied ? <CheckOne size={12} /> : <Copy size={12} />}
          </button>
          {onApply && (
            <button className="sca-code-btn sca-apply-btn" onClick={() => onApply(content)} title="Apply to skill.md">
              Apply to skill
            </button>
          )}
        </div>
      </div>
      <SyntaxHighlighter
        language={langForPath('.' + displayLang) === 'text' ? displayLang : langForPath('.' + displayLang)}
        style={vscDarkPlus as any}
        customStyle={{ margin: 0, padding: '10px 12px', fontSize: 12, lineHeight: 1.6, background: 'transparent' }}
        wrapLongLines={false}
      >
        {content}
      </SyntaxHighlighter>
    </div>
  )
}

const PROMPT_PLACEHOLDER = `You are a specialized assistant. When invoked with /${'skill-name'}:

1. Understand the user's intent from the provided arguments
2. Gather relevant context if needed
3. Execute the task clearly and concisely

## Guidelines
- Be direct and actionable
- Ask for clarification only when truly necessary
- Format output for readability
`

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseSkillContent(raw: string): { frontmatter: string; body: string } {
  if (!raw.startsWith('---')) return { frontmatter: '', body: raw }
  const parts = raw.split('---')
  if (parts.length < 3) return { frontmatter: '', body: raw }
  return { frontmatter: parts[1].trim(), body: parts.slice(2).join('---').trim() }
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
  gap: 6px;
  justify-content: space-between;
  padding: 10px 12px 8px;
  flex-shrink: 0;
}

.sc-back-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 7px;
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
  font-size: 13px;
  font-weight: 700;
  color: var(--color-text);
  letter-spacing: 0.01em;
}

.sc-sidebar-actions {
  display: flex;
  gap: 4px;
}

.sc-search-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 10px 8px;
  color: var(--color-text-muted);
}

.sc-search-input {
  flex: 1;
  background: none;
  border: none;
  color: var(--color-text);
  font-size: 12px;
  outline: none;
  font-family: inherit;
}

.sc-sidebar-body {
  flex: 1;
  overflow-y: auto;
  padding-bottom: 24px;
}

.sc-sidebar-empty {
  padding: 12px 16px;
  font-size: 12px;
  color: var(--color-text-muted);
  display: flex;
  align-items: center;
  gap: 6px;
}

/* ── Sidebar sections ── */
.sc-section { margin-bottom: 4px; }

.sc-section-header {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 14px;
  background: none;
  border: none;
  color: var(--color-text-muted);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  cursor: pointer;
}

.sc-section-header:hover { color: var(--color-text-secondary); }
.sc-section-body { padding: 0 4px; }

/* ── Tree items ── */
.sc-tree-item-wrap { margin-bottom: 1px; }

.sc-tree-folder {
  display: flex;
  align-items: center;
  border-radius: 8px;
  transition: background 0.1s;
}

.sc-tree-folder:hover { background: var(--color-hover); }
.sc-tree-folder.selected { background: var(--color-surface-elevated); }

.sc-tree-folder-btn {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  background: none;
  border: none;
  color: var(--color-text-secondary);
  font-size: 13px;
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
  font-size: 13px;
}

.sc-tree-menu-wrap { position: relative; flex-shrink: 0; }

.sc-tree-menu-btn {
  width: 26px; height: 26px;
  background: none; border: none;
  color: var(--color-text-muted);
  border-radius: 6px;
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
  border-radius: 10px;
  padding: 6px;
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
  font-size: 12px; border-radius: 6px;
  padding: 7px 10px;
  display: flex; align-items: center; gap: 7px;
  cursor: pointer; text-align: left;
}

.sc-tree-menu button:hover { background: var(--color-hover); }
.sc-tree-menu button.danger { color: var(--color-error, #ef4444); }

.sc-tree-children { padding-left: 24px; }

.sc-tree-file {
  display: flex; align-items: center; gap: 7px;
  width: 100%;
  padding: 5px 8px;
  background: none; border: none;
  color: var(--color-text-secondary);
  font-size: 12px;
  border-radius: 6px;
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
  gap: 12px;
  padding: 10px 16px;
  background: rgba(239, 68, 68, 0.12);
  border-bottom: 1px solid rgba(239, 68, 68, 0.28);
  font-size: 13px;
  color: #fca5a5;
  flex-shrink: 0;
}

.sc-action-error-close {
  background: none;
  border: none;
  color: #fca5a5;
  font-size: 18px;
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
  padding: 16px 28px 12px;
  border-bottom: 1px solid var(--color-border-subtle);
  flex-shrink: 0;
  position: relative;
}

.sc-editor-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--color-text);
  margin: 0;
}

.sc-editor-topbar-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.sc-editor-menu {
  position: absolute;
  right: 28px; top: calc(100% + 4px);
  background: var(--color-surface-elevated);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 6px;
  min-width: 160px;
  box-shadow: 0 10px 28px rgba(0,0,0,0.2);
  z-index: 50;
  display: flex; flex-direction: column; gap: 2px;
}

.sc-editor-menu button {
  width: 100%; background: none; border: none;
  color: var(--color-text); font-size: 13px;
  border-radius: 8px; padding: 8px 12px;
  display: flex; align-items: center; gap: 8px;
  cursor: pointer; text-align: left;
}

.sc-editor-menu button:hover { background: var(--color-hover); }
.sc-editor-menu button.danger { color: var(--color-error, #ef4444); }

/* ── Toggle ── */
.sc-toggle-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.sc-toggle-wrap input { display: none; }

.sc-toggle-track {
  width: 36px; height: 20px;
  background: var(--color-border);
  border-radius: 10px;
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
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-secondary);
}

/* ── Metadata bar ── */
.sc-metadata-bar {
  display: flex;
  gap: 32px;
  padding: 12px 28px;
  border-bottom: 1px solid var(--color-border-subtle);
  flex-shrink: 0;
  flex-wrap: wrap;
}

.sc-meta-item {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.sc-meta-label {
  font-size: 11px;
  font-weight: 700;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.sc-meta-value {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text);
  display: flex;
  align-items: center;
  gap: 6px;
}

.sc-meta-slash {
  font-family: var(--font-mono, monospace);
  font-size: 13px;
  color: var(--color-cta);
  background: var(--color-primary-subtle);
  padding: 1px 7px;
  border-radius: 5px;
}

.sc-meta-hint {
  font-size: 12px;
  color: var(--color-text-muted);
  font-family: var(--font-mono, monospace);
}

/* ── Description bar ── */
.sc-description-bar {
  padding: 12px 28px;
  border-bottom: 1px solid var(--color-border-subtle);
  flex-shrink: 0;
}

.sc-desc-label {
  font-size: 11px;
  font-weight: 700;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 5px;
  display: block;
}

.sc-desc-text {
  font-size: 13px;
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
  border-radius: 16px;
}

.sc-content-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.sc-content-filename {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-muted);
  font-family: var(--font-mono, monospace);
}

.sc-content-toolbar-right {
  display: flex;
  align-items: center;
  gap: 6px;
}

.sc-view-btn {
  width: 30px; height: 30px;
  background: none; border: 1px solid transparent;
  color: var(--color-text-muted);
  border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
  transition: all 0.15s;
}

.sc-view-btn:hover { color: var(--color-text); background: var(--color-hover); }
.sc-view-btn.active { color: var(--color-cta); background: var(--color-primary-subtle); border-color: var(--color-primary-subtle); }

.sc-toolbar-btn {
  padding: 5px 14px;
  border-radius: 8px;
  font-size: 12px;
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
  padding: 24px 28px;
}

.sc-content-loading {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--color-text-muted);
  font-size: 13px;
  padding: 48px 0;
  justify-content: center;
}

.sc-content-empty {
  color: var(--color-text-muted);
  font-size: 14px;
  padding: 48px 0;
  text-align: center;
}

.sc-inline-link {
  background: none; border: none;
  color: var(--color-cta);
  font-size: 14px;
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
  font-size: 13px;
  line-height: 1.7;
  resize: none;
  outline: none;
}

.sc-markdown-wrap {
  font-size: 14px;
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
  gap: 12px;
  color: var(--color-text-muted);
  padding: 48px;
}

.sc-empty-icon { opacity: 0.25; }
.sc-empty-state h2 { font-size: 18px; font-weight: 700; color: var(--color-text-secondary); margin: 0; }
.sc-empty-state p { font-size: 14px; margin: 0; color: var(--color-text-muted); text-align: center; }

.sc-empty-btn {
  display: flex; align-items: center; gap: 7px;
  background: var(--color-cta); color: white;
  border: none; padding: 9px 20px; border-radius: 10px;
  font-size: 13px; font-weight: 700; cursor: pointer;
  margin-top: 8px;
}

.sc-empty-btn:hover { opacity: 0.9; }

/* ── Shared helpers ── */
.sc-icon-btn {
  background: none; border: none;
  color: var(--color-text-muted);
  width: 28px; height: 28px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 7px; cursor: pointer;
}
.sc-icon-btn:hover, .sc-icon-btn.active { background: var(--color-hover); color: var(--color-text); }

@keyframes sc-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
.sc-spin { animation: sc-spin 0.9s linear infinite; display: inline-flex; }

/* ── Create Skill Panel ── */
.csp-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.csp-topbar {
  display: flex;
  align-items: center;
  padding: 12px 20px;
  border-bottom: 1px solid var(--color-border-subtle);
  flex-shrink: 0;
  gap: 16px;
}

.csp-back-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: none;
  color: var(--color-text-muted);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  padding: 6px 10px;
  border-radius: 8px;
  transition: background 0.15s, color 0.15s;
}

.csp-back-btn:hover {
  background: var(--color-hover);
  color: var(--color-text);
}

.csp-topbar-center {
  flex: 1;
  display: flex;
  justify-content: center;
}

.csp-topbar-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--color-text);
}

.csp-topbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.csp-cancel-btn {
  padding: 6px 14px;
  background: none;
  border: 1px solid var(--color-border);
  color: var(--color-text-secondary);
  font-size: 13px;
  font-weight: 600;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s;
}

.csp-cancel-btn:hover { background: var(--color-hover); }

.csp-create-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 16px;
  background: var(--color-cta);
  color: white;
  border: none;
  font-size: 13px;
  font-weight: 700;
  border-radius: 8px;
  cursor: pointer;
  transition: opacity 0.15s;
}

.csp-create-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.csp-create-btn:not(:disabled):hover { opacity: 0.88; }

/* ── Two-column body ── */
.csp-body {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.csp-col-meta {
  width: 320px;
  flex-shrink: 0;
  border-right: 1px solid var(--color-border-subtle);
  overflow-y: auto;
  padding: 24px 20px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.csp-col-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 24px;
}

/* ── Form fields ── */
.csp-field-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.csp-field-label {
  font-size: 12px;
  font-weight: 700;
  color: var(--color-text-secondary);
  letter-spacing: 0.02em;
  display: flex;
  align-items: center;
  gap: 6px;
}

.csp-field-hint {
  font-size: 12px;
  color: var(--color-text-muted);
  line-height: 1.45;
  margin-top: -2px;
}

.csp-optional {
  font-size: 11px;
  font-weight: 500;
  color: var(--color-text-muted);
  background: var(--color-surface-elevated);
  padding: 1px 6px;
  border-radius: 4px;
  border: 1px solid var(--color-border);
}

/* ── Slash command input ── */
.csp-name-input-wrap {
  display: flex;
  align-items: center;
  background: var(--color-surface-elevated);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  overflow: hidden;
  transition: border-color 0.15s;
}

.csp-name-input-wrap:focus-within { border-color: var(--color-cta); }

.csp-name-slash {
  padding: 8px 2px 8px 12px;
  font-size: 15px;
  font-weight: 700;
  font-family: var(--font-mono, monospace);
  color: var(--color-cta);
  user-select: none;
  flex-shrink: 0;
}

.csp-name-input {
  flex: 1;
  background: none;
  border: none;
  outline: none;
  color: var(--color-text);
  font-size: 14px;
  font-family: var(--font-mono, monospace);
  font-weight: 600;
  padding: 8px 12px 8px 4px;
}

.csp-name-input::placeholder { color: var(--color-text-muted); font-weight: 400; }

/* ── Generic input & textarea ── */
.csp-input {
  background: var(--color-surface-elevated);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  color: var(--color-text);
  font-size: 13px;
  font-family: inherit;
  padding: 8px 12px;
  outline: none;
  transition: border-color 0.15s;
  width: 100%;
  box-sizing: border-box;
}

.csp-input:focus { border-color: var(--color-cta); }
.csp-input::placeholder { color: var(--color-text-muted); }

.csp-textarea {
  background: var(--color-surface-elevated);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  color: var(--color-text);
  font-size: 13px;
  font-family: inherit;
  padding: 8px 12px;
  outline: none;
  resize: none;
  transition: border-color 0.15s;
  width: 100%;
  box-sizing: border-box;
  line-height: 1.55;
}

.csp-textarea:focus { border-color: var(--color-cta); }
.csp-textarea::placeholder { color: var(--color-text-muted); }
.csp-desc-textarea { min-height: 72px; }
.csp-mono { font-family: var(--font-mono, monospace); font-size: 12px; }

/* ── Live preview card ── */
.csp-preview-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.csp-preview-card {
  background: var(--color-surface-elevated);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.csp-preview-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.csp-preview-slash {
  font-family: var(--font-mono, monospace);
  font-size: 13px;
  font-weight: 700;
  color: var(--color-cta);
  background: var(--color-primary-subtle);
  padding: 2px 8px;
  border-radius: 5px;
}

.csp-preview-args {
  font-family: var(--font-mono, monospace);
  font-size: 12px;
  color: var(--color-text-muted);
}

.csp-preview-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text);
}

.csp-preview-desc {
  font-size: 12px;
  color: var(--color-text-muted);
  line-height: 1.45;
}

/* ── Error ── */
.csp-error {
  font-size: 12px;
  color: var(--color-error, #ef4444);
  background: rgba(239, 68, 68, 0.08);
  border: 1px solid rgba(239, 68, 68, 0.25);
  border-radius: 8px;
  padding: 8px 12px;
}

/* ── Right column: prompt editor ── */
.csp-content-header {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 12px;
  flex-shrink: 0;
}

.csp-editor-wrap {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  overflow: hidden;
}

.csp-editor-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 14px;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.csp-editor-lang {
  font-size: 11px;
  font-weight: 700;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-family: var(--font-mono, monospace);
}

.csp-char-count {
  font-size: 11px;
  color: var(--color-text-muted);
  font-family: var(--font-mono, monospace);
}

.csp-prompt-editor {
  flex: 1;
  min-height: 0;
  width: 100%;
  background: transparent;
  border: none;
  outline: none;
  color: var(--color-text);
  font-family: var(--font-mono, monospace);
  font-size: 13px;
  line-height: 1.7;
  padding: 16px 18px;
  resize: none;
  box-sizing: border-box;
}

.csp-prompt-editor::placeholder { color: var(--color-text-muted); opacity: 0.6; }

.sc-readonly-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  background: color-mix(in srgb, var(--color-text-muted) 12%, transparent);
  color: var(--color-text-muted);
  border: 1px solid color-mix(in srgb, var(--color-text-muted) 20%, transparent);
}

/* ── File tree nodes ── */
.sc-tree-dir {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
  background: transparent;
  border: none;
  color: var(--color-text-muted);
  cursor: pointer;
  text-align: left;
  padding: 3px 8px;
  font-size: 12px;
  border-radius: 4px;
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
  padding: 4px 20px;
  color: var(--color-text-muted);
  font-size: 11px;
  opacity: 0.6;
}

/* ── Lang tag in toolbar ── */
.sc-lang-tag {
  font-size: 11px;
  font-weight: 700;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-family: var(--font-mono, monospace);
  padding: 2px 6px;
  border-radius: 4px;
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
   SkillAgent — right panel (VS Code Copilot style)
══════════════════════════════════════════════════════════════ */

.sca-panel {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--color-border-subtle);
  background: var(--color-bg);
  overflow: hidden;
  position: relative;
  min-width: 280px;
  max-width: 600px;
}

/* Resize handle — left edge */
.sca-resize-handle {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  cursor: ew-resize;
  z-index: 10;
  transition: background 0.15s;
}
.sca-resize-handle:hover,
.sca-resize-handle:active {
  background: color-mix(in srgb, var(--color-accent, #f97316) 40%, transparent);
}

/* Header */
.sca-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px 10px 16px;
  border-bottom: 1px solid var(--color-border-subtle);
  flex-shrink: 0;
}
.sca-header-left {
  display: flex;
  align-items: center;
  gap: 7px;
}
.sca-logo-img {
  opacity: 0.92;
  flex-shrink: 0;
}
.sca-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text);
  letter-spacing: 0.01em;
}
.sca-header-right {
  display: flex;
  align-items: center;
  gap: 2px;
}
.sca-icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 6px;
  background: transparent;
  border: none;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: background 0.13s, color 0.13s;
}
.sca-icon-btn:hover { background: var(--color-hover); color: var(--color-text); }

/* Messages area */
.sca-messages {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* Welcome state */
.sca-welcome {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.sca-welcome-card {
  background: color-mix(in srgb, var(--color-text) 5%, transparent);
  border-radius: 10px;
  padding: 14px 16px;
  border: 1px solid var(--color-border-subtle);
}
.sca-welcome-greeting {
  font-size: 13.5px;
  font-weight: 500;
  color: var(--color-text);
  margin: 0 0 6px;
}
.sca-welcome-sub {
  font-size: 12.5px;
  color: var(--color-text-muted);
  margin: 0;
  line-height: 1.5;
}

.sca-section-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-muted);
  letter-spacing: 0.03em;
  margin: 0;
}

/* Action cards */
.sca-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.sca-action-card {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  background: color-mix(in srgb, var(--color-text) 4%, transparent);
  border: 1px solid var(--color-border-subtle);
  border-radius: 8px;
  padding: 10px 12px;
  cursor: pointer;
  text-align: left;
  transition: background 0.13s, border-color 0.13s;
  width: 100%;
}
.sca-action-card:hover {
  background: color-mix(in srgb, var(--color-accent, #f97316) 8%, transparent);
  border-color: color-mix(in srgb, var(--color-accent, #f97316) 30%, transparent);
}
.sca-action-icon {
  font-size: 15px;
  line-height: 1.3;
  color: var(--color-accent, #f97316);
  flex-shrink: 0;
  margin-top: 1px;
}
.sca-action-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.sca-action-label {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--color-text);
  display: block;
}
.sca-action-desc {
  font-size: 11.5px;
  color: var(--color-text-muted);
  display: block;
  line-height: 1.4;
}

/* Messages */
.sca-msg { display: flex; flex-direction: column; }
.sca-msg-user    { align-items: flex-end; }
.sca-msg-assistant { align-items: flex-start; }

.sca-bubble-user {
  background: var(--color-accent, #f97316);
  color: #fff;
  padding: 8px 12px;
  border-radius: 12px 12px 3px 12px;
  font-size: 13px;
  line-height: 1.5;
  max-width: 88%;
  white-space: pre-wrap;
  word-break: break-word;
}
.sca-bubble-assistant {
  width: 100%;
}
.sca-text-part { padding: 0 2px; }
.sca-text-part .markdown-body { font-size: 13px; }

/* Typing indicator */
.sca-typing {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 10px 12px;
  background: color-mix(in srgb, var(--color-text) 5%, transparent);
  border-radius: 10px;
  border: 1px solid var(--color-border-subtle);
}
.sca-dot {
  width: 6px; height: 6px;
  border-radius: 50%;
  background: var(--color-text-muted);
  animation: sca-bounce 1.2s ease-in-out infinite;
}
.sca-dot:nth-child(2) { animation-delay: 0.2s; }
.sca-dot:nth-child(3) { animation-delay: 0.4s; }
@keyframes sca-bounce {
  0%, 80%, 100% { opacity: 0.3; transform: scale(0.85); }
  40%           { opacity: 1;   transform: scale(1);    }
}

/* Code block inside message */
.sca-code-block {
  margin: 6px 0;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid var(--color-border-subtle);
  background: #1e1e1e;
}
.sca-code-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 10px;
  background: rgba(255,255,255,0.04);
  border-bottom: 1px solid rgba(255,255,255,0.06);
}
.sca-code-lang {
  font-size: 10px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.06em;
  color: rgba(255,255,255,0.4);
  font-family: var(--font-mono, monospace);
}
.sca-code-actions { display: flex; align-items: center; gap: 4px; }
.sca-code-btn {
  display: flex; align-items: center; gap: 4px;
  background: transparent; border: none;
  color: rgba(255,255,255,0.4);
  cursor: pointer; padding: 2px 6px;
  border-radius: 4px; font-size: 11px;
  transition: background 0.1s, color 0.1s;
}
.sca-code-btn:hover { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.8); }
.sca-apply-btn {
  color: var(--color-accent, #f97316);
  font-weight: 600;
  border: 1px solid color-mix(in srgb, var(--color-accent, #f97316) 35%, transparent);
}
.sca-apply-btn:hover {
  background: color-mix(in srgb, var(--color-accent, #f97316) 15%, transparent);
}

/* Input area */
.sca-input-wrap {
  flex-shrink: 0;
  padding: 10px 12px 12px;
  border-top: 1px solid var(--color-border-subtle);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.sca-input {
  width: 100%;
  background: color-mix(in srgb, var(--color-text) 4%, transparent);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  color: var(--color-text);
  font-size: 13px;
  line-height: 1.55;
  padding: 10px 12px;
  resize: none;
  outline: none;
  font-family: inherit;
  box-sizing: border-box;
  transition: border-color 0.15s;
}
.sca-input:focus { border-color: var(--color-accent, #f97316); }
.sca-input::placeholder { color: var(--color-text-muted); opacity: 0.55; }
.sca-input-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.sca-input-extras { display: flex; align-items: center; gap: 4px; }
.sca-extra-btn {
  display: flex; align-items: center; justify-content: center;
  width: 30px; height: 30px;
  border-radius: 7px;
  background: transparent;
  border: none;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: background 0.13s, color 0.13s;
}
.sca-extra-btn:hover:not(:disabled) { background: var(--color-hover); color: var(--color-text); }
.sca-extra-btn:disabled { opacity: 0.35; cursor: default; }
.sca-send-btn {
  display: flex; align-items: center; justify-content: center;
  width: 36px; height: 36px;
  border-radius: 9px;
  border: none;
  background: var(--color-accent, #f97316);
  color: #fff;
  cursor: pointer;
  flex-shrink: 0;
  transition: opacity 0.15s, transform 0.1s;
}
.sca-send-btn:not(.disabled):hover  { opacity: 0.88; transform: scale(1.04); }
.sca-send-btn:not(.disabled):active { transform: scale(0.96); }
.sca-send-btn.disabled { opacity: 0.35; cursor: default; }
`
