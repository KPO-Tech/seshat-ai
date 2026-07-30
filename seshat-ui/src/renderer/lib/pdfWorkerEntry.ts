// TC39 Uint8Array base64/hex proposal - not yet in TypeScript's lib.d.ts.
declare global {
  interface Uint8Array {
    toHex?(): string
  }
}

// pdfjs-dist's worker calls the still-very-new Uint8Array.prototype.toHex()
// (TC39 Uint8Array base64/hex proposal) with no fallback for engines that
// don't have it yet - Electron's bundled V8 here doesn't, so every PDF
// preview fails with "hashOriginal.toHex is not a function" the moment
// pdf.js computes a document fingerprint (every PDF hits this, not just
// ones missing a trailer /ID - the same call happens either way). Polyfill
// it before pdf.worker.mjs's own code runs, in this same worker realm -
// patching it from the main thread doesn't reach here, workers don't share
// prototypes with the page that spawned them.
if (typeof Uint8Array.prototype.toHex !== 'function') {
  Object.defineProperty(Uint8Array.prototype, 'toHex', {
    value: function toHex(this: Uint8Array): string {
      let hex = ''
      for (const byte of this) hex += byte.toString(16).padStart(2, '0')
      return hex
    },
    writable: true,
    configurable: true,
  })
}

import 'pdfjs-dist/build/pdf.worker.mjs'
