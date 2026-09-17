import { useEffect, useMemo, useState } from 'react'
import Papa, { type ParseError } from 'papaparse'
import { DocumentPreviewState } from './PreviewState'

const MAX_ROWS = 1000
const delimiterOptions = [
  { value: '', label: 'Auto detect' },
  { value: ',', label: 'Comma (,)' },
  { value: ';', label: 'Semicolon (;)' },
  { value: '\t', label: 'Tab' },
  { value: '|', label: 'Pipe (|)' },
  { value: ':', label: 'Colon (:)' }
]

export function CsvPreview({ url, filename }: { url: string; filename: string }) {
  const [source, setSource] = useState('')
  const [delimiter, setDelimiter] = useState('')
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    void fetch(url).then((response) => response.text()).then((text) => {
      if (!active) return
      setSource(text.replace(/^\uFEFF/, ''))
      setStatus('ready')
    }).catch((reason) => {
      if (!active) return
      setError(reason instanceof Error ? reason.message : 'CSV preview failed.')
      setStatus('error')
    })
    return () => { active = false }
  }, [url])

  const parsed = useMemo(() => {
    if (!source) return { rows: [] as string[][], detectedDelimiter: '', errors: [] as ParseError[], truncated: false }
    const result = Papa.parse<string[]>(source, {
      delimiter,
      delimitersToGuess: [',', ';', '\t', '|', ':'],
      skipEmptyLines: 'greedy',
      preview: MAX_ROWS + 1
    })
    const rows = result.data.map((row) => row.map((cell) => String(cell ?? '')))
    return {
      rows: rows.slice(0, MAX_ROWS),
      detectedDelimiter: result.meta.delimiter,
      errors: result.errors,
      truncated: rows.length > MAX_ROWS
    }
  }, [delimiter, source])

  const columnCount = parsed.rows.reduce((count, row) => Math.max(count, row.length), 0)
  const parserWarning = parsed.errors.find((item) => item.code === 'UndetectableDelimiter')

  return (
    <div className="relative flex size-full min-h-0 flex-col">
      <div className="flex h-11 shrink-0 items-center gap-3 border-b border-[var(--border-soft)] bg-[var(--surface-root)] px-3">
        <label className="text-[11px] font-medium text-[var(--text-muted)]" htmlFor="csv-delimiter">Separator</label>
        <select id="csv-delimiter" value={delimiter} onChange={(event) => setDelimiter(event.target.value)} className="h-7 rounded-md border border-[var(--border-soft)] bg-[var(--surface-panel)] px-2 text-[11px] text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]/60">
          {delimiterOptions.map((option) => <option key={option.label} value={option.value}>{option.label}</option>)}
        </select>
        <span className="text-[10.5px] text-[var(--text-muted)]">Detected: {delimiterName(parsed.detectedDelimiter)}</span>
        <span className="ml-auto text-[10.5px] text-[var(--text-muted)]">{parsed.rows.length.toLocaleString()} rows | {columnCount.toLocaleString()} columns</span>
      </div>
      {parserWarning && delimiter === '' && <div className="shrink-0 border-b border-[var(--accent-warning)]/25 bg-[var(--accent-warning)]/5 px-3 py-2 text-[11px] text-[var(--text-secondary)]">The separator is ambiguous. Choose it manually for a more accurate preview.</div>}
      <div className="min-h-0 flex-1 overflow-auto bg-white">
        {parsed.rows.length > 0 ? (
          <table className="border-collapse whitespace-nowrap text-[12px] text-[#1c1a17]">
            <tbody>
              {parsed.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {Array.from({ length: columnCount }, (_, columnIndex) => (
                    <td key={columnIndex} className={`${rowIndex === 0 ? 'sticky top-0 z-10 bg-[#f2f2f2] font-semibold' : 'bg-white'} max-w-[420px] overflow-hidden text-ellipsis border border-[#dedede] px-2 py-1`}>{row[columnIndex] ?? ''}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : status === 'ready' ? <div className="p-4 text-[12px] text-[#666]">This file contains no rows.</div> : null}
        {parsed.truncated && <div className="sticky bottom-0 border-t border-[#dedede] bg-white px-3 py-2 text-[11px] text-[#666]">Showing the first {MAX_ROWS.toLocaleString()} rows.</div>}
      </div>
      {status === 'loading' && <DocumentPreviewState label={`Loading ${filename}`} />}
      {status === 'error' && <DocumentPreviewState label={error} error />}
    </div>
  )
}

function delimiterName(value: string) {
  if (value === ',') return 'comma'
  if (value === ';') return 'semicolon'
  if (value === '\t') return 'tab'
  if (value === '|') return 'pipe'
  if (value === ':') return 'colon'
  return value || 'unknown'
}
