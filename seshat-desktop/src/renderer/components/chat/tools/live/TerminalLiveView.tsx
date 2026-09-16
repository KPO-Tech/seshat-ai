import { useMemo, useState } from 'react'
import { useTerminalStore, type TerminalCommandRun, type TerminalLine } from '@renderer/stores/terminal'
import type { ToolUseBlock } from '../../lib/chatTypes'
import { formatDuration, prettyJsonOrRaw } from '../ToolDetails'

export function TerminalLiveView({ sessionId, tool }: { sessionId?: string; tool: ToolUseBlock }) {
  const terminal = terminalData(tool)
  const [selectedCommandId, setSelectedCommandId] = useState<string | null>(null)
  const relaySession = useTerminalStore((state) => sessionId ? state.sessions[sessionId] : null)
  const commands = relaySession?.commands ?? []
  const liveCommand = useMemo(() => chooseCommand(commands, terminal.command, selectedCommandId), [commands, terminal.command, selectedCommandId])
  const visible = useMemo(() => liveCommand ? commandToVisible(liveCommand) : terminalToLiveState(terminal), [liveCommand, terminal])
  const hasOutput = visible.lines.length > 0
  const connected = Boolean(relaySession?.connected)

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--border-soft)] bg-[#090b0f] text-[12px] text-[#e7edf7]">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-3 py-2">
        <div className="min-w-0">
          <div className="truncate font-mono text-[12px] font-semibold text-white">{visible.command || 'Command pending'}</div>
          {visible.cwd && <div className="mt-0.5 truncate font-mono text-[10.5px] text-white/45">{visible.cwd}</div>}
        </div>
        <div className="flex shrink-0 items-center gap-2 text-[10.5px] font-semibold text-white/55">
          <span className={connected ? 'text-[var(--accent-success)]' : 'text-white/35'}>{connected ? 'live' : 'local'}</span>
          {visible.duration && <span>{visible.duration}</span>}
          {typeof visible.exitCode === 'number' && (
            <span className={visible.exitCode === 0 ? 'text-[var(--accent-success)]' : 'text-[var(--accent-danger)]'}>
              exit {visible.exitCode}
            </span>
          )}
        </div>
      </div>
      {commands.length > 1 && (
        <div className="no-scrollbar flex gap-1.5 overflow-x-auto border-b border-white/10 px-3 py-2">
          {commands.slice(-8).map((command) => (
            <button
              key={command.id}
              type="button"
              onClick={() => setSelectedCommandId(command.id)}
              className={[
                'flex max-w-[220px] shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 text-left font-mono text-[10.5px]',
                command.id === liveCommand?.id ? 'border-[var(--accent-primary)]/45 bg-[var(--accent-primary)]/10 text-white' : 'border-white/10 bg-white/[0.03] text-white/55 hover:bg-white/[0.06]'
              ].join(' ')}
            >
              <span className={commandDotClass(command.status)} />
              <span className="truncate">{command.command}</span>
            </button>
          ))}
        </div>
      )}
      {hasOutput ? (
        <div className="no-scrollbar max-h-[320px] overflow-auto p-3 font-mono text-[11px] leading-5">
          {visible.lines.map((line) => (
            <pre key={line.id} className={lineClass(line.stream)}>{line.text}</pre>
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-2 px-3 py-3 font-medium text-white/55">
          <span className="size-2 rounded-full bg-[var(--accent-primary)] shadow-[0_0_10px_var(--accent-primary)]" />
          {connected ? 'Waiting for terminal output' : 'Terminal relay will attach when the session starts'}
        </div>
      )}
    </div>
  )
}

function lineClass(stream: TerminalLine['stream']) {
  if (stream === 'stderr') return 'whitespace-pre-wrap text-red-200'
  if (stream === 'system') return 'whitespace-pre-wrap text-white/38'
  return 'whitespace-pre-wrap text-white/78'
}

function terminalToLiveState(terminal: ReturnType<typeof terminalData>) {
  const lines: TerminalLine[] = []
  if (terminal.stdout) lines.push({ id: 'stdout', stream: 'stdout', text: terminal.stdout })
  if (terminal.stderr) lines.push({ id: 'stderr', stream: 'stderr', text: terminal.stderr })
  if (!terminal.stdout && !terminal.stderr && terminal.raw) lines.push({ id: 'raw', stream: 'stdout', text: terminal.raw })
  return { ...terminal, lines }
}

function chooseCommand(commands: TerminalCommandRun[], expectedCommand: string, selectedCommandId: string | null) {
  if (selectedCommandId) {
    const selected = commands.find((command) => command.id === selectedCommandId)
    if (selected) return selected
  }
  if (expectedCommand) {
    for (let index = commands.length - 1; index >= 0; index -= 1) {
      if (commands[index].command === expectedCommand) return commands[index]
    }
  }
  return commands[commands.length - 1] ?? null
}

function commandToVisible(command: TerminalCommandRun) {
  return {
    command: command.command,
    cwd: command.cwd,
    exitCode: command.exitCode,
    duration: formatMs(command.durationMs),
    lines: command.lines
  }
}

function commandDotClass(status: TerminalCommandRun['status']) {
  if (status === 'running') return 'size-1.5 shrink-0 rounded-full bg-[var(--accent-primary)] shadow-[0_0_10px_var(--accent-primary)]'
  if (status === 'completed') return 'size-1.5 shrink-0 rounded-full bg-[var(--accent-success)]'
  return 'size-1.5 shrink-0 rounded-full bg-[var(--accent-danger)]'
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
