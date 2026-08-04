import { useEffect, useRef, useState } from 'react'
import { Reduce, Add, Left, Right, LoadingOne } from '@icon-park/react'
import { api, ApiError } from '@/api/client'
import { loadPdfViewerModule, pdfjsLib } from '@/lib/pdfInteractiveViewer'
import 'pdfjs-dist/web/pdf_viewer.css'

type Props = {
  fileId: string
  filename: string
}

type LayoutMode = 'pages' | 'width'
type PdfViewerModule = Awaited<ReturnType<typeof loadPdfViewerModule>>
type PdfViewerInstance = InstanceType<PdfViewerModule['PDFViewer']>

function base64ToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
}

function applyPDFLayout(
  viewer: PdfViewerInstance | null,
  modes: Pick<PdfViewerModule, 'ScrollMode' | 'SpreadMode'> | null,
  mode: LayoutMode,
) {
  if (!viewer || !modes) return
  if (mode === 'pages') {
    viewer.spreadMode = modes.SpreadMode.NONE
    viewer.scrollMode = modes.ScrollMode.WRAPPED
    viewer.currentScaleValue = 'page-fit'
    return
  }
  viewer.spreadMode = modes.SpreadMode.NONE
  viewer.scrollMode = modes.ScrollMode.VERTICAL
  viewer.currentScaleValue = 'page-width'
}

// A real pdf.js viewer embed (scrollable, multi-page, selectable text/
// annotations via PDFViewer's own text/annotation layers) - not the
// thumbnail-only rasterization lib/pdfPreview.ts does for attachment cards.
// PDFViewer/PDFLinkService/EventBus are pdf.js's own building blocks for
// exactly this: embedding the viewer without pulling in its full generic
// web app (toolbar chrome, l10n, etc.) - this component supplies its own
// minimal toolbar instead.
export function PDFViewerPanel({ fileId, filename }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<HTMLDivElement>(null)
  const pdfViewerRef = useRef<PdfViewerInstance | null>(null)
  const pdfModesRef = useRef<Pick<PdfViewerModule, 'ScrollMode' | 'SpreadMode'> | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [errorMessage, setErrorMessage] = useState('')
  const [scalePercent, setScalePercent] = useState(100)
  const [pageNumber, setPageNumber] = useState(1)
  const [pageCount, setPageCount] = useState(0)
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('pages')

  useEffect(() => {
    let cancelled = false
    let pdfDocument: Awaited<ReturnType<typeof pdfjsLib.getDocument>['promise']> | null = null
    let eventBus: InstanceType<Awaited<ReturnType<typeof loadPdfViewerModule>>['EventBus']> | null = null

    async function open() {
      if (!containerRef.current || !viewerRef.current) return
      try {
        const { PDFViewer, PDFLinkService, EventBus, ScrollMode, SpreadMode } = await loadPdfViewerModule()
        if (cancelled) return

        pdfModesRef.current = { ScrollMode, SpreadMode }
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
          applyPDFLayout(pdfViewer, pdfModesRef.current, layoutMode)
        })
        eventBus.on('scalechanging', (e: { scale: number }) => {
          if (!cancelled) setScalePercent(Math.round(e.scale * 100))
        })
        eventBus.on('pagechanging', (e: { pageNumber: number }) => {
          if (!cancelled) setPageNumber(e.pageNumber)
        })

        const dataUrl = await api.getFileDataURL(`/files/${fileId}/content`)
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
      pdfModesRef.current = null
      void pdfDocument?.destroy()
    }
    // Re-open from scratch if the viewed file changes; loadPdfViewerModule/
    // pdfjsLib are stable module-level singletons, not real dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileId])

  function setLayout(mode: LayoutMode) {
    setLayoutMode(mode)
    applyPDFLayout(pdfViewerRef.current, pdfModesRef.current, mode)
  }

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
        <div className="pdf-viewer-layout-toggle" aria-label="PDF layout">
          <button
            type="button"
            className={layoutMode === 'pages' ? 'is-active' : ''}
            onClick={() => setLayout('pages')}
            disabled={status !== 'ready'}
            title="Fit pages and use multiple columns when space allows"
          >
            Pages
          </button>
          <button
            type="button"
            className={layoutMode === 'width' ? 'is-active' : ''}
            onClick={() => setLayout('width')}
            disabled={status !== 'ready'}
            title="Fit one page to the panel width"
          >
            Width
          </button>
        </div>
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
            <span>Loading {filename}...</span>
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

.pdf-viewer-toolbar button.is-active {
  background: rgba(255, 122, 24, 0.16);
  border-color: rgba(255, 122, 24, 0.45);
  color: var(--color-accent);
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

.pdf-viewer-layout-toggle {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 2px;
  border: 1px solid var(--color-border-subtle);
  border-radius: 7px;
  background: var(--color-surface);
}

.pdf-viewer-layout-toggle button {
  width: auto;
  min-width: 48px;
  height: 20px;
  padding: 0 8px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  font-size: 11px;
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
  margin: 10px;
  border: none;
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.35);
}

.pdf-viewer-container .pdfViewer:not(.scrollWrapped) .page {
  margin: 12px auto;
}

.pdf-viewer-container .pdfViewer.scrollWrapped {
  padding: 14px;
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
`
