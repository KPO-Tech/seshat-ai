import { session } from 'electron'

// Defense-in-depth only - nodeIntegration/contextIsolation/sandbox are the
// real boundary. This just shrinks the blast radius of a future renderer-side
// injection bug (e.g. a markdown-rendering XSS) by blocking exfiltration and
// arbitrary script/asset loading, even though nothing in this app should ever
// need to reach outside its own bundle.
//
// - script-src/style-src/img-src/font-src 'self': the packaged renderer is
//   entirely local files (out/renderer). style-src also needs 'unsafe-inline'
//   because React's `style={{...}}` props render as inline style attributes
//   throughout the app (virtualized list positioning, etc.) - locking that
//   down would need a full inline-style-to-class refactor, not a CSP problem.
// - img-src additionally allows data: (attachment/doc-preview thumbnails are
//   base64 data URLs), file: (local file previews staged before upload) and
//   blob: (URL.createObjectURL previews).
// - font-src additionally allows data: - KaTeX's bundled fonts are inlined as
//   base64 in its stylesheet.
// - connect-src 'self' only: the renderer never calls the backend directly -
//   every HTTP/SSE call goes through the main process over IPC (see
//   ipc/backend.ts) precisely so the renderer doesn't need network access at
//   all in the packaged app.
// - worker-src 'self': the PDF preview's pdf.worker is bundled and loaded
//   same-origin (see lib/pdfPreview.ts).
// - object-src/frame-src 'none', base-uri/form-action 'none': no plugins, no
//   iframes, no <base> retargeting, no form submissions exist in this app.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: file: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-src 'none'",
].join('; ')

// Only the packaged app (loadFile) gets the strict CSP. Dev mode
// (ELECTRON_RENDERER_URL set, pointing at the electron-vite dev server) needs
// HMR's inline bootstrap script and eval-based module reloading, which this
// policy would break - the CSP's value here is protecting what real users
// run, not the dev loop.
export function applyContentSecurityPolicy() {
  if (process.env.ELECTRON_RENDERER_URL) return
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [CONTENT_SECURITY_POLICY],
      },
    })
  })
}
