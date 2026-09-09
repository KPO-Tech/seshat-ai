import type { Toast } from '../hooks/useToast'

export function ToastStack({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="cmp-toasts">
      {toasts.map((toast) => (
        <div key={toast.id} className={`cmp-toast cmp-toast--${toast.kind}`}>{toast.msg}</div>
      ))}
    </div>
  )
}
