import { useEffect, useState } from 'react'

type Props = {
  artifactId: string
  filename: string
}

// Renders an agent-written, self-contained HTML file as a live, interactive
// preview - sandbox="allow-scripts" WITHOUT allow-same-origin gives the
// iframe a unique opaque origin with no access to this app's window, DOM,
// IPC bridge, cookies, or localStorage, regardless of what the previewed
// page's own script does. The backend's /artifacts/preview/{id} endpoint
// (not this app's own file-serving) carries its own, separately-scoped CSP
// that allows the inline <script>/<style> a real HTML artifact needs - see
// artifactPreviewCSP in seshat-backend/internal/api/artifacts.go and the
// frame-src carve-out in seshat-ui/src/main/content-security-policy.ts.
export function ArtifactPreviewPanel({ artifactId, filename }: Props) {
  const [src, setSrc] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setSrc(null)
    setError(null)
    window.nexus?.http?.backendOrigin()
      .then((origin) => {
        if (cancelled) return
        if (!origin) throw new Error('Backend origin unavailable')
        setSrc(`${origin}/api/v1/artifacts/preview/${artifactId}`)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to resolve preview URL')
      })
    return () => {
      cancelled = true
    }
  }, [artifactId])

  return (
    <div className="artifact-preview-panel">
      <style>{ARTIFACT_PREVIEW_CSS}</style>
      {error ? (
        <div className="artifact-preview-status artifact-preview-status--error">Couldn't load preview: {error}</div>
      ) : src ? (
        <iframe
          src={src}
          title={filename}
          className="artifact-preview-frame"
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
        />
      ) : (
        <div className="artifact-preview-status">Loading preview…</div>
      )}
    </div>
  )
}

const ARTIFACT_PREVIEW_CSS = `
.artifact-preview-panel {
  position: relative;
  height: 100%;
  min-height: 0;
  background: #fff;
}

.artifact-preview-frame {
  width: 100%;
  height: 100%;
  border: none;
  display: block;
}

.artifact-preview-status {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-muted);
  font-size: 12px;
  text-align: center;
  padding: 0 20px;
  background: var(--color-surface);
}

.artifact-preview-status--error {
  color: var(--color-error);
}
`
