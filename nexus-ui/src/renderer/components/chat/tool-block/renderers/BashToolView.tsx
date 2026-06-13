import { CodeBox, Section } from '../common'
import { fmtDuration, parseBashResult } from '../helpers'
import type { ToolViewProps } from '../types'

export function BashToolView({ tool, result }: ToolViewProps) {
  const command = (tool.input.command as string) ?? ''
  const parsed = parseBashResult(result)

  return (
    <>
      <Section label="Command">
        <CodeBox content={command} />
      </Section>

      {parsed?.stdout != null && (
        <Section label="Output">
          <CodeBox content={parsed.stdout} copyable />
        </Section>
      )}

      {parsed?.stderr && (
        <Section label="Errors">
          <CodeBox content={parsed.stderr} variant="error" copyable />
        </Section>
      )}

      {parsed != null && (
        <div className="tb-footer">
          <span>Exit code: {parsed.exitCode ?? '?'}</span>
          {result?.durationMs != null && <span>Duration: {fmtDuration(result.durationMs)}</span>}
        </div>
      )}
    </>
  )
}
