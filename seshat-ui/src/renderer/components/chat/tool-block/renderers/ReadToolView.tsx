import { CodeBox, ErrorPre, HCARD_HEADER_STAT_CSS, HeaderCard, Section } from '../common'
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

  if (result?.isError && result.content) {
    return (
      <Section label="Error">
        <ErrorPre content={result.content} />
      </Section>
    )
  }

  if (!result?.content) return null

  return (
    <HeaderCard
      header={
        <>
          <span title={filePath}>{basename(filePath)}</span>
          {range && <span className={HCARD_HEADER_STAT_CSS}>{range}</span>}
        </>
      }
    >
      <CodeBox
        content={result.content}
        copyable
        language={languageForPath(filePath)}
        lineNumbers
        startingLineNumber={offset != null ? offset + 1 : 1}
        bare
      />
    </HeaderCard>
  )
}
