import type { ReactNode } from 'react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import type { ToolUseBlock } from '../../lib/chatTypes'
import { CodePanel } from '../ToolDetails'

// Read/Grep/Glob/List Directory are the highest-traffic tools in any coding
// session and previously had no dedicated body at all - they fell through to
// GenericBody's raw JSON dump. Ported field-by-field from seshat-ui's
// ReadToolView/GrepToolView/GlobToolView/ListDirectoryToolView.

const EXT_LANGUAGE: Record<string, string> = {
  go: 'go', ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx', mjs: 'javascript',
  py: 'python', rb: 'ruby', rs: 'rust', java: 'java', kt: 'kotlin', swift: 'swift',
  c: 'c', h: 'c', cpp: 'cpp', cc: 'cpp', hpp: 'cpp', cs: 'csharp', php: 'php',
  sql: 'sql', yaml: 'yaml', yml: 'yaml', json: 'json', md: 'markdown',
  sh: 'bash', bash: 'bash', zsh: 'bash', html: 'markup', xml: 'markup',
  css: 'css', scss: 'scss', less: 'less', toml: 'toml', dockerfile: 'docker',
  graphql: 'graphql', proto: 'protobuf'
}

function basename(path: string): string {
  return path.split(/[/\\]/).filter(Boolean).pop() ?? path
}

export function languageForPath(filePath: string): string | undefined {
  const base = basename(filePath)
  if (base.toLowerCase() === 'dockerfile') return 'docker'
  const ext = base.includes('.') ? base.split('.').pop()!.toLowerCase() : ''
  return EXT_LANGUAGE[ext]
}

export function rangeLabel(offset?: number, limit?: number): string {
  if (offset != null && limit != null) return `lines ${offset + 1}–${offset + limit}`
  if (offset != null) return `from line ${offset + 1}`
  if (limit != null) return `first ${limit} lines`
  return ''
}

function isError(tool: ToolUseBlock) {
  return Boolean(tool._result?.is_error || tool._result?.isError)
}

function HeaderRow({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-t-md border border-b-0 border-[var(--border-soft)] bg-[var(--surface-muted)] px-3 py-1.5 text-[11px] font-semibold text-[var(--text-secondary)]">
      {children}
    </div>
  )
}

function HeaderStat({ children }: { children: ReactNode }) {
  return <span className="ml-auto shrink-0 text-[10.5px] font-normal text-[var(--text-muted)]">{children}</span>
}

function HeaderPath({ children }: { children: ReactNode }) {
  return <span className="truncate text-[10.5px] font-normal text-[var(--text-muted)]">{children}</span>
}

function FileList({ items }: { items: string[] }) {
  return (
    <div className="no-scrollbar max-h-[240px] overflow-auto rounded-b-md border border-t-0 border-[var(--border-soft)]">
      {items.map((item, index) => (
        <div key={index} className="truncate border-b border-[var(--border-soft)] px-3 py-1.5 font-mono text-[11px] text-[var(--text-secondary)] last:border-b-0">
          {item}
        </div>
      ))}
    </div>
  )
}

function EmptyNotice({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-b-md border border-t-0 border-[var(--border-soft)] px-3 py-2 text-[11px] text-[var(--text-muted)]">
      {children}
    </div>
  )
}

export function ReadBody({ tool }: { tool: ToolUseBlock }) {
  if (isError(tool)) return <CodePanel title="Error" value={tool._result?.content ?? ''} />
  const content = tool._result?.content
  if (!content) return null

  const filePath = typeof tool.input.file_path === 'string' ? tool.input.file_path : ''
  const offset = typeof tool.input.offset === 'number' ? tool.input.offset : undefined
  const limit = typeof tool.input.limit === 'number' ? tool.input.limit : undefined
  const range = rangeLabel(offset, limit)

  return (
    <div>
      <HeaderRow>
        <span className="truncate text-[var(--text-primary)]" title={filePath}>{basename(filePath) || 'File'}</span>
        {range && <HeaderStat>{range}</HeaderStat>}
      </HeaderRow>
      <div className="no-scrollbar max-h-[320px] overflow-auto rounded-b-md border border-t-0 border-[var(--border-soft)] bg-[#1e1e1e]">
        <SyntaxHighlighter
          style={vscDarkPlus}
          language={languageForPath(filePath)}
          showLineNumbers
          startingLineNumber={offset != null ? offset + 1 : 1}
          customStyle={{ margin: 0, padding: '10px 12px', fontSize: '11.5px', lineHeight: 1.6, background: 'transparent' }}
        >
          {content}
        </SyntaxHighlighter>
      </div>
    </div>
  )
}

