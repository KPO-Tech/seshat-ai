import { Section } from '../common'
import type { ToolViewProps } from '../types'

export function GlobToolView({ tool, result }: ToolViewProps) {
  const pattern = (tool.input.pattern as string) ?? ''
  const path = (tool.input.path as string) ?? ''
  const files = result?.content
    ? result.content.split('\n').map((f) => f.trim()).filter(Boolean)
    : []

  return (
    <>
      <div className="tb-edit-path-row">
        <span className="tb-grep-pattern">{pattern}</span>
        {path && <span className="tb-filepath-full">{path}</span>}
      </div>

      {files.length > 0 && (
        <Section label={`${files.length} match${files.length !== 1 ? 'es' : ''}`}>
          <div className="tb-file-list">
            {files.map((file, i) => (
              <div key={i} className="tb-file-item">{file}</div>
            ))}
          </div>
        </Section>
      )}

      {result?.content && files.length === 0 && !result.isError && (
        <Section label="Result">
          <span className="tb-filepath">No matches found.</span>
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
