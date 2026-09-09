type StatusTileProps = {
  label: string
  value: string
  tone?: 'ok' | 'bad'
}

export function StatusTile({ label, value, tone }: StatusTileProps) {
  return (
    <div className={`ib-status-tile ${tone ?? ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}
