import { useEffect, useRef, useState } from 'react'
import { renderAsync } from 'docx-preview'
import { api, ApiError } from '@/api/client'

type Props = {
  fileId: string
  filename: string
}

function base64ToArrayBuffer(dataUrl: string): ArrayBuffer {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
  return bytes.buffer
}

// Renders a .docx file's real content directly in the browser (docx-preview
// parses the document XML client-side) instead of routing through the
// backend's on-demand LibreOffice-to-PDF conversion (see PDFViewerPanel,
// used for PPTX/HTML/TEX which don't have a good native-renderer option).
// This is the difference between an instant preview and a multi-second
// cold LibreOffice process spin-up - the same reason Claude/Gemini-style
// document previews don't shell out to a real office suite either.
export function DocxPreviewPanel({ fileId, filename }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    setErrorMessage('')

    async function open() {
      if (!containerRef.current) return
      try {
        const dataUrl = await api.getFileDataURL(`/files/${fileId}/content`)
        if (cancelled || !containerRef.current) return
        const buffer = base64ToArrayBuffer(dataUrl)
        containerRef.current.innerHTML = ''
        await renderAsync(buffer, containerRef.current, undefined, {
          inWrapper: true,
          // false (the default) renders the page at its real fixed
          // pixel width (a Letter/A4 page comes out wider than most right-
          // panel widths), so the panel either clipped the text at its own
          // edge or forced an uncomfortable horizontal scroll just to read
          // a line. true lets the page flow to the container's own width
          // instead - CSS below still caps it at a comfortable reading
          // max-width so it doesn't go edge-to-edge on a wide panel.
          ignoreWidth: true,
          ignoreHeight: true,
          className: 'docx-preview-doc',
        })
        if (cancelled) return
        setStatus('ready')
      } catch (err) {
        if (cancelled) return
        const message = err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Failed to render document'
        setErrorMessage(message)
        setStatus('error')
      }
    }

    void open()
    return () => {
      cancelled = true
    }
  }, [fileId])

  return (
    <div className="docx-preview-panel">
      <style>{DOCX_PREVIEW_CSS}</style>
      <div className="docx-preview-scroll">
        <div className="docx-preview-container" ref={containerRef} />
      </div>
      {status === 'loading' && <div className="docx-preview-status">Loading {filename}…</div>}
      {status === 'error' && (
        <div className="docx-preview-status docx-preview-status--error">Couldn't load this document: {errorMessage}</div>
      )}
    </div>
  )
}

const DOCX_PREVIEW_CSS = `
.docx-preview-panel {
  position: relative;
  height: 100%;
  min-height: 0;
}

.docx-preview-scroll {
  height: 100%;
  overflow: auto;
  background: #525659;
  padding: 12px 16px 24px;
}

.docx-preview-container .docx-preview-doc {
  background: white;
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.35);
  margin: 0 auto 12px;
  width: 100%;
  max-width: 820px;
  box-sizing: border-box;
}

.docx-preview-status {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.75);
  font-size: 12px;
  text-align: center;
  padding: 0 20px;
  pointer-events: none;
  background: #525659;
}

.docx-preview-status--error {
  color: var(--color-error);
}
`
