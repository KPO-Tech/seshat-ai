import { useEffect, useRef, useState } from 'react'
import { Close, Code, Down, FileCode, FolderClose, FolderOpen, MoreOne, Right, Sync } from '@icon-park/react'
import type { Skill, TreeNode } from '../api/types'
import { getDefaultIconName, loadSkillIcons, saveSkillIcon, SKILL_ICON_LOOKUP } from '../lib/skillIcons'
import { SkillIconPicker } from './SkillIconPicker'

// ─── Skill section in sidebar ─────────────────────────────────────────────────

export function SkillSection({
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
          aria-label="Change icon"
        >
          <IconComp size={12} />
        </button>
        {onToggleEnabled && (
          <label
            className="caps-skill-toggle-lbl"
            aria-label={isEnabled ? 'Disable' : 'Enable'}
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

