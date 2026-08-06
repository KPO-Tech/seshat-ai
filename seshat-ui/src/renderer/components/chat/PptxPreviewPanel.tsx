import { useEffect, useRef, useState } from 'react'
import { api, ApiError } from '@/api/client'

type Props = {
  fileId: string
  filename: string
}

type PptxPreviewer = {
  preview: (data: ArrayBuffer) => unknown
}

function base64ToArrayBuffer(dataUrl: string): ArrayBuffer {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
  return bytes.buffer
}

function fitPresentationSize(host: HTMLElement): { width: number; height: number } {
  const availableWidth = Math.max(1, host.clientWidth - 24)
  const width = Math.max(640, availableWidth)
  return { width, height: Math.round(width * 9 / 16) }
}

// Renders .pptx in-browser through pptx-preview. The package is intentionally
// isolated here so we can swap it later without changing attachment routing
// or right-panel state.
export function PptxPreviewPanel({ fileId, filename }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    setErrorMessage('')

    async function open() {
      const scroll = scrollRef.current
      const container = containerRef.current
      if (!scroll || !container) return

      try {
        container.innerHTML = ''
        const [{ init }, dataUrl] = await Promise.all([
          import('pptx-preview'),
          api.getFileDataURL(`/files/${fileId}/content`),
        ])
        if (cancelled || !containerRef.current || !scrollRef.current) return
        const { width, height } = fitPresentationSize(scrollRef.current)
        const previewer = init(containerRef.current, { width, height, mode: 'list' }) as PptxPreviewer
        await Promise.resolve(previewer.preview(base64ToArrayBuffer(dataUrl)))
        if (!cancelled) setStatus('ready')
      } catch (err) {
        if (cancelled) return
        const message = err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Failed to render presentation'
        setErrorMessage(message)
        setStatus('error')
      }
    }

    void open()
    return () => {
      cancelled = true
      if (containerRef.current) containerRef.current.innerHTML = ''
    }
  }, [fileId])

  return (
    <div className="pptx-preview-panel">
      <style>{PPTX_PREVIEW_CSS}</style>
      <div className="pptx-preview-scroll" ref={scrollRef}>
        <div className="pptx-preview-container" ref={containerRef} />
      </div>
      {status === 'loading' && <div className="pptx-preview-status">Loading {filename}...</div>}
      {status === 'error' && (
        <div className="pptx-preview-status pptx-preview-status--error">Couldn't load this presentation: {errorMessage}</div>
      )}
    </div>
  )
}

const PPTX_PREVIEW_CSS = `
.pptx-preview-panel {
  position: relative;
  height: 100%;
  min-height: 0;
}

.pptx-preview-scroll {
  height: 100%;
  overflow: auto;
  background: var(--color-surface);
  padding: 12px;
}

.pptx-preview-container {
  min-width: max-content;
}

.pptx-preview-container > * {
  margin-left: auto;
  margin-right: auto;
}

.pptx-preview-status {
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

.pptx-preview-status--error {
  color: var(--color-error);
}
`
