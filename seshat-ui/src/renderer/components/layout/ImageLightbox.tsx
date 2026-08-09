import { useEffect, useRef, useState } from 'react'
import { Reduce, Add, Download } from '@icon-park/react'
import { useUIStore } from '@/stores/ui'
import { WindowCloseIcon } from '@/components/ui/WindowControlIcon'

// A single full-screen image viewer used everywhere an image can be
// enlarged (chat attachments, sent messages, tool-generated images, ...) -
// previously each call site had its own ad-hoc modal (or, for tool-generated
// images, no way to enlarge at all). Mounted once at the Shell level so it
// covers the content area consistently (respects the titlebar/sidebar via
// the same geometry RightPanelHost's maximized-panel overlay uses) no matter
// which page triggered it.
export function ImageLightbox() {
  const image = useUIStore((s) => s.lightboxImage)
  const closeLightbox = useUIStore((s) => s.closeLightbox)
  const containerRef = useRef<HTMLDivElement>(null)
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null)
  const [scale, setScale] = useState(1)

  useEffect(() => {
    setNaturalSize(null)
    setScale(1)
  }, [image?.url])

  useEffect(() => {
    if (!image) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') closeLightbox()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [image, closeLightbox])

  if (!image) return null

  function onImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const { naturalWidth, naturalHeight } = e.currentTarget
    setNaturalSize({ width: naturalWidth, height: naturalHeight })
    const container = containerRef.current
    if (!container || !naturalWidth || !naturalHeight) return
    const fit = Math.min(container.clientWidth / naturalWidth, container.clientHeight / naturalHeight, 1)
    setScale(fit > 0 ? fit : 1)
  }

  function zoomBy(factor: number) {
    setScale((current) => Math.max(0.1, Math.min(current * factor, 6)))
  }

  function download() {
    const link = document.createElement('a')
    link.href = image!.url
    link.download = image!.filename
    link.click()
  }

  return (
    <div className="image-lightbox" role="dialog" aria-modal="true" onMouseDown={closeLightbox}>
      <style>{IMAGE_LIGHTBOX_CSS}</style>
      <div className="image-lightbox-header" onMouseDown={(e) => e.stopPropagation()}>
        <span className="image-lightbox-filename">{image.filename}</span>
        <div className="image-lightbox-actions">
          <button type="button" onClick={download} title="Download">
            <Download size={13} />
          </button>
          <button type="button" onClick={closeLightbox} title="Close">
            <WindowCloseIcon size={14} />
          </button>
        </div>
      </div>
      <div className="image-lightbox-stage" ref={containerRef} onMouseDown={(e) => e.stopPropagation()}>
        <img
          src={image.url}
          alt={image.filename}
          onLoad={onImageLoad}
          style={naturalSize ? { width: naturalSize.width * scale, height: naturalSize.height * scale } : undefined}
        />
      </div>
      <div className="image-lightbox-zoom" onMouseDown={(e) => e.stopPropagation()}>
        <button type="button" onClick={() => zoomBy(1 / 1.25)} title="Zoom out">
          <Reduce size={13} />
        </button>
        <span>{Math.round(scale * 100)}%</span>
        <button type="button" onClick={() => zoomBy(1.25)} title="Zoom in">
          <Add size={13} />
        </button>
      </div>
    </div>
  )
}

const IMAGE_LIGHTBOX_CSS = `
.image-lightbox {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: var(--sidebar-width);
  z-index: 60;
  display: flex;
  flex-direction: column;
  background: rgba(10, 10, 12, 0.94);
}

.shell-main.collapsed .image-lightbox {
  left: var(--sidebar-collapsed-width);
}

.shell-main.no-sidebar .image-lightbox {
  left: 0;
}

.image-lightbox-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 16px;
  flex-shrink: 0;
}

.image-lightbox-filename {
  color: rgba(255, 255, 255, 0.85);
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.image-lightbox-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.image-lightbox-actions button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.8);
  cursor: pointer;
}

.image-lightbox-actions button:hover {
  background: rgba(255, 255, 255, 0.16);
  color: white;
}

.image-lightbox-stage {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: auto;
  padding: 12px;
}

.image-lightbox-stage img {
  display: block;
  max-width: none;
  border-radius: 6px;
  box-shadow: 0 20px 70px rgba(0, 0, 0, 0.5);
}

.image-lightbox-zoom {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 10px 16px 16px;
  flex-shrink: 0;
}

.image-lightbox-zoom span {
  min-width: 40px;
  text-align: center;
  color: rgba(255, 255, 255, 0.8);
  font-size: 12px;
}

.image-lightbox-zoom button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.85);
  cursor: pointer;
}

.image-lightbox-zoom button:hover {
  background: rgba(255, 255, 255, 0.2);
  color: white;
}
`
