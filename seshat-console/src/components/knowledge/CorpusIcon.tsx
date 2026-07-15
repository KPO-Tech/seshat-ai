import { palette } from '@/theme/tokens'

// A rotating set of accent colors from the existing warm palette (not
// invented hues) so corpora read as visually distinct at a glance, Google
// Drive/Canva-style, without adding a "color" field to the backend model -
// purely a deterministic-per-id display choice.
const FOLDER_COLORS = [
  palette.accent,
  palette.info,
  palette.success,
  palette.warning,
  palette.danger,
  palette.accentSecondary,
]

function colorForId(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  }
  return FOLDER_COLORS[hash % FOLDER_COLORS.length]
}

export function CorpusIcon({ id, emoji = '📁', size = 56 }: { id: string; emoji?: string; size?: number }) {
  const color = colorForId(id)
  const height = size * 0.8

  return (
    <div style={{ position: 'relative', width: size, height, flexShrink: 0 }}>
      <svg viewBox="0 0 64 52" width={size} height={height} style={{ display: 'block' }}>
        <rect x="4" y="8" width="28" height="12" rx="3" fill={color} opacity="0.6" />
        <rect x="4" y="14" width="56" height="34" rx="6" fill={color} />
      </svg>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          paddingTop: height * 0.14,
          fontSize: size * 0.34,
          lineHeight: 1,
        }}
      >
        {emoji}
      </div>
    </div>
  )
}
