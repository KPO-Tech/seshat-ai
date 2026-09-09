import { useCallback, useRef, useState } from 'react'

export type Toast = { id: number; msg: string; kind: 'ok' | 'err' }

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([])
  const counter = useRef(0)

  const show = useCallback((msg: string, kind: Toast['kind'] = 'ok') => {
    const id = counter.current + 1
    counter.current = id
    setToasts((current) => [...current, { id, msg, kind }])
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id))
    }, 3500)
  }, [])

  return { toasts, show }
}
