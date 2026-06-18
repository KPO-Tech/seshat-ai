import { Section } from '../common'
import type { ToolViewProps } from '../types'

const CSS = `
.tb-img-wrap {
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid var(--color-border-subtle);
  background: rgba(0,0,0,0.12);
  display: flex;
  align-items: center;
  justify-content: center;
  max-height: 480px;
}

.tb-img-wrap img {
  width: 100%;
  height: auto;
  max-height: 480px;
  object-fit: contain;
  display: block;
}

.tb-img-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 11px;
  color: var(--color-text-muted);
}

.tb-img-meta-chip {
  padding: 2px 7px;
  border-radius: 4px;
  background: rgba(255,255,255,0.05);
  border: 1px solid var(--color-border-subtle);
  font-family: monospace;
}

.tb-img-revised {
  font-size: 12px;
  color: var(--color-text-muted);
  font-style: italic;
  line-height: 1.5;
}
`

type ImageResult = {
  provider?: string
  model?: string
  image_base64?: string
  image_url?: string
  mime_type?: string
  revised_prompt?: string
}

function parseImageResult(content: string): ImageResult | null {
  try {
    return JSON.parse(content) as ImageResult
  } catch {
    return null
  }
}

export function ImageGenToolView({ tool, result }: ToolViewProps) {
  const prompt = typeof tool.input.prompt === 'string' ? tool.input.prompt : ''

  if (!result || result.isError) {
    return (
      <>
        {prompt && <Section label="Prompt"><span className="tb-note">{prompt}</span></Section>}
        {result?.isError && result.content && (
          <Section label="Error"><pre className="tb-pre tb-pre--error">{result.content}</pre></Section>
        )}
      </>
    )
  }

  const parsed = parseImageResult(result.content)

  const src = parsed?.image_base64
    ? `data:${parsed.mime_type ?? 'image/png'};base64,${parsed.image_base64}`
    : parsed?.image_url ?? null

  const originalPrompt = prompt
  const revisedPrompt = parsed?.revised_prompt
  const promptChanged = revisedPrompt && revisedPrompt !== originalPrompt

  return (
    <>
      <style>{CSS}</style>

      {prompt && (
        <Section label="Prompt">
          <span className="tb-note">{prompt}</span>
        </Section>
      )}

      {promptChanged && (
        <Section label="Revised prompt">
          <span className="tb-img-revised">{revisedPrompt}</span>
        </Section>
      )}

      {src && (
        <Section label="Result">
          <div className="tb-img-wrap">
            <img src={src} alt={revisedPrompt ?? prompt} loading="lazy" />
          </div>
        </Section>
      )}

      {parsed && (parsed.provider || parsed.model) && (
        <div className="tb-img-meta" style={{ marginTop: 6 }}>
          {parsed.provider && <span className="tb-img-meta-chip">{parsed.provider}</span>}
          {parsed.model && <span className="tb-img-meta-chip">{parsed.model}</span>}
        </div>
      )}
    </>
  )
}
