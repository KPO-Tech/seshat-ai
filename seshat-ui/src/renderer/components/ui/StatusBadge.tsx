import type { ReactNode } from 'react'

type Variant = 'success' | 'error' | 'pending' | 'connected' | 'planned'

type Props = {
  label: string
  variant: Variant
  icon?: ReactNode
  className?: string
}

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

const VARIANT_CLASS: Record<Variant, string> = {
  success: 'text-app-success',
  error: 'text-app-error',
  pending: 'text-app-text-muted',
  connected: 'bg-[rgba(0,180,42,0.08)] text-[#00B42A]',
  planned: 'border border-[color-mix(in_srgb,var(--color-primary)_25%,transparent)] bg-[color-mix(in_srgb,var(--color-primary)_10%,transparent)] text-[10px] uppercase tracking-[0.05em] text-[var(--color-primary)]',
}

export function StatusBadge({ label, variant, icon, className }: Props) {
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-[7px] px-2.5 py-[3px] text-[11px] font-bold', VARIANT_CLASS[variant], className)}>
      {icon}
      {label}
    </span>
  )
}
