import { Section } from '../common'
import type { ToolViewProps } from '../types'

const CSS = `
.tb-stt-transcript {
  font-size: 14px;
  line-height: 1.65;
  color: var(--color-text);
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--color-border-subtle);
  border-radius: 8px;
  white-space: pre-wrap;
}

.tb-stt-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 11px;
  color: var(--color-text-muted);
  flex-wrap: wrap;
}

.tb-stt-chip {
  padding: 2px 7px;
  border-radius: 4px;
  background: rgba(255,255,255,0.05);
  border: 1px solid var(--color-border-subtle);
  font-family: monospace;
}
`

type SttResult = {
  text?: string
  language?: string
  duration?: number
}

function parseSttResult(content: string): SttResult | null {
  try {
    return JSON.parse(content) as SttResult
  } catch {
    return { text: content }
  }
}

function formatDuration(s: number): string {
  const m = Math.floor(s / 60)
  const sec = Math.round(s % 60)
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`
}

export function SttToolView({ result }: ToolViewProps) {
  if (result?.isError && result.content) {
    return (
      <Section label="Error">
        <pre className="tb-pre tb-pre--error">{result.content}</pre>
      </Section>
    )
  }

  if (!result?.content) return null

  const parsed = parseSttResult(result.content)
  const transcript = parsed?.text ?? result.content

  return (
    <>
      <style>{CSS}</style>

      <Section label="Transcript">
        <div className="tb-stt-transcript">{transcript}</div>
      </Section>

      {(parsed?.language || parsed?.duration != null) && (
        <div className="tb-stt-meta" style={{ marginTop: 6 }}>
          {parsed.language && <span className="tb-stt-chip">{parsed.language}</span>}
          {parsed.duration != null && (
            <span>{formatDuration(parsed.duration)}</span>
          )}
        </div>
      )}
    </>
  )
}
