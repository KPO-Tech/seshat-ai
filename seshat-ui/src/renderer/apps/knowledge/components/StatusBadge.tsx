export function StatusBadge({ status }: { status: string }) {
  const tone = status === 'ingested' || status === 'completed'
    ? 'ok'
    : status === 'failed'
      ? 'bad'
      : 'wait'
  return <span className={`k-badge ${tone}`}>{status}</span>
}
