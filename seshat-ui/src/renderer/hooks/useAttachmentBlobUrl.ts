import { useEffect, useState } from 'react'
import { api } from '@/api/client'

// Fetches an attachment's raw bytes (authenticated — see api.getBlob) and
// exposes them as a browser object URL suitable for <img src>, an <iframe>,
// or a download link. Revokes the URL on unmount/fileId change so blob
// memory doesn't accumulate as the user scrolls through a long conversation.
export function useAttachmentBlobUrl(fileId: string | undefined): { url: string | null; error: boolean; loading: boolean } {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(Boolean(fileId))

  useEffect(() => {
    if (!fileId) {
      setUrl(null)
      setError(false)
      setLoading(false)
      return
    }
    let cancelled = false
    let objectUrl: string | null = null
    setLoading(true)
    setError(false)
    api
      .getBlob(`/files/${fileId}/content`)
      .then((blob) => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(blob)
        setUrl(objectUrl)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [fileId])

  return { url, error, loading }
}
