import { HeaderCard, Section } from '../common'
import type { ToolViewProps } from '../types'

export function GlobToolView({ tool, result }: ToolViewProps) {
  const pattern = (tool.input.pattern as string) ?? ''
  const path = (tool.input.path as string) ?? ''
  // Only treat content as a file list on success - on error, result.content
  // is the error message text (e.g. "ripgrep not found\nOr run: ..."),
  // which used to get split into lines and shown as fake "2 matches"
  // alongside the real Error section right below it.
  const files = result?.content && !result.isError
    ? result.content.split('\n').map((f) => f.trim()).filter(Boolean)
    : []

  if (result?.isError && result.content) {
    return (
      <Section label="Error">
        <pre className="tb-pre tb-pre--error">{result.content}</pre>
      </Section>
    )
  }

  return (
    <HeaderCard
      header={
        <>
          <span>{pattern}</span>
          {path && <span className="tb-hcard-header-path">{path}</span>}
          <span className="tb-hcard-header-stat">
            {files.length} match{files.length !== 1 ? 'es' : ''}
          </span>
        </>
      }
    >
      {files.length > 0 ? (
        <div className="tb-file-list">
          {files.map((file, i) => (
            <div key={i} className="tb-file-item">{file}</div>
          ))}
        </div>
      ) : (
        <span className="tb-filepath">No matches found.</span>
      )}
    </HeaderCard>
  )
}
