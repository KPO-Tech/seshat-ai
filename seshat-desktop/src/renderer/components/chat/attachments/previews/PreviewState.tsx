export function DocumentPreviewState({ label, error = false }: { label: string; error?: boolean }) {
  return (
    <div className={`absolute inset-0 flex items-center justify-center bg-[var(--surface-panel)] px-8 text-center text-[12px] ${error ? 'text-[var(--accent-danger)]' : 'text-[var(--text-muted)]'}`}>
      {label}
    </div>
  )
}
