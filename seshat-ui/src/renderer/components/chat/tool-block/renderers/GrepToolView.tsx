import { CodeBox, HeaderCard, Section } from '../common'
import type { ToolViewProps } from '../types'

export function GrepToolView({ tool, result }: ToolViewProps) {
  const pattern = (tool.input.pattern as string) ?? ''
  const path = (tool.input.path as string) ?? ''
  const include = (tool.input.include as string) ?? ''

  if (result?.isError && result.content) {
    return (
      <Section label="Error">
        <pre className="tb-pre tb-pre--error">{result.content}</pre>
      </Section>
    )
  }

  if (!result?.content) return null

  return (
    <HeaderCard
      header={
        <>
          <span>{pattern}</span>
          {include && <span className="tb-hcard-header-path">{include}</span>}
          {path && <span className="tb-hcard-header-path">{path}</span>}
        </>
      }
    >
      <CodeBox content={result.content} copyable bare />
    </HeaderCard>
  )
}
