import { Section, CodeBox } from '../common'
import { languageForPath, basename } from '../helpers'
import type { ToolViewProps } from '../types'

function rangeLabel(offset?: number, limit?: number): string {
  if (offset != null && limit != null) return `lines ${offset + 1}–${offset + limit}`
  if (offset != null) return `from line ${offset + 1}`
  if (limit != null) return `first ${limit} lines`
  return ''
}

export function ReadToolView({ tool, result }: ToolViewProps) {
  const filePath = (tool.input.file_path as string) ?? ''
  const offset = tool.input.offset as number | undefined
  const limit = tool.input.limit as number | undefined
  const range = rangeLabel(offset, limit)

  return (
    <>
      {filePath && (
        <div className="tb-edit-path-row">
          <span className="tb-filepath" title={filePath}>{basename(filePath)}</span>
          {range && <span className="tb-range-label">{range}</span>}
        </div>
      )}

      {result?.content && !result.isError && (
        <Section label="Content">
          <CodeBox content={result.content} copyable language={languageForPath(filePath)} />
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
