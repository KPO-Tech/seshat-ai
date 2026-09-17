import { useEffect, useRef, useState } from 'react'
import { DocumentPreviewState } from './PreviewState'

export function DocxPreview({ url, filename }: { url: string; filename: string }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const naturalWidth = useRef(0)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    const fit = () => {
      const scroll = scrollRef.current
      const container = containerRef.current
      if (!scroll || !container || naturalWidth.current === 0) return
      const scale = Math.min(1, Math.max(0.35, (scroll.clientWidth - 40) / naturalWidth.current))
      container.style.width = `${naturalWidth.current}px`
      container.style.zoom = String(scale)
    }
    const observer = new ResizeObserver(fit)
    if (scrollRef.current) observer.observe(scrollRef.current)

    void Promise.all([import('docx-preview'), fetch(url).then((response) => response.arrayBuffer())]).then(async ([module, buffer]) => {
      if (!active || !containerRef.current) return
      containerRef.current.innerHTML = ''
      await module.renderAsync(buffer, containerRef.current, undefined, { inWrapper: true, ignoreHeight: true, className: 'seshat-docx' })
      if (!active || !containerRef.current) return
      naturalWidth.current = containerRef.current.scrollWidth
      fit()
      setStatus('ready')
    }).catch((reason) => {
      if (!active) return
      setError(reason instanceof Error ? reason.message : 'Document preview failed.')
      setStatus('error')
    })

    return () => { active = false; observer.disconnect() }
  }, [url])

  return (
    <div className="relative size-full min-h-0">
      <div ref={scrollRef} className="size-full overflow-auto bg-[#d8d8d8] p-5">
        <div ref={containerRef} className="mx-auto text-black" />
      </div>
      {status === 'loading' && <DocumentPreviewState label={`Loading ${filename}`} />}
      {status === 'error' && <DocumentPreviewState label={error} error />}
    </div>
  )
}
