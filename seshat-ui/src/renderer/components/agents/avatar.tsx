import { useState, useEffect, useMemo, useRef } from 'react'
import { Sync } from '@icon-park/react'
import { createAvatar } from '@dicebear/core'
import { lorelei, adventurer } from '@dicebear/collection'
import type { Agent } from '@/api/types'

// Shared between Workspace's Agents tab and the Companion page - both manage
// the same underlying /agents records and must render/pick faces identically,
// so this logic lives in one place rather than two copies that can drift
// (exactly the kind of drift the provider icons had before they were fixed).

// ─── Avatar encoding ────────────────────────────────────────────────────────
// Agents get an illustrated face generated locally (DiceBear), seeded
// deterministically from their slug. The `icon` field stores "style:seed" so
// the pick persists; an empty field falls back to the default style, seeded
// from the slug. Older/built-in agents may still carry a literal emoji in
// `icon` - those keep rendering as emoji rather than being reinterpreted as a
// seed.

export const AVATAR_STYLES = {
  lorelei: { style: lorelei, label: 'Lorelei' },
  adventurer: { style: adventurer, label: 'Adventurer' },
} as const

export type AvatarStyleId = keyof typeof AVATAR_STYLES

export const DEFAULT_AVATAR_STYLE: AvatarStyleId = 'lorelei'

const AVATAR_COLORS = [
  '#EF7C2F', '#6B39CB', '#10A37F', '#4285F4',
  '#D97757', '#C89A6A', '#6FAF7B', '#7D9CCF',
]

