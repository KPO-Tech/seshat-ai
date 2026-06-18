import { Section, CodeBox } from '../common'
import type { ToolViewProps } from '../types'

export function WebFetchToolView({ tool, result }: ToolViewProps) {
  const url = (tool.input.url as string) ?? ''
  const prompt = (tool.input.prompt as string) ?? ''

  return (
    <>
      {url && (
        <div className="tb-edit-path-row">
          <span className="tb-fetch-url">{url}</span>
        </div>
      )}

      {prompt && (
        <Section label="Prompt">
          <span className="tb-note">{prompt}</span>
        </Section>
      )}

      {result?.content && !result.isError && (
        <Section label="Response">
          <CodeBox content={result.content} copyable />
        </Section>
      )}

      {result?.isError && result.content && (
        <Section label="Error">
          <pre className="tb-pre tb-pre--error">{result.content}</pre>
        </Section>
      )}
    </>
  )
}
