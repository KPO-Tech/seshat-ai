import * as pdfjsLib from 'pdfjs-dist'
// Side-effect import: sets pdfjsLib.GlobalWorkerOptions.workerPort. Sharing
// the same worker as the thumbnail generator (rather than spinning up a
// second one here) is intentional - pdfjs-dist is a module singleton, so
// GlobalWorkerOptions is the same object either way, but importing this
// makes that not depend on load order.
import './pdfPreview'

// pdf_viewer.mjs is a bundled/rolled-up file (not itself using ES imports) -
// its top-level code destructures everything it needs from
// `globalThis.pdfjsLib` instead. That global has to exist BEFORE this module
// is evaluated, which is why the import below is dynamic (deferred until
// loadPdfViewerModule() actually runs) rather than a static import at the
// top of this file - a static import could be hoisted/evaluated before the
// assignment two lines below runs, depending on the bundler's module graph.
type PdfViewerModule = typeof import('pdfjs-dist/web/pdf_viewer.mjs')
let viewerModulePromise: Promise<PdfViewerModule> | null = null

export function loadPdfViewerModule(): Promise<PdfViewerModule> {
  if (!viewerModulePromise) {
    ;(globalThis as unknown as { pdfjsLib: typeof pdfjsLib }).pdfjsLib = pdfjsLib
    viewerModulePromise = import('pdfjs-dist/web/pdf_viewer.mjs')
  }
  return viewerModulePromise
}

export { pdfjsLib }
