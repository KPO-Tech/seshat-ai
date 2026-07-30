import { HeaderCard, Section } from '../common'
import type { ToolViewProps } from '../types'

type DirEntry = { name: string; is_directory: boolean; is_symlink: boolean; size_bytes: number }
type ListDirectoryOutput = { path?: string; entries?: DirEntry[]; count?: number; truncated?: boolean }

function parse(content: string): ListDirectoryOutput | null {
  try {
    const data = JSON.parse(content) as ListDirectoryOutput
    return Array.isArray(data.entries) ? data : null
  } catch {
    return null
  }
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// list_directory's content is the raw JSON its Go tool returns - parsed into
// the same file-list look GlobToolView already uses, instead of a wall of
// unformatted JSON. Path + entry count live in one header strip attached to
// the list itself, instead of a bare unstyled path line floating above a
// separately-boxed list.
export function ListDirectoryToolView({ tool, result }: ToolViewProps) {
  const path = (tool.input.path as string) ?? ''
  const parsed = result?.content ? parse(result.content) : null

  if (result?.isError && result.content) {
    return (
      <Section label="Error">
        <pre className="tb-pre tb-pre--error">{result.content}</pre>
      </Section>
    )
  }

  if (!parsed || !parsed.entries) return null

  const count = parsed.count ?? parsed.entries.length

  return (
    <HeaderCard
      header={
        <>
          {path && <span className="tb-hcard-header-path">{path}</span>}
          <span className="tb-hcard-header-stat">
            {count} item{count !== 1 ? 's' : ''}{parsed.truncated ? ' (truncated)' : ''}
          </span>
        </>
      }
    >
      {parsed.entries.length > 0 ? (
        <div className="tb-file-list">
          {parsed.entries.map((entry, i) => (
            <div key={i} className="tb-file-item">
              {entry.is_directory ? `${entry.name}/` : entry.name}
              {!entry.is_directory && <span className="tb-file-item-size"> — {fmtSize(entry.size_bytes)}</span>}
            </div>
          ))}
        </div>
      ) : (
        <span className="tb-filepath">Empty directory.</span>
      )}
    </HeaderCard>
  )
}
