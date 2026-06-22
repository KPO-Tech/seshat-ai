import { Copy } from '@icon-park/react'
import { Section } from '../common'
import type { ToolViewProps } from '../types'

type DiffLine = { type: 'del' | 'add'; text: string }

function makeDiff(oldStr: string, newStr: string): DiffLine[] {
  const lines: DiffLine[] = []
  for (const line of oldStr.split('\n')) lines.push({ type: 'del', text: line })
  for (const line of newStr.split('\n')) lines.push({ type: 'add', text: line })
  return lines
}

function basename(fp: string) {
  return fp.split('/').filter(Boolean).pop() ?? fp
}

export function EditToolView({ tool, result }: ToolViewProps) {
  const filePath = (tool.input.file_path as string) ?? ''
  const oldStr = (tool.input.old_string as string) ?? ''
  const newStr = (tool.input.new_string as string) ?? ''
  const diff = makeDiff(oldStr, newStr)
  const delCount = diff.filter((l) => l.type === 'del').length
  const addCount = diff.filter((l) => l.type === 'add').length

  const copyDiff = diff
    .map((l) => `${l.type === 'del' ? '-' : '+'} ${l.text}`)
    .join('\n')

  return (
    <>
      {filePath && (
        <div className="tb-edit-path-row">
          <span className="tb-filepath" title={filePath}>{basename(filePath)}</span>
          <span className="tb-filepath-full">{filePath}</span>
        </div>
      )}

      {(oldStr || newStr) && (
        <Section label={`Changes  −${delCount}  +${addCount}`}>
          <div className="tb-diff">
            <button
              className="tb-diff-copy"
              type="button"
              title="Copy diff"
              onClick={() => void navigator.clipboard.writeText(copyDiff)}
            >
              <Copy size={12} />
            </button>
            {diff.map((line, i) => (
              <div
                key={i}
                className={`tb-diff-line tb-diff-line--${line.type}`}
              >
                <span className="tb-diff-sign" aria-hidden>
                  {line.type === 'add' ? '+' : '−'}
                </span>
                <span className="tb-diff-text">{line.text || ' '}</span>
              </div>
            ))}
          </div>
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
