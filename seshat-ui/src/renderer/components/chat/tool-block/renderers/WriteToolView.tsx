import { Section, CodeBox } from '../common'
import type { ToolViewProps } from '../types'

function basename(fp: string) {
  return fp.split('/').filter(Boolean).pop() ?? fp
}

export function WriteToolView({ tool, result }: ToolViewProps) {
  const filePath = (tool.input.file_path as string) ?? ''
  const content = (tool.input.content as string) ?? ''
  const lineCount = content ? content.split('\n').length : 0

  return (
    <>
      {filePath && (
        <div className="tb-edit-path-row">
          <span className="tb-filepath" title={filePath}>{basename(filePath)}</span>
          <span className="tb-filepath-full">{filePath}</span>
        </div>
      )}

      {content && (
        <Section label={`Content — ${lineCount} line${lineCount !== 1 ? 's' : ''}`}>
          <CodeBox content={content} copyable />
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