export function GrepBody({ tool }: { tool: ToolUseBlock }) {
  if (isError(tool)) return <CodePanel title="Error" value={tool._result?.content ?? ''} />
  const content = tool._result?.content
  if (!content) return null

  const pattern = typeof tool.input.pattern === 'string' ? tool.input.pattern : ''
  const path = typeof tool.input.path === 'string' ? tool.input.path : ''
  const include = typeof tool.input.include === 'string' ? tool.input.include : ''

  return (
    <div>
      <HeaderRow>
        <span className="truncate text-[var(--text-primary)]">{pattern}</span>
        {include && <HeaderPath>{include}</HeaderPath>}
        {path && <HeaderPath>{path}</HeaderPath>}
      </HeaderRow>
      <pre className="no-scrollbar max-h-[240px] overflow-auto rounded-b-md border border-t-0 border-[var(--border-soft)] bg-[var(--surface-muted)] p-3 text-[11px] leading-5 text-[var(--text-secondary)]">
        {content}
      </pre>
    </div>
  )
}

export function GlobBody({ tool }: { tool: ToolUseBlock }) {
  if (isError(tool)) return <CodePanel title="Error" value={tool._result?.content ?? ''} />
  const content = tool._result?.content
  const pattern = typeof tool.input.pattern === 'string' ? tool.input.pattern : ''
  const path = typeof tool.input.path === 'string' ? tool.input.path : ''
  const files = content ? content.split('\n').map((line) => line.trim()).filter(Boolean) : []

  return (
    <div>
      <HeaderRow>
        <span className="truncate text-[var(--text-primary)]">{pattern}</span>
        {path && <HeaderPath>{path}</HeaderPath>}
        <HeaderStat>{files.length} match{files.length === 1 ? '' : 'es'}</HeaderStat>
      </HeaderRow>
      {files.length > 0 ? <FileList items={files} /> : <EmptyNotice>No matches found.</EmptyNotice>}
    </div>
  )
}

type DirEntry = { name: string; is_directory: boolean; is_symlink: boolean; size_bytes: number }
type ListDirectoryOutput = { path?: string; entries?: DirEntry[]; count?: number; truncated?: boolean }

export function parseListDirectory(content: string): ListDirectoryOutput | null {
  try {
    const data = JSON.parse(content) as ListDirectoryOutput
    return Array.isArray(data.entries) ? data : null
  } catch {
    return null
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function ListDirectoryBody({ tool }: { tool: ToolUseBlock }) {
  if (isError(tool)) return <CodePanel title="Error" value={tool._result?.content ?? ''} />
  const content = tool._result?.content
  const parsed = content ? parseListDirectory(content) : null
  if (!parsed?.entries) return content ? <CodePanel title="Result" value={content} /> : null

  const path = typeof tool.input.path === 'string' ? tool.input.path : (parsed.path ?? '')
  const count = parsed.count ?? parsed.entries.length

  return (
    <div>
      <HeaderRow>
        {path && <HeaderPath>{path}</HeaderPath>}
        <HeaderStat>{count} item{count === 1 ? '' : 's'}{parsed.truncated ? ' (truncated)' : ''}</HeaderStat>
      </HeaderRow>
      {parsed.entries.length > 0 ? (
        <FileList items={parsed.entries.map((entry) =>
          entry.is_directory ? `${entry.name}/` : `${entry.name}  —  ${formatBytes(entry.size_bytes)}`
        )} />
      ) : (
        <EmptyNotice>Empty directory.</EmptyNotice>
      )}
    </div>
  )
}
