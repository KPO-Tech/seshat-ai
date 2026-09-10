import { useState, useEffect, useCallback, useRef } from 'react'
import { Search, Close, Sync, Upload } from '@icon-park/react'
import { WindowCloseIcon } from '@/components/ui/WindowControlIcon'
import { api } from '@/api/client'
import { useUIStore } from '@/stores/ui'
import type { CatalogEntry, RepoInfo, Skill, TreeNode } from '../api/types'
import '../styles/skills-creator.css'
import { EmptyState } from '../components/EmptyState'
import { RepoManagerModal } from '../components/RepoManagerModal'
import { SkillEditorPanel } from '../components/SkillEditorPanel'
import { SkillSection } from '../components/SkillSidebar'
import { groupForSidebar, isUserSkill } from '../lib/skillGrouping'

// ─── Main page ────────────────────────────────────────────────────────────────

export function SkillsCreatorPage() {
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

      {/* ── Secondary sidebar ── */}
      <aside className="sc-sidebar">
        <div className="sc-sidebar-header">
          <span className="sc-sidebar-title">Skills</span>
          <div className="sc-sidebar-actions">
            <button
              className={`sc-icon-btn${showSearch ? ' active' : ''}`}
              onClick={() => { setShowSearch(v => !v); setTimeout(() => searchRef.current?.focus(), 50) }}
              aria-label="Search"
            >
              <Search size={12} />
            </button>
            {repoManagementAvailable && (
              <button className="sc-icon-btn" onClick={() => setShowInstaller(true)} aria-label="Import skills from a repository">
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
            <button className="sc-action-error-close" onClick={() => setActionError(null)} aria-label="Dismiss">
              <WindowCloseIcon size={12} />
            </button>
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

// ─── CSS ──────────────────────────────────────────────────────────────────────
