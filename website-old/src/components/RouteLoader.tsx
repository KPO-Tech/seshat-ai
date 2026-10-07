type RouteLoaderProps = {
  label?: string
}

export default function RouteLoader({ label = 'Loading…' }: RouteLoaderProps) {
  return (
    <div
      style={{
        padding: '3rem 1.5rem',
        color: 'var(--text-muted)',
        fontSize: '0.95rem',
        letterSpacing: '0.01em',
      }}
    >
      {label}
    </div>
  )
}
