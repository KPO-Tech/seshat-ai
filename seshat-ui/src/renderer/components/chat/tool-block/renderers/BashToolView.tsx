import { CodeBox, Section } from '../common'
import { fmtDuration, parseBashResult } from '../helpers'
import type { ToolViewProps } from '../types'

export function BashToolView({ tool, result }: ToolViewProps) {
  const command = (tool.input.command as string) ?? ''
  const parsed = parseBashResult(result)

  return (
    <>
      <Section label="Command">
        <CodeBox content={command} language="bash" />
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

      {parsed != null && parsed.exitCode != null && (
        <div className="tb-footer">
          <span>Exit code: {parsed.exitCode}</span>
          {result?.durationMs != null && <span>Duration: {fmtDuration(result.durationMs)}</span>}
        </div>
      )}

      {/* Covers both a real failed execution (non-zero exit, stderr already
          shown above) and a command blocked before it ever ran (denied
          permission, sandbox rejection) - in that second case there's no
          stdout/stderr/exit_code at all, just this message, and it's the
          only place the reason for the failure is visible. */}
      {result?.isError && result.content && (
        <Section label="Error">
          <pre className="tb-pre tb-pre--error">{result.content}</pre>
        </Section>
      )}
    </>
  )
}
