import { useEffect, useRef, useState } from 'react'
import { DocumentPreviewState } from './PreviewState'

type PptxRenderer = { preview: (data: ArrayBuffer) => Promise<unknown> | unknown }

export function PptxPreview({ url, filename }: { url: string; filename: string }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    void Promise.all([import('pptx-preview'), fetch(url).then((response) => response.arrayBuffer())]).then(async ([module, buffer]) => {
      if (!active || !hostRef.current || !scrollRef.current) return
      hostRef.current.innerHTML = ''
      const width = Math.max(640, scrollRef.current.clientWidth - 32)
      const renderer = module.init(hostRef.current, { width, height: Math.round(width * 9 / 16), mode: 'list' }) as PptxRenderer
      await Promise.resolve(renderer.preview(buffer))
      if (active) setStatus('ready')
    }).catch((reason) => {
      if (!active) return
      setError(reason instanceof Error ? reason.message : 'Presentation preview failed.')
      setStatus('error')
    })
    return () => { active = false; if (hostRef.current) hostRef.current.innerHTML = '' }
  }, [url])

  return (
    <div className="relative size-full min-h-0">
      <div ref={scrollRef} className="size-full overflow-auto bg-[var(--surface-muted)] p-4"><div ref={hostRef} className="min-w-max [&>*]:mx-auto" /></div>
      {status === 'loading' && <DocumentPreviewState label={`Loading ${filename}`} />}
      {status === 'error' && <DocumentPreviewState label={error} error />}
    </div>
  )
}
