import { Section, CodeBox } from '../common'
import type { ToolViewProps } from '../types'

export function GrepToolView({ tool, result }: ToolViewProps) {
  const pattern = (tool.input.pattern as string) ?? ''
  const path = (tool.input.path as string) ?? ''
  const include = (tool.input.include as string) ?? ''

  return (
    <>
      <div className="tb-edit-path-row">
        <span className="tb-grep-pattern">{pattern}</span>
        {include && <span className="tb-range-label">{include}</span>}
        {path && <span className="tb-filepath-full">{path}</span>}
      </div>

      {result?.content && !result.isError && (
        <Section label="Matches">
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
