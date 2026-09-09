import { useEffect, useRef, useState } from 'react'
import { Close, Edit, FileCode, MoreOne, PreviewOpen, Sync } from '@icon-park/react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { MarkdownView } from '@/components/MarkdownView'
import type { Skill } from '../api/types'
import { SIDEBAR_COLLECTION_LABELS } from '../lib/skillGrouping'
import { isMarkdownPath, langForPath, parseSkillContent } from '../lib/skillFiles'

// ─── Editor panel ─────────────────────────────────────────────────────────────

export function SkillEditorPanel({
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

