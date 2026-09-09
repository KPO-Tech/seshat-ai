import { useEffect, useMemo, useState } from 'react'
import { Caution, FileText, LoadingOne } from '@icon-park/react'
import { api, ApiError } from '@/api/client'
import { MarkdownView } from '@/components/MarkdownView'
import { DocxPreviewPanel } from '@/components/chat/DocxPreviewPanel'
import { PDFViewerPanel } from '@/components/chat/PDFViewerPanel'
import { PptxPreviewPanel } from '@/components/chat/PptxPreviewPanel'
import { XlsxPreviewPanel } from '@/components/chat/XlsxPreviewPanel'
import type { CorpusFile } from '@/api/types'
import { decodeDataUrlText, fileExtension, previewKind, textPreviewEndpoint } from '../lib/preview'

export function KnowledgeDocumentPreview({ file }: { file: CorpusFile | null }) {
  const [text, setText] = useState('')
  const [mediaUrl, setMediaUrl] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [error, setError] = useState('')

  const kind = file ? previewKind(file.filename) : 'unsupported'

  useEffect(() => {
    let cancelled = false
    setText('')
    setMediaUrl('')
    setError('')

    if (!file || !['markdown', 'csv', 'text', 'image', 'audio'].includes(kind)) {
      setStatus(file ? 'ready' : 'idle')
      return
    }

    if (kind === 'image' || kind === 'audio') {
      setStatus('loading')
      void api.getFileDataURL(`/files/${file.file_id}/content`)
        .then((dataUrl) => {
          if (cancelled) return
          setMediaUrl(dataUrl)
          setStatus('ready')
        })
        .catch((err) => {
          if (cancelled) return
          setError(err instanceof ApiError ? err.message : 'Unable to load this document.')
          setStatus('error')
        })
      return () => {
        cancelled = true
      }
    }

    setStatus('loading')
    void api.getFileDataURL(textPreviewEndpoint(file, kind))
      .then((dataUrl) => {
        if (cancelled) return
        setText(decodeDataUrlText(dataUrl))
        setStatus('ready')
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof ApiError ? err.message : 'Unable to load this document.')
        setStatus('error')
      })

    return () => {
      cancelled = true
    }
  }, [file, kind])

  if (!file) {
    return (
      <div className="k-preview-empty">
        <FileText size={22} />
        <span>Select a file to preview it.</span>
      </div>
    )
  }

  if (kind === 'pdf') return <PDFViewerPanel fileId={file.file_id} filename={file.filename} />
  if (kind === 'docx') return <DocxPreviewPanel fileId={file.file_id} filename={file.filename} />
  if (kind === 'xlsx') return <XlsxPreviewPanel fileId={file.file_id} filename={file.filename} />
  if (kind === 'pptx') return <PptxPreviewPanel fileId={file.file_id} filename={file.filename} />

  if (status === 'loading') {
    return (
      <div className="k-preview-empty">
        <LoadingOne size={18} className="spin" />
        <span>Loading {file.filename}</span>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="k-preview-empty error">
        <Caution size={20} />
        <span>{error}</span>
      </div>
    )
  }

  if (kind === 'markdown') {
    return (
      <div className="k-markdown-preview">
        <MarkdownView>{text || '*Empty document*'}</MarkdownView>
      </div>
    )
  }

  if (kind === 'csv') {
    return <CsvPreview text={text} delimiter={fileExtension(file.filename) === 'tsv' ? '\t' : ','} />
  }

  if (kind === 'text') {
    return <pre className="k-text-preview">{text || 'Empty document'}</pre>
  }

  if (kind === 'image') {
    return (
      <div className="k-image-preview">
        {mediaUrl && <img src={mediaUrl} alt={file.filename} />}
      </div>
    )
  }

  if (kind === 'audio') {
    return (
      <div className="k-audio-preview">
        {mediaUrl && <audio src={mediaUrl} controls />}
      </div>
    )
  }

  return (
    <div className="k-preview-empty">
      <FileText size={22} />
      <span>Preview is not available for this file type yet.</span>
    </div>
  )
}

function CsvPreview({ text, delimiter }: { text: string; delimiter: string }) {
  const rows = useMemo(() => parseDelimitedRows(text, delimiter).slice(0, 400), [delimiter, text])
  if (rows.length === 0) return <div className="k-preview-empty"><FileText size={22} /><span>Empty table.</span></div>
  return (
    <div className="k-csv-preview">
      <table>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => rowIndex === 0 ? (
                <th key={cellIndex}>{cell}</th>
              ) : (
                <td key={cellIndex}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function parseDelimitedRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = []
  let cell = ''
  let row: string[] = []
  let quoted = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    const next = text[i + 1]
    if (char === '"') {
      if (quoted && next === '"') {
        cell += '"'
        i++
      } else {
        quoted = !quoted
      }
      continue
    }
    if (char === delimiter && !quoted) {
      row.push(cell)
      cell = ''
      continue
    }
    if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
      continue
    }
    cell += char
  }

  if (cell || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  return rows
}
