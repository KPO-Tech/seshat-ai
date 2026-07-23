import { useMemo } from 'react'
import { Section } from '../common'
import type { ToolViewProps } from '../types'

const CSS = `
.tb-audio-wrap {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.tb-audio-player {
  width: 100%;
  height: 36px;
  border-radius: 6px;
  outline: none;
  accent-color: var(--color-accent);
}

.tb-audio-player::-webkit-media-controls-panel {
  background: var(--color-surface);
}

.tb-audio-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  color: var(--color-text-muted);
  flex-wrap: wrap;
}

.tb-audio-chip {
  padding: 2px 5px;
  border-radius: 3px;
  background: rgba(255,255,255,0.05);
  border: 1px solid var(--color-border-subtle);
  font-family: monospace;
}
`

type TtsResult = {
  provider?: string
  model?: string
  audio_base64?: string
  content_type?: string
  characters_used?: number
}

function parseTtsResult(content: string): TtsResult | null {
  try {
    return JSON.parse(content) as TtsResult
  } catch {
    return null
  }
}

export function TtsToolView({ tool, result }: ToolViewProps) {
  const text = typeof tool.input.text === 'string' ? tool.input.text : ''
  const voice = typeof tool.input.voice === 'string' ? tool.input.voice : ''

  const parsed = result?.content ? parseTtsResult(result.content) : null

  const audioSrc = useMemo(() => {
    if (!parsed?.audio_base64) return null
    const mime = parsed.content_type ?? 'audio/mpeg'
    return `data:${mime};base64,${parsed.audio_base64}`
  }, [parsed?.audio_base64, parsed?.content_type])

  return (
    <>
      <style>{CSS}</style>

      {text && (
        <Section label="Text">
          <span className="tb-note">{text.length > 200 ? `${text.slice(0, 200)}…` : text}</span>
        </Section>
      )}

      {result?.isError && result.content && (
        <Section label="Error">
          <pre className="tb-pre tb-pre--error">{result.content}</pre>
        </Section>
      )}

      {audioSrc && (
        <Section label="Audio">
          <div className="tb-audio-wrap">
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <audio className="tb-audio-player" controls src={audioSrc} />
            <div className="tb-audio-meta">
              {parsed?.provider && <span className="tb-audio-chip">{parsed.provider}</span>}
              {parsed?.model && <span className="tb-audio-chip">{parsed.model}</span>}
              {voice && <span className="tb-audio-chip">voice: {voice}</span>}
              {parsed?.characters_used != null && (
                <span>{parsed.characters_used.toLocaleString()} chars</span>
              )}
            </div>
          </div>
        </Section>
      )}
    </>
  )
}
