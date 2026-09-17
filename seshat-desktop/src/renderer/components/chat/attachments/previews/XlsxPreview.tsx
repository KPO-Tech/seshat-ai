import { useEffect, useState } from 'react'
import type { Cell } from 'exceljs'
import { DocumentPreviewState } from './PreviewState'

type Sheet = { name: string; rows: string[][]; truncated: boolean }
const MAX_ROWS = 1000

export function XlsxPreview({ url, filename }: { url: string; filename: string }) {
  const [sheets, setSheets] = useState<Sheet[]>([])
  const [activeSheet, setActiveSheet] = useState(0)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    void Promise.all([import('exceljs'), fetch(url).then((response) => response.arrayBuffer())]).then(async ([module, buffer]) => {
      const ExcelJS = module.default
      const workbook = new ExcelJS.Workbook()
      await workbook.xlsx.load(buffer)
      if (!active) return
      setSheets(workbook.worksheets.map((worksheet) => {
        const rows: string[][] = []
        const columns = Math.max(worksheet.actualColumnCount, worksheet.columnCount, 1)
        worksheet.eachRow({ includeEmpty: true }, (row) => {
          if (rows.length >= MAX_ROWS) return
          rows.push(Array.from({ length: columns }, (_, index) => cellText(row.getCell(index + 1))))
        })
        return { name: worksheet.name || 'Sheet', rows, truncated: worksheet.actualRowCount > MAX_ROWS }
      }))
      setStatus('ready')
    }).catch((reason) => {
      if (!active) return
      setError(reason instanceof Error ? reason.message : 'Spreadsheet preview failed.')
      setStatus('error')
    })
    return () => { active = false }
  }, [url])

  const sheet = sheets[activeSheet]
  return (
    <div className="relative flex size-full min-h-0 flex-col">
      {sheets.length > 1 && <div className="no-scrollbar flex shrink-0 gap-1 overflow-x-auto border-b border-[var(--border-soft)] p-2">{sheets.map((item, index) => <button key={`${item.name}-${index}`} type="button" onClick={() => setActiveSheet(index)} className={`h-7 shrink-0 rounded-md border px-2.5 text-[11px] font-medium ${index === activeSheet ? 'border-[var(--accent-primary)]/50 bg-[var(--accent-primary)]/10 text-[var(--text-primary)]' : 'border-[var(--border-soft)] text-[var(--text-muted)] hover:bg-[var(--surface-muted)]'}`}>{item.name}</button>)}</div>}
      <div className="min-h-0 flex-1 overflow-auto bg-white">
        {sheet?.rows.length ? <table className="border-collapse whitespace-nowrap text-[12px] text-[#1c1a17]"><tbody>{sheet.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex} className="border border-[#dedede] px-2 py-1">{cell}</td>)}</tr>)}</tbody></table> : status === 'ready' ? <div className="p-4 text-[12px] text-[#666]">This sheet is empty.</div> : null}
        {sheet?.truncated && <div className="sticky bottom-0 border-t border-[#dedede] bg-white px-3 py-2 text-[11px] text-[#666]">Showing the first {MAX_ROWS} rows.</div>}
      </div>
      {status === 'loading' && <DocumentPreviewState label={`Loading ${filename}`} />}
      {status === 'error' && <DocumentPreviewState label={error} error />}
    </div>
  )
}

function cellText(cell: Cell) {
  const value = cell.value
  if (value == null) return ''
  if (value instanceof Date) return value.toLocaleDateString()
  if (typeof value !== 'object') return String(value)
  if ('richText' in value) return value.richText.map((item) => item.text).join('')
  if ('result' in value) return String(value.result ?? '')
  if ('text' in value) return String(value.text ?? '')
  if ('error' in value) return String(value.error)
  return ''
}
