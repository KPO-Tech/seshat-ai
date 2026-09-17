import { useEffect, useRef, useState } from 'react'
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url'
import { DocumentPreviewState } from './PreviewState'

export function PdfPreview({ url, filename }: { url: string; filename: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const documentRef = useRef<PDFDocumentProxy | null>(null)
  const renderRef = useRef<RenderTask | null>(null)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(0)
  const [scale, setScale] = useState(1.25)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    let loading: ReturnType<(typeof import('pdfjs-dist'))['getDocument']> | null = null
    void import('pdfjs-dist').then(async (pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
      loading = pdfjs.getDocument(url)
      const document = await loading.promise
      if (!active) return void document.destroy()
      documentRef.current = document
      setPages(document.numPages)
      setStatus('ready')
    }).catch((reason) => { if (active) { setError(reason instanceof Error ? reason.message : 'PDF preview failed.'); setStatus('error') } })
    return () => { active = false; renderRef.current?.cancel(); void loading?.destroy(); documentRef.current = null }
  }, [url])

  useEffect(() => {
    const document = documentRef.current
    const canvas = canvasRef.current
    if (!document || !canvas) return
    let active = true
    void document.getPage(page).then(async (pdfPage) => {
      if (!active) return
      renderRef.current?.cancel()
      const viewport = pdfPage.getViewport({ scale })
      const ratio = window.devicePixelRatio || 1
      canvas.width = Math.floor(viewport.width * ratio)
      canvas.height = Math.floor(viewport.height * ratio)
      canvas.style.width = `${viewport.width}px`
      canvas.style.height = `${viewport.height}px`
      const context = canvas.getContext('2d')
      if (!context) return
      const task = pdfPage.render({ canvas, canvasContext: context, viewport, transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0] })
      renderRef.current = task
      await task.promise.catch(() => undefined)
    })
    return () => { active = false; renderRef.current?.cancel() }
  }, [page, pages, scale])

  return (
    <div className="relative flex size-full min-h-0 flex-col">
      <div className="flex h-10 shrink-0 items-center justify-center gap-2 border-b border-[var(--border-soft)] bg-[var(--surface-root)]">
        <ToolbarButton label="Previous page" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>‹</ToolbarButton>
        <span className="min-w-16 text-center text-[11px] text-[var(--text-secondary)]">{pages ? `${page} / ${pages}` : ''}</span>
        <ToolbarButton label="Next page" disabled={!pages || page >= pages} onClick={() => setPage((value) => value + 1)}>›</ToolbarButton>
        <span className="mx-1 h-4 w-px bg-[var(--border-soft)]" />
        <ToolbarButton label="Zoom out" disabled={scale <= 0.5} onClick={() => setScale((value) => Math.max(0.5, value - 0.25))}>−</ToolbarButton>
        <span className="min-w-11 text-center text-[11px] text-[var(--text-secondary)]">{Math.round(scale * 100)}%</span>
        <ToolbarButton label="Zoom in" disabled={scale >= 3} onClick={() => setScale((value) => Math.min(3, value + 0.25))}>+</ToolbarButton>
      </div>
      <div className="min-h-0 flex-1 overflow-auto bg-[#444] p-5"><canvas ref={canvasRef} className="mx-auto block bg-white shadow-xl" /></div>
      {status === 'loading' && <DocumentPreviewState label={`Loading ${filename}`} />}
      {status === 'error' && <DocumentPreviewState label={error} error />}
    </div>
  )
}

function ToolbarButton({ children, label, disabled, onClick }: { children: string; label: string; disabled: boolean; onClick: () => void }) {
  return <button type="button" disabled={disabled} onClick={onClick} aria-label={label} className="flex size-7 items-center justify-center rounded-md border border-[var(--border-soft)] text-[15px] text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] disabled:opacity-35">{children}</button>
}
