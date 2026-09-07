import type { OnErrorMode } from './types'

export type RetrySettingsValue = {
  retryOnFail?: boolean
  maxTries?: number
  waitBetweenTriesMs?: number
  onError?: OnErrorMode
}

type Props = {
  value: RetrySettingsValue
  onChange: (next: RetrySettingsValue) => void
}

const DEFAULT_MAX_TRIES = 3
const DEFAULT_WAIT_MS = 1000

// One per-node section (like PinnedOutputField) - real production behavior
// (Tier 3.1), not test/dev config, so it round-trips through convert.ts as
// Node siblings (retry_on_fail/max_tries/wait_between_tries_ms/on_error),
// not inside parameters. Mirrors n8n's own per-node
// retryOnFail/maxTries/waitBetweenTries/onError exactly - see the SDK's
// pkg/dataflow/types.go for the clamped ranges (max tries 2-5, wait 0-5000ms)
// this UI just mirrors, the engine clamps regardless of what's sent.
export function RetrySettingsField({ value, onChange }: Props) {
  const retryOnFail = !!value.retryOnFail
  const onError = value.onError ?? ''

  function toggleRetry(next: boolean) {
    onChange({
      ...value,
      retryOnFail: next,
      maxTries: value.maxTries ?? DEFAULT_MAX_TRIES,
      waitBetweenTriesMs: value.waitBetweenTriesMs ?? DEFAULT_WAIT_MS,
    })
  }

  function setMaxTries(text: string) {
    const n = Number(text)
    if (Number.isNaN(n)) return
    onChange({ ...value, maxTries: Math.min(5, Math.max(2, n)) })
  }

  function setWait(text: string) {
    const n = Number(text)
    if (Number.isNaN(n)) return
    onChange({ ...value, waitBetweenTriesMs: Math.min(5000, Math.max(0, n)) })
  }

  function setOnError(next: string) {
    onChange({ ...value, onError: next === '' ? undefined : (next as OnErrorMode) })
  }

  return (
    <div className="gf-field gf-retry-field">
      <style>{RETRY_SETTINGS_FIELD_CSS}</style>
      <label className="gf-field-checkbox">
        <input type="checkbox" checked={retryOnFail} onChange={(e) => toggleRetry(e.target.checked)} />
        Retry on fail
      </label>

      {retryOnFail && (
        <div className="gf-retry-body">
          <div className="gf-retry-row">
            <label className="gf-field-label">Max tries</label>
            <input
              className="gf-field-input"
              type="number"
              min={2}
              max={5}
              value={value.maxTries ?? DEFAULT_MAX_TRIES}
              onChange={(e) => setMaxTries(e.target.value)}
            />
          </div>
          <div className="gf-retry-row">
            <label className="gf-field-label">Wait between tries (ms)</label>
            <input
              className="gf-field-input"
              type="number"
              min={0}
              max={5000}
              value={value.waitBetweenTriesMs ?? DEFAULT_WAIT_MS}
              onChange={(e) => setWait(e.target.value)}
            />
          </div>
        </div>
      )}

      <div className="gf-retry-row gf-retry-onerror">
        <label className="gf-field-label">On error</label>
        <select className="gf-field-input" value={onError} onChange={(e) => setOnError(e.target.value)}>
          <option value="">Stop the automation</option>
          <option value="continueRegularOutput">Continue with no output</option>
          <option value="continueErrorOutput">Continue with an error output</option>
        </select>
      </div>
    </div>
  )
}

const RETRY_SETTINGS_FIELD_CSS = `
.gf-retry-field {
  padding-bottom: 10px;
  border-bottom: 1px solid var(--color-border-subtle);
}

.gf-retry-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 6px;
}

.gf-retry-row {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.gf-retry-onerror {
  margin-top: 8px;
}
`
