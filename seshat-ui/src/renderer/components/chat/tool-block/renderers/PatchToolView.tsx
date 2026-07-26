import { Section } from '../common'
import type { ToolViewProps } from '../types'

const VERB_CLASS: Record<string, string> = {
  Added: 'tb-patch-line--add',
  Deleted: 'tb-patch-line--del',
  Updated: 'tb-patch-line--update',
  Moved: 'tb-patch-line--move',
}

// apply_patch's result content is already a clean one-line-per-file summary
// ("Added: path", "Deleted: path", "Updated: path", "Moved: a → b") - just
// needs each line color-coded by verb instead of being dumped as one grey
// monospace blob under a raw JSON "Input" section.
export function PatchToolView({ result }: ToolViewProps) {
  if (result?.isError) {
    return result.content ? (
      <Section label="Error">
        <pre className="tb-pre tb-pre--error">{result.content}</pre>
      </Section>
    ) : null
  }
  const lines = (result?.content ?? '').split('\n').map((l) => l.trim()).filter(Boolean)
  if (lines.length === 0) return null
  return (
    <Section label="Changes">
      <div className="tb-patch-list">
        {lines.map((line, i) => {
          const verb = line.split(':')[0]?.trim() ?? ''
          const cls = VERB_CLASS[verb] ?? ''
          return <div key={i} className={`tb-patch-line ${cls}`}>{line}</div>
        })}
      </div>
    </Section>
  )
}
