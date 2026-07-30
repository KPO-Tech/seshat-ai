import { HeaderCard, ProseBox, CodeBox, Section } from '../common'
import type { ToolViewProps } from '../types'

export function WebFetchToolView({ tool, result }: ToolViewProps) {
  const url = (tool.input.url as string) ?? ''
  const prompt = (tool.input.prompt as string) ?? ''
  let hostname = url
  try {
    if (url) hostname = new URL(url).hostname
  } catch {
    // not a valid absolute URL - fall back to showing it verbatim
  }

  if (result?.isError) {
    return (
      <HeaderCard header={<span title={url}>{hostname || 'Web Fetch'}</span>}>
        {result.content && <CodeBox content={result.content} variant="error" bare />}
      </HeaderCard>
    )
  }

  return (
    <HeaderCard
      header={
        <>
          <span title={url}>{hostname || 'Web Fetch'}</span>
          {url && url !== hostname && <span className="tb-hcard-header-path">{url}</span>}
        </>
      }
    >
      {prompt && (
        <Section label="Prompt">
          <span className="tb-note">{prompt}</span>
        </Section>
      )}
      {result?.content && <ProseBox content={result.content} copyable bare />}
    </HeaderCard>
  )
}