export function agentColor(slug: string): string {
  let h = 0
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

export function isEmojiIcon(icon: string): boolean {
  return /\p{Extended_Pictographic}/u.test(icon)
}

export function isAvatarStyleId(id: string): id is AvatarStyleId {
  return id in AVATAR_STYLES
}

export function parseAvatarIcon(icon: string | undefined, slug: string): { styleId: AvatarStyleId; seed: string } {
  const trimmed = icon?.trim()
  if (trimmed && !isEmojiIcon(trimmed)) {
    const sep = trimmed.indexOf(':')
    if (sep > 0) {
      const styleId = trimmed.slice(0, sep)
      const seed = trimmed.slice(sep + 1)
      if (isAvatarStyleId(styleId) && seed) return { styleId, seed }
    }
    return { styleId: DEFAULT_AVATAR_STYLE, seed: trimmed } // legacy value: no style prefix
  }
  return { styleId: DEFAULT_AVATAR_STYLE, seed: slug || 'new-agent' }
}

export function encodeAvatarIcon(styleId: AvatarStyleId, seed: string): string {
  return `${styleId}:${seed}`
}

export function randomSeed(): string {
  return Math.random().toString(36).slice(2, 10)
}

const avatarSvgCache = new Map<string, string>()

export function generatedAvatarSvg(styleId: AvatarStyleId, seed: string): string {
  const key = `${styleId}:${seed}`
  let svg = avatarSvgCache.get(key)
  if (!svg) {
    // Each DiceBear style has its own literal Options type (hair variants, etc.), so a
    // registry mixing several styles can't type-check against createAvatar's generic
    // signature - cast is safe since only `seed` is passed, which every style accepts.
    svg = createAvatar(AVATAR_STYLES[styleId].style as Parameters<typeof createAvatar>[0], { seed }).toString()
    avatarSvgCache.set(key, svg)
  }
  return svg
}

// ─── Display ────────────────────────────────────────────────────────────────

export function AgentAvatar({ agent, size = 40 }: { agent: Agent; size?: number }) {
  const icon = agent.icon?.trim() ?? ''
  const radius = Math.round(size * 0.28)

  if (icon && isEmojiIcon(icon)) {
    return (
      <div
        className="wk-avatar"
        style={{ width: size, height: size, borderRadius: radius, background: agentColor(agent.slug), fontSize: Math.round(size * 0.45) }}
      >
        {icon}
      </div>
    )
  }

  const { styleId, seed } = parseAvatarIcon(icon, agent.slug)
  return (
    <div
      className="wk-avatar wk-avatar-generated"
      style={{ width: size, height: size, borderRadius: radius }}
      dangerouslySetInnerHTML={{ __html: generatedAvatarSvg(styleId, seed) }}
    />
  )
}

// ─── Picker ─────────────────────────────────────────────────────────────────

const PICKER_VARIANTS_PER_STYLE = 8

function pickerSeeds(baseSeed: string): string[] {
  return Array.from({ length: PICKER_VARIANTS_PER_STYLE }, (_, i) => `${baseSeed}-${i}`)
}

export function AvatarPicker({ styleId, seed, baseSeed, onPick, onReroll, disabled, size = 64 }: {
  styleId: AvatarStyleId; seed: string; baseSeed: string
  onPick: (styleId: AvatarStyleId, seed: string) => void
  onReroll: () => void
  disabled?: boolean; size?: number
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const radius = Math.round(size * 0.28)
  const svg = useMemo(() => generatedAvatarSvg(styleId, seed), [styleId, seed])

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="wk-avatar-picker" ref={wrapRef}>
      <div className="wk-avatar-picker-row">
        <button
          type="button"
          className="wk-avatar-picker-face"
          style={{ width: size, height: size, borderRadius: radius }}
          onClick={() => !disabled && setOpen(v => !v)}
          disabled={disabled}
          aria-label={disabled ? undefined : 'Choose a face'}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        {!disabled && (
          <button
            type="button"
            className="wk-avatar-reroll"
            onClick={onReroll}
            aria-label="Generate a new face"
          >
            <Sync size={12} />
          </button>
        )}
      </div>

      {open && !disabled && (
        <div className="wk-avatar-popover">
          {(Object.keys(AVATAR_STYLES) as AvatarStyleId[]).map(id => (
            <div key={id} className="wk-avatar-popover-group">
              <div className="wk-avatar-popover-title">{AVATAR_STYLES[id].label}</div>
              <div className="wk-avatar-popover-grid">
                {pickerSeeds(baseSeed).map(s => {
                  const selected = id === styleId && s === seed
                  return (
                    <button
                      key={s}
                      type="button"
                      className={`wk-avatar-swatch ${selected ? 'selected' : ''}`}
                      onClick={() => { onPick(id, s); setOpen(false) }}
                      dangerouslySetInnerHTML={{ __html: generatedAvatarSvg(id, s) }}
                    />
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Styles ─────────────────────────────────────────────────────────────────
// Shared by every host page that renders AgentAvatar/AvatarPicker.

export const AVATAR_CSS = `
.wk-avatar {
  display: flex; align-items: center; justify-content: center;
  font-weight: 700; color: #fff; flex-shrink: 0; user-select: none;
}
.wk-avatar-generated svg { width: 100%; height: 100%; display: block; }

.wk-avatar-picker { position: relative; display: flex; flex-direction: column; align-items: center; gap: var(--space-2); flex-shrink: 0; }
.wk-avatar-picker-row { display: flex; flex-direction: column; align-items: center; gap: var(--space-2); }
.wk-avatar-picker-face {
  overflow: hidden; flex-shrink: 0; padding: 0; margin: 0;
  background: var(--color-surface); border: 1px solid var(--color-border-subtle);
  cursor: pointer; transition: border-color 0.15s;
}
.wk-avatar-picker-face:hover:not(:disabled) { border-color: var(--color-primary); }
.wk-avatar-picker-face:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }
.wk-avatar-picker-face:disabled { cursor: default; }
.wk-avatar-picker-face svg { width: 100%; height: 100%; display: block; pointer-events: none; }
.wk-avatar-reroll {
  display: flex; align-items: center; justify-content: center;
  width: 26px; height: 26px; border-radius: 50%; border: 1px solid var(--color-border);
  background: var(--color-surface); color: var(--color-text-muted); cursor: pointer;
  transition: background 0.1s, color 0.1s, transform 0.15s;
}
.wk-avatar-reroll:hover { background: var(--color-hover); color: var(--color-text); }
.wk-avatar-reroll:active { transform: rotate(120deg); }

.wk-avatar-popover {
  position: absolute; top: calc(100% + 10px); left: 0;
  z-index: 300; width: 236px;
  background: var(--color-bg); border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-lg); box-shadow: var(--shadow-large);
  padding: 12px; display: flex; flex-direction: column; gap: 12px;
}
.wk-avatar-popover-group { display: flex; flex-direction: column; gap: 7px; }
.wk-avatar-popover-title {
  font-size: var(--font-size-2xs); font-weight: 700; letter-spacing: 0.04em;
  text-transform: uppercase; color: var(--color-text-muted);
}
.wk-avatar-popover-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
.wk-avatar-swatch {
  aspect-ratio: 1; border-radius: var(--radius-sm); overflow: hidden; padding: 0;
  background: var(--color-surface); border: 1.5px solid transparent; cursor: pointer;
  transition: border-color 0.12s, transform 0.1s;
}
.wk-avatar-swatch:hover { border-color: var(--color-border); transform: translateY(-1px); }
.wk-avatar-swatch.selected { border-color: var(--color-primary); }
.wk-avatar-swatch svg { width: 100%; height: 100%; display: block; pointer-events: none; }
`
