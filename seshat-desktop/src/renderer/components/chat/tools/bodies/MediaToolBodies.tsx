import { usePreviewStore } from '@renderer/stores/preview'
import type { ToolUseBlock } from '../../lib/chatTypes'

type ImageResult = {
  provider?: string
  model?: string
  image_base64?: string
  image_url?: string
  mime_type?: string
  revised_prompt?: string
}

type AudioResult = {
  provider?: string
  model?: string
  audio_base64?: string
  audio_url?: string
  content_type?: string
  characters_used?: number
}

type TranscriptResult = {
  text?: string
  language?: string
  duration?: number
}

export function ImageToolBody({ tool }: { tool: ToolUseBlock }) {
  const open = usePreviewStore((state) => state.open)
  const result = parseObject<ImageResult>(tool._result?.content)
  const prompt = text(tool.input.prompt)
  const source = result?.image_base64
    ? `data:${result.mime_type || 'image/png'};base64,${result.image_base64}`
    : result?.image_url || ''

  return (
    <div className="grid gap-3">
      {prompt && <Detail label="Prompt">{prompt}</Detail>}
      {result?.revised_prompt && result.revised_prompt !== prompt && <Detail label="Revised prompt">{result.revised_prompt}</Detail>}
      {source && (
        <button
          type="button"
          onClick={() => open({ kind: 'image', title: imageTitle(prompt), url: source })}
          className="group relative max-w-[620px] overflow-hidden rounded-lg border border-[var(--border-soft)] bg-[var(--surface-muted)] text-left"
          title="Open image preview"
        >
          <img src={source} alt={result?.revised_prompt || prompt || 'Generated image'} className="block max-h-[430px] w-full object-contain transition-transform duration-200 group-hover:scale-[1.01]" loading="lazy" />
          <span className="absolute bottom-2 right-2 flex size-8 items-center justify-center rounded-md border border-white/15 bg-black/60 text-white opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100"><ExpandIcon /></span>
        </button>
      )}
      <Metadata values={[result?.provider, result?.model]} />
      <ToolError tool={tool} />
    </div>
  )
}

export function AudioToolBody({ tool }: { tool: ToolUseBlock }) {
  const result = parseObject<AudioResult>(tool._result?.content)
  const inputText = text(tool.input.text)
  const voice = text(tool.input.voice)
  const source = result?.audio_base64
    ? `data:${result.content_type || 'audio/mpeg'};base64,${result.audio_base64}`
    : result?.audio_url || ''

  return (
    <div className="grid gap-3">
      {inputText && <Detail label="Text">{inputText.length > 260 ? `${inputText.slice(0, 260)}...` : inputText}</Detail>}
      {source && <div className="rounded-lg border border-[var(--border-soft)] bg-[var(--surface-muted)] p-3"><audio controls src={source} className="h-9 w-full" /></div>}
      <Metadata values={[result?.provider, result?.model, voice ? `Voice: ${voice}` : '', result?.characters_used != null ? `${result.characters_used.toLocaleString()} characters` : '']} />
      <ToolError tool={tool} />
    </div>
  )
}

export function TranscriptionToolBody({ tool }: { tool: ToolUseBlock }) {
  const raw = tool._result?.content || ''
  const result = parseObject<TranscriptResult>(raw) ?? { text: raw }
  return (
    <div className="grid gap-3">
      {result.text && <Detail label="Transcript"><span className="whitespace-pre-wrap text-[var(--text-primary)]">{result.text}</span></Detail>}
      <Metadata values={[result.language, result.duration != null ? formatDuration(result.duration) : '']} />
      <ToolError tool={tool} />
    </div>
  )
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><div className="mb-1 text-[10.5px] font-semibold uppercase text-[var(--text-muted)]">{label}</div><div className="text-[12px] leading-5 text-[var(--text-secondary)]">{children}</div></div>
}

function Metadata({ values }: { values: Array<string | undefined> }) {
  const items = values.filter((value): value is string => Boolean(value))
  if (items.length === 0) return null
  return <div className="flex flex-wrap gap-1.5">{items.map((value) => <span key={value} className="rounded-md border border-[var(--border-soft)] bg-[var(--surface-muted)] px-2 py-1 text-[10.5px] font-medium text-[var(--text-muted)]">{value}</span>)}</div>
}

function ToolError({ tool }: { tool: ToolUseBlock }) {
  if (!(tool._result?.is_error || tool._result?.isError) || !tool._result.content) return null
  return <div className="rounded-md border border-[var(--accent-danger)]/35 bg-[var(--accent-danger)]/5 px-3 py-2 text-[12px] text-[var(--accent-danger)]">{tool._result.content}</div>
}

function parseObject<T>(value?: string): T | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' ? parsed as T : null
  } catch {
    return null
  }
}

function text(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function imageTitle(prompt: string) {
  return `${(prompt || 'generated-image').slice(0, 60)}.png`
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  const rest = Math.round(seconds % 60)
  return minutes > 0 ? `${minutes}m ${rest}s` : `${rest}s`
}

function ExpandIcon() {
  return <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><path d="M3 7V3h4M11 3h4v4M15 11v4h-4M7 15H3v-4" /></svg>
}
