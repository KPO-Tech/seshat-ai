import { Section } from '../common'
import { DiffView, resolveDiffRows } from '../DiffView'
import type { ToolViewProps } from '../types'

export function EditToolView({ tool, result }: ToolViewProps) {
  const filePath = (tool.input.file_path as string) ?? ''
  const diff = resolveDiffRows(tool)

  return (
    <>
      {diff && diff.rows.length > 0 && (
        <DiffView filePath={filePath} rows={diff.rows} addCount={diff.addCount} delCount={diff.delCount} />
      )}

      {result?.isError && result.content && (
        <Section label="Error">
          <pre className="tb-pre tb-pre--error">{result.content}</pre>
        </Section>
      )}
    </>
  )
}
