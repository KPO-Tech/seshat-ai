import { useEffect, useState } from 'react'
import ExcelJS from 'exceljs'
import { api, ApiError } from '@/api/client'

type Props = {
  fileId: string
  filename: string
}

type SheetData = { name: string; rows: string[][] }

// Caps how many rows get turned into real DOM <tr>s - a preview panel isn't
// a spreadsheet editor, and a multi-thousand-row sheet rendered as one flat
// HTML table would be a real jank/freeze risk for no benefit over showing
// the first slice with a clear "there's more" notice.
const MAX_PREVIEW_ROWS = 1000

function base64ToArrayBuffer(dataUrl: string): ArrayBuffer {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
  return bytes.buffer
}

function cellText(cell: ExcelJS.Cell): string {
  const v = cell.value
  if (v === null || v === undefined) return ''
  if (v instanceof Date) return v.toLocaleDateString()
  if (typeof v === 'object') {
    if ('richText' in v) return (v.richText as { text: string }[]).map((t) => t.text).join('')
    if ('result' in v) return String((v as { result?: unknown }).result ?? '')
    if ('text' in v) return String((v as { text?: unknown }).text ?? '')
    if ('error' in v) return String((v as { error?: unknown }).error ?? '#ERROR')
    return ''
  }
  return String(v)
}

// Renders a .xlsx workbook's real content directly in the browser (exceljs
// parses the workbook client-side) as a scrollable HTML table with a sheet
// tab strip, instead of routing through the backend's on-demand
// LibreOffice-to-PDF conversion - same rationale as DocxPreviewPanel, and
// arguably a better fit for a spreadsheet than a flattened, paginated PDF
// page in the first place (scroll instead of page-by-page).
export function XlsxPreviewPanel({ fileId, filename }: Props) {
  const [sheets, setSheets] = useState<SheetData[] | null>(null)
  const [activeSheet, setActiveSheet] = useState(0)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    setErrorMessage('')
    setSheets(null)
    setActiveSheet(0)

    async function open() {
      try {
        const dataUrl = await api.getFileDataURL(`/files/${fileId}/content`)
        if (cancelled) return
        const buffer = base64ToArrayBuffer(dataUrl)
        const workbook = new ExcelJS.Workbook()
        // exceljs's own type declares Buffer, but its doc comment confirms
        // an ArrayBuffer works at runtime - there's no Node Buffer in this
        // sandboxed Electron renderer (contextIsolation/no nodeIntegration).
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await workbook.xlsx.load(buffer as any)
        if (cancelled) return

        const parsed: SheetData[] = workbook.worksheets.map((ws) => {
          const rows: string[][] = []
          const colCount = Math.max(ws.actualColumnCount || 0, ws.columnCount || 0, 1)
          ws.eachRow({ includeEmpty: true }, (row) => {
            if (rows.length >= MAX_PREVIEW_ROWS) return
            const cells: string[] = []
            for (let c = 1; c <= colCount; c++) {
              cells.push(cellText(row.getCell(c)))
            }
            rows.push(cells)
          })
          return { name: ws.name || 'Sheet', rows }
        })
        setSheets(parsed)
        setStatus('ready')
      } catch (err) {
        if (cancelled) return
        const message = err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Failed to render spreadsheet'
        setErrorMessage(message)
        setStatus('error')
      }
    }

    void open()
    return () => {
      cancelled = true
    }
  }, [fileId])

  const current = sheets?.[activeSheet]
  const truncated = (current?.rows.length ?? 0) >= MAX_PREVIEW_ROWS

  return (
    <div className="xlsx-preview-panel">
      <style>{XLSX_PREVIEW_CSS}</style>
      {sheets && sheets.length > 1 && (
        <div className="xlsx-preview-tabs">
          {sheets.map((sheet, i) => (
            <button
              key={sheet.name + i}
              type="button"
              className={`xlsx-preview-tab${i === activeSheet ? ' active' : ''}`}
              onClick={() => setActiveSheet(i)}
            >
              {sheet.name}
            </button>
          ))}
        </div>
      )}
      <div className="xlsx-preview-scroll">
        {current && current.rows.length > 0 ? (
          <>
            <table className="xlsx-preview-table">
              <tbody>
                {current.rows.map((row, ri) => (
                  <tr key={ri}>
                    {row.map((cell, ci) => (
                      <td key={ci}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {truncated && <div className="xlsx-preview-truncated">Showing the first {MAX_PREVIEW_ROWS} rows.</div>}
          </>
        ) : current ? (
          <div className="xlsx-preview-empty">This sheet is empty.</div>
        ) : null}
      </div>
      {status === 'loading' && <div className="xlsx-preview-status">Loading {filename}…</div>}
      {status === 'error' && (
        <div className="xlsx-preview-status xlsx-preview-status--error">Couldn't load this spreadsheet: {errorMessage}</div>
      )}
    </div>
  )
}

const XLSX_PREVIEW_CSS = `
.xlsx-preview-panel {
  position: relative;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.xlsx-preview-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 6px 8px;
  border-bottom: 1px solid var(--color-border-subtle);
  flex-shrink: 0;
}

.xlsx-preview-tab {
  padding: 4px 10px;
  font-size: 11px;
  border: 1px solid var(--color-border-subtle);
  border-radius: 6px;
  background: var(--color-surface);
  color: var(--color-text-secondary);
  cursor: pointer;
}

.xlsx-preview-tab:hover {
  background: var(--color-hover);
  color: var(--color-text);
}

.xlsx-preview-tab.active {
  border-color: var(--color-primary, var(--color-accent));
  color: var(--color-text);
  background: color-mix(in srgb, var(--color-primary, var(--color-accent)) 12%, var(--color-surface));
}

.xlsx-preview-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  background: white;
}

/* The app-wide ::selection (globals.css) is tuned for the dark theme and
   unreadable against this panel's white background - see the identical
   comment/fix in DocxPreviewPanel.tsx. */
.xlsx-preview-scroll ::selection {
  background: #b4d7ff;
  color: #1a1a1a;
}

.xlsx-preview-table {
  border-collapse: collapse;
  font-size: 12px;
  color: #1c1a17;
  white-space: nowrap;
}

.xlsx-preview-table td {
  border: 1px solid #e4dfd4;
  padding: 4px 8px;
}

.xlsx-preview-empty,
.xlsx-preview-truncated {
  padding: 10px 14px;
  font-size: 11px;
  color: var(--color-text-muted);
}

.xlsx-preview-status {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-muted);
  font-size: 12px;
  text-align: center;
  padding: 0 20px;
  pointer-events: none;
  background: var(--color-surface);
}

.xlsx-preview-status--error {
  color: var(--color-error);
}
`
