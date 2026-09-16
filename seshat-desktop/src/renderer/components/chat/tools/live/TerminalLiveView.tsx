import type { ToolUseBlock } from '../../lib/chatTypes'
import { formatDuration, prettyJsonOrRaw } from '../ToolDetails'

export function TerminalLiveView({ tool }: { tool: ToolUseBlock }) {
  const terminal = terminalData(tool)
  const hasOutput = Boolean(terminal.stdout || terminal.stderr || terminal.raw)

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--border-soft)] bg-[#090b0f] text-[12px] text-[#e7edf7]">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-3 py-2">
        <div className="min-w-0">
          <div className="truncate font-mono text-[12px] font-semibold text-white">{terminal.command || 'Command pending'}</div>
          {terminal.cwd && <div className="mt-0.5 truncate font-mono text-[10.5px] text-white/45">{terminal.cwd}</div>}
        </div>
        <div className="flex shrink-0 items-center gap-2 text-[10.5px] font-semibold text-white/55">
          {terminal.duration && <span>{terminal.duration}</span>}
          {typeof terminal.exitCode === 'number' && (
            <span className={terminal.exitCode === 0 ? 'text-[var(--accent-success)]' : 'text-[var(--accent-danger)]'}>
              exit {terminal.exitCode}
            </span>
          )}
        </div>
      </div>
      {hasOutput ? (
        <div className="no-scrollbar max-h-[320px] overflow-auto p-3 font-mono text-[11px] leading-5">
          {terminal.stdout && <TerminalStream label="stdout" value={terminal.stdout} />}
          {terminal.stderr && <TerminalStream label="stderr" value={terminal.stderr} danger />}
          {!terminal.stdout && !terminal.stderr && terminal.raw && <pre className="whitespace-pre-wrap text-white/75">{terminal.raw}</pre>}
        </div>
      ) : (
        <div className="flex items-center gap-2 px-3 py-3 font-medium text-white/55">
          <span className="size-2 rounded-full bg-[var(--accent-primary)] shadow-[0_0_10px_var(--accent-primary)]" />
          Waiting for terminal output
        </div>
      )}
    </div>
  )
}

function TerminalStream({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return (
    <section className="mb-3 last:mb-0">
      <div className={['mb-1 text-[10px] font-semibold uppercase', danger ? 'text-[var(--accent-danger)]' : 'text-white/35'].join(' ')}>
        {label}
      </div>
      <pre className={['whitespace-pre-wrap', danger ? 'text-red-200' : 'text-white/78'].join(' ')}>{value}</pre>
    </section>
  )
}

function terminalData(tool: ToolUseBlock) {
  const parsed = parseTerminalResult(tool._result?.content)
  const input = { ...tool.input, ...tool._progress?.input }
  const metadata = { ...tool._result?.metadata, ...tool._progress?.metadata }
  const command = text(input.command) || text(input.cmd) || parsed.command
  const cwd = text(input.cwd) || text(input.working_dir) || text(input.working_directory) || parsed.cwd
  const stdout = text(metadata.stdout) || parsed.stdout
  const stderr = text(metadata.stderr) || parsed.stderr
  const exitCode = number(metadata.exit_code) ?? number(metadata.exitCode) ?? parsed.exitCode
  const raw = parsed.raw || prettyJsonOrRaw(tool._result?.content ?? tool._progress?.result ?? '')

  return {
    command,
    cwd,
    stdout,
    stderr,
    exitCode,
    raw,
    duration: formatDuration(tool._result) || formatMs(tool._progress?.durationMs)
  }
}

function parseTerminalResult(value?: string) {
  if (!value) return { command: '', cwd: '', stdout: '', stderr: '', exitCode: undefined as number | undefined, raw: '' }
  const trimmed = value.trim()
  if (!trimmed) return { command: '', cwd: '', stdout: '', stderr: '', exitCode: undefined as number | undefined, raw: '' }

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>
    return {
      command: text(parsed.command),
      cwd: text(parsed.cwd),
      stdout: text(parsed.stdout),
      stderr: text(parsed.stderr),
      exitCode: number(parsed.exit_code) ?? number(parsed.exitCode),
      raw: ''
    }
  } catch {
    return { command: '', cwd: '', stdout: '', stderr: '', exitCode: parseExitCode(trimmed), raw: trimmed }
  }
}

function text(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function number(value: unknown) {
  return typeof value === 'number' ? value : undefined
}

function parseExitCode(value: string) {
  const match = value.match(/exit(?: code)?[:=]\s*(-?\d+)/i)
  return match ? Number(match[1]) : undefined
}

function formatMs(value?: number) {
  if (typeof value !== 'number') return ''
  return value < 1000 ? `${value}ms` : `${(value / 1000).toFixed(1)}s`
}
