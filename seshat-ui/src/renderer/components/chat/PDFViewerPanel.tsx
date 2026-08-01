import { useEffect, useRef, useState } from 'react'
import { Reduce, Add, Left, Right, LoadingOne } from '@icon-park/react'
import { api, ApiError } from '@/api/client'
import { loadPdfViewerModule, pdfjsLib } from '@/lib/pdfInteractiveViewer'
import { MarkdownView } from '@/components/MarkdownView'
import 'pdfjs-dist/web/pdf_viewer.css'

type Props = {
  fileId: string
  filename: string
  // Docling text extraction, already fetched by the caller (see
  // MessageItem.tsx) - rendered instead of a hard error when this document
  // isn't an actual PDF and the backend's LibreOffice conversion is
  // unavailable (503) or fails (the on-demand /pdf-preview endpoint, see
  // officeconvert.Converter server-side). A real PDF (isSourcePDF) never
  // needs this: /content always serves the original bytes directly.
  fallbackMarkdown?: string
}

function base64ToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
}

// A real pdf.js viewer embed (scrollable, multi-page, selectable text/
// annotations via PDFViewer's own text/annotation layers) - not the
// thumbnail-only rasterization lib/pdfPreview.ts does for attachment cards.
// PDFViewer/PDFLinkService/EventBus are pdf.js's own building blocks for
// exactly this: embedding the viewer without pulling in its full generic
// web app (toolbar chrome, l10n, etc.) - this component supplies its own
// minimal toolbar instead.
export function PDFViewerPanel({ fileId, filename, fallbackMarkdown }: Props) {
  const isSourcePDF = filename.toLowerCase().endsWith('.pdf')
  const [showFallback, setShowFallback] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<HTMLDivElement>(null)
  const pdfViewerRef = useRef<InstanceType<Awaited<ReturnType<typeof loadPdfViewerModule>>['PDFViewer']> | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [errorMessage, setErrorMessage] = useState('')
  // The /pdf-preview endpoint converts on demand via LibreOffice (see
  // officeconvert.Converter server-side) and caches the result - a cold
  // first view can take several seconds, a cached re-view is fast. There's
  // no real progress signal from that single blocking HTTP call, so this is
  // a time-based escalation rather than true progress: stay quiet for a
  // normal-speed load, only explain the wait once it's actually slow.
  const [slowConversion, setSlowConversion] = useState(false)
  const [scalePercent, setScalePercent] = useState(100)
  const [pageNumber, setPageNumber] = useState(1)
  const [pageCount, setPageCount] = useState(0)

  useEffect(() => {
    let cancelled = false
    let pdfDocument: Awaited<ReturnType<typeof pdfjsLib.getDocument>['promise']> | null = null
    let eventBus: InstanceType<Awaited<ReturnType<typeof loadPdfViewerModule>>['EventBus']> | null = null

    async function open() {
      if (!containerRef.current || !viewerRef.current) return
      try {
        const { PDFViewer, PDFLinkService, EventBus } = await loadPdfViewerModule()
        if (cancelled) return

        eventBus = new EventBus()
        const linkService = new PDFLinkService({ eventBus })
        const pdfViewer = new PDFViewer({
          container: containerRef.current,
          viewer: viewerRef.current,
          eventBus,
          linkService,
          textLayerMode: 2,
          annotationMode: 2,
        })
        linkService.setViewer(pdfViewer)
        pdfViewerRef.current = pdfViewer

        eventBus.on('pagesinit', () => {
          if (cancelled) return
          pdfViewer.currentScaleValue = 'page-width'
        })
        eventBus.on('scalechanging', (e: { scale: number }) => {
          if (!cancelled) setScalePercent(Math.round(e.scale * 100))
        })
        eventBus.on('pagechanging', (e: { pageNumber: number }) => {
          if (!cancelled) setPageNumber(e.pageNumber)
        })

        const endpoint = isSourcePDF ? 'content' : 'pdf-preview'
        // Real PDFs (/content) are always a fast static fetch - only the
        // conversion path (/pdf-preview) can be slow, and only on a cold
        // (uncached) first view.
        const slowTimer = isSourcePDF ? null : setTimeout(() => { if (!cancelled) setSlowConversion(true) }, 2500)
        let dataUrl: string
        try {
          dataUrl = await api.getFileDataURL(`/files/${fileId}/${endpoint}`)
        } finally {
          if (slowTimer) clearTimeout(slowTimer)
        }
        if (cancelled) return
        const bytes = base64ToBytes(dataUrl)
        pdfDocument = await pdfjsLib.getDocument({ data: bytes }).promise
        if (cancelled) {
          void pdfDocument.destroy()
          return
        }
        pdfViewer.setDocument(pdfDocument)
        linkService.setDocument(pdfDocument, null)
        setPageCount(pdfDocument.numPages)
        setStatus('ready')
      } catch (err) {
        if (cancelled) return
        // No visual conversion available (LibreOffice missing, or this
        // document type failed to convert) - degrade to the text extraction
        // rather than showing a dead-end error, if the caller gave us one.
        if (!isSourcePDF && fallbackMarkdown) {
          setShowFallback(true)
          return
        }
        const message =
          err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Failed to load PDF'
        setErrorMessage(message)
        setStatus('error')
      }
    }

    void open()
    return () => {
      cancelled = true
      pdfViewerRef.current = null
      void pdfDocument?.destroy()
    }
    // Re-open from scratch if the viewed file changes; loadPdfViewerModule/
    // pdfjsLib are stable module-level singletons, not real dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileId, isSourcePDF, fallbackMarkdown])

  function zoomBy(factor: number) {
    const viewer = pdfViewerRef.current
    if (!viewer) return
    viewer.currentScale = Math.max(0.25, Math.min(viewer.currentScale * factor, 5))
  }

  function goToPage(delta: number) {
    const viewer = pdfViewerRef.current
    if (!viewer) return
    viewer.currentPageNumber = Math.max(1, Math.min(viewer.currentPageNumber + delta, pageCount))
  }

  if (showFallback) {
    return (
      <div className="pdf-viewer-panel pdf-viewer-panel--fallback">
        <style>{PDF_VIEWER_PANEL_CSS}</style>
        <div className="pdf-viewer-fallback-notice">Visual preview unavailable - showing extracted text.</div>
        <div className="pdf-viewer-fallback-body">
          <MarkdownView>{fallbackMarkdown ?? ''}</MarkdownView>
        </div>
      </div>
    )
  }

  return (
    <div className="pdf-viewer-panel">
      <style>{PDF_VIEWER_PANEL_CSS}</style>
      <div className="pdf-viewer-toolbar">
        <button type="button" onClick={() => goToPage(-1)} disabled={status !== 'ready' || pageNumber <= 1} title="Previous page">
          <Left size={12} />
        </button>
        <span className="pdf-viewer-page-indicator">{status === 'ready' ? `${pageNumber} / ${pageCount}` : '—'}</span>
        <button type="button" onClick={() => goToPage(1)} disabled={status !== 'ready' || pageNumber >= pageCount} title="Next page">
          <Right size={12} />
        </button>
        <span className="pdf-viewer-toolbar-spacer" />
        <button type="button" onClick={() => zoomBy(1 / 1.15)} disabled={status !== 'ready'} title="Zoom out">
          <Reduce size={12} />
        </button>
        <span className="pdf-viewer-zoom-indicator">{status === 'ready' ? `${scalePercent}%` : '—'}</span>
        <button type="button" onClick={() => zoomBy(1.15)} disabled={status !== 'ready'} title="Zoom in">
          <Add size={12} />
        </button>
      </div>
      <div className="pdf-viewer-stage">
        <div className="pdf-viewer-container" ref={containerRef}>
          <div className="pdfViewer" ref={viewerRef} />
        </div>
        {status === 'loading' && (
          <div className="pdf-viewer-status">
            <LoadingOne size={20} className="pdf-viewer-status-spin" />
            <span>
              {slowConversion
                ? `Converting ${filename}… first-time previews can take a few seconds`
                : `Loading ${filename}…`}
            </span>
          </div>
        )}
        {status === 'error' && <div className="pdf-viewer-status pdf-viewer-status--error">Couldn't load this PDF: {errorMessage}</div>}
      </div>
    </div>
  )
}

const PDF_VIEWER_PANEL_CSS = `
.pdf-viewer-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.pdf-viewer-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-bottom: 1px solid var(--color-border-subtle);
  flex-shrink: 0;
}

.pdf-viewer-toolbar button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: 1px solid var(--color-border-subtle);
  border-radius: 6px;
  background: var(--color-surface);
  color: var(--color-text-secondary);
  cursor: pointer;
}

.pdf-viewer-toolbar button:hover:not(:disabled) {
  background: var(--color-hover);
  color: var(--color-text);
}

.pdf-viewer-toolbar button:disabled {
  opacity: 0.4;
  cursor: default;
}

.pdf-viewer-page-indicator,
.pdf-viewer-zoom-indicator {
  min-width: 44px;
  text-align: center;
  font-size: 11px;
  color: var(--color-text-secondary);
}

.pdf-viewer-toolbar-spacer {
  flex: 1;
}

.pdf-viewer-stage {
  position: relative;
  flex: 1;
  min-height: 0;
}

.pdf-viewer-container {
  position: absolute;
  inset: 0;
  overflow: auto;
  background: #525659;
}

.pdf-viewer-container .pdfViewer .page {
  margin: 12px auto;
  border: none;
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.35);
}

.pdf-viewer-status {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: rgba(255, 255, 255, 0.75);
  font-size: 12px;
  text-align: center;
  padding: 0 20px;
  pointer-events: none;
}

.pdf-viewer-status-spin {
  animation: pdf-viewer-spin 1s linear infinite;
}

@keyframes pdf-viewer-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.pdf-viewer-status--error {
  color: var(--color-error);
}

.pdf-viewer-panel--fallback {
  overflow: hidden;
}

.pdf-viewer-fallback-notice {
  flex-shrink: 0;
  padding: 7px 13px;
  font-size: 11px;
  color: var(--color-text-muted);
  border-bottom: 1px solid var(--color-border-subtle);
  background: rgba(255, 255, 255, 0.02);
}

.pdf-viewer-fallback-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 14px 16px;
}
`
