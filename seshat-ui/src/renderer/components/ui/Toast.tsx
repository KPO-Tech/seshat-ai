import { useCallback, useRef, useState } from 'react'

export type Toast = { id: number; msg: string; kind: 'ok' | 'err' | 'info' }

// First genuinely shared toast in the app - previously the only precedent
// was the companion app's own local, non-shared useToast/ToastStack
// (apps/companion/hooks/useToast.ts). Same shape, lifted here so other
// surfaces (compaction notices in Conversation.tsx, and any future caller)
// don't have to re-invent it.
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

export function ToastStack({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="ui-toasts">
      {toasts.map((toast) => (
        <div key={toast.id} className={`ui-toast ui-toast--${toast.kind}`}>{toast.msg}</div>
      ))}
    </div>
  )
}

export const TOAST_CSS = `
.ui-toasts {
  position: fixed;
  bottom: 24px;
  right: 24px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 2000;
}
.ui-toast {
  padding: 10px 16px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  box-shadow: var(--shadow-medium);
  animation: ui-toast-slide-in 0.2s ease;
}
.ui-toast--ok {
  background: var(--color-surface);
  border: 1px solid rgba(var(--color-success-rgb), 0.4);
  color: var(--color-success);
}
.ui-toast--err {
  background: var(--color-surface);
  border: 1px solid rgba(var(--color-error-rgb), 0.4);
  color: var(--color-error);
}
.ui-toast--info {
  background: var(--color-surface);
  border: 1px solid var(--color-border-subtle);
  color: var(--color-text-secondary);
}
@keyframes ui-toast-slide-in {
  from { opacity: 0; transform: translateX(12px); }
  to   { opacity: 1; transform: translateX(0); }
}
`
