import { useState, useEffect, useRef } from 'react'
import { Search } from '@icon-park/react'
import { WindowCloseIcon } from '@/components/ui/WindowControlIcon'
import { resolveNodeIcon, tintColor } from './nodeIcons'
import type { NodeDescription } from './types'

type Props = {
  open: boolean
  nodeTypes: NodeDescription[]
  categoryColorOf: (category: string) => string
  loading?: boolean
  error?: string | null
  onClose: () => void
  onPick: (desc: NodeDescription) => void
}

export function NodeCreator({ open, nodeTypes, categoryColorOf, loading, error, onClose, onPick }: Props) {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setQuery('')
      setTimeout(() => inputRef.current?.focus(), 30)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const trimmed = query.trim().toLowerCase()
  const matches = (n: NodeDescription) =>
    !trimmed || n.name.toLowerCase().includes(trimmed) || n.description.toLowerCase().includes(trimmed) || n.type.toLowerCase().includes(trimmed)
  const filtered = nodeTypes.filter(matches)

  const groups: Array<[string, NodeDescription[]]> = trimmed
    ? [['Results', filtered]]
    : Array.from(new Set(nodeTypes.map((n) => n.category))).map((c) => [c, filtered.filter((n) => n.category === c)])

  function row(n: NodeDescription) {
    const color = categoryColorOf(n.category)
    return (
      <button
        key={n.type}
        type="button"
        className="gfc-item"
        onMouseDown={(e) => { e.preventDefault(); onPick(n) }}
      >
        <span className="gfc-item-icon" style={{ background: tintColor(color), color }}>
          {resolveNodeIcon(n.type, n.category, 16)}
        </span>
        <span className="gfc-item-body">
          <span className="gfc-item-title">{n.name}</span>
          <span className="gfc-item-desc">{n.description}</span>
        </span>
      </button>
    )
  }

  return (
    <div className="gfc-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <style>{NODE_CREATOR_CSS}</style>
      <div className="gfc-shell" role="dialog" aria-modal="true" aria-label="Add a node">
        <div className="gfc-input-row">
          <Search size={15} className="gfc-input-icon" />
          <input
            ref={inputRef}
            className="gfc-input"
            placeholder="Search nodes…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
          <button className="gfc-close-btn" onClick={onClose} tabIndex={-1}>
            <WindowCloseIcon />
          </button>
        </div>

        <div className="gfc-results">
          {loading && <div className="gfc-empty">Loading node types…</div>}
          {error && <div className="gfc-empty gfc-error">{error}</div>}
          {!loading && !error && filtered.length === 0 && <div className="gfc-empty">No matching nodes</div>}
          {!loading && !error && groups.map(([label, items]) => items.length > 0 && (
            <div key={label} className="gfc-group">
              <div className="gfc-group-label" style={{ color: categoryColorOf(label) }}>{label}</div>
              {items.map(row)}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

const NODE_CREATOR_CSS = `
.gfc-backdrop {
  position: absolute; inset: 0; z-index: 20;
  background: rgba(0,0,0,0.35);
  display: flex; align-items: flex-start; justify-content: flex-end;
  padding: 14px;
}

.gfc-shell {
  width: 320px;
  max-height: 100%;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  box-shadow: 0 24px 64px rgba(0,0,0,0.32);
  overflow: hidden;
  display: flex; flex-direction: column;
}

.gfc-input-row {
  display: flex; align-items: center; gap: 9px;
  padding: 10px 13px;
  border-bottom: 1px solid var(--color-border-subtle);
  flex-shrink: 0;
}

.gfc-input-icon { color: var(--color-text-muted); flex-shrink: 0; }

.gfc-input {
  flex: 1; background: none; border: none; outline: none;
  font-size: 13px; font-weight: 500; color: var(--color-text);
  font-family: var(--font-sans);
}

.gfc-input::placeholder { color: var(--color-text-muted); }

.gfc-close-btn {
  background: var(--color-surface); border: 1px solid var(--color-border);
  color: var(--color-text-muted); border-radius: 5px;
  padding: 3px 6px; cursor: pointer; flex-shrink: 0;
  display: flex; align-items: center;
}
.gfc-close-btn:hover { background: var(--color-hover); }

.gfc-results {
  overflow-y: auto; flex: 1;
  padding: 8px;
}

.gfc-group { margin-bottom: 10px; }

.gfc-group-label {
  font-size: var(--font-size-2xs);
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 4px 6px;
}

.gfc-item {
  width: 100%;
  display: flex; align-items: center; gap: 9px;
  padding: 7px 8px; border-radius: 8px;
  border: none; background: transparent; text-align: left;
  cursor: pointer; transition: background 0.08s;
}

.gfc-item:hover { background: var(--color-hover); }

.gfc-item-icon {
  width: 28px; height: 28px; flex-shrink: 0;
  border-radius: 7px;
  display: flex; align-items: center; justify-content: center;
}

.gfc-item-body { min-width: 0; display: flex; flex-direction: column; gap: 1px; }

.gfc-item-title {
  font-size: 12px; font-weight: 650; color: var(--color-text);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

.gfc-item-desc {
  font-size: 10px; color: var(--color-text-muted);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

.gfc-empty {
  display: flex; align-items: center; justify-content: center;
  min-height: 120px; color: var(--color-text-muted); font-size: 11px;
  text-align: center; padding: 0 16px;
}

.gfc-error { color: #ff6b6b; }
`
