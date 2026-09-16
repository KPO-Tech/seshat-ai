import { useEffect, useMemo, useState } from 'react'
import type { ToolUseBlock } from '../../lib/chatTypes'
import { formatDuration, prettyJsonOrRaw } from '../ToolDetails'

type TerminalLine = {
  id: string
  stream: 'stdout' | 'stderr' | 'system'
  text: string
}

export function TerminalLiveView({ sessionId, tool }: { sessionId?: string; tool: ToolUseBlock }) {
  const terminal = terminalData(tool)
  const [connected, setConnected] = useState(false)
  const [live, setLive] = useState<{ commandId?: string; command?: string; cwd?: string; exitCode?: number; duration?: string; lines: TerminalLine[] }>({ lines: [] })
  const visible = useMemo(() => live.lines.length > 0 ? live : terminalToLiveState(terminal), [live, terminal])
  const hasOutput = visible.lines.length > 0

  useEffect(() => {
    if (!sessionId || !window.nexus?.terminalRelay) return
    let mounted = true
    void window.nexus.terminalRelay.status(sessionId).then((status) => {
      if (mounted) setConnected(status.connected)
    }).catch(() => undefined)
    const cleanup = window.nexus.terminalRelay.onEvent(sessionId, (event) => {
      if (event.type === 'connected') {
        setConnected(true)
        return
      }
      if (event.type === 'disconnected') {
        setConnected(false)
        return
      }
      if (event.type === 'command_start') {
        if (terminal.command && event.command && event.command !== terminal.command) return
        setLive({
          commandId: event.commandId,
          command: event.command || terminal.command,
          cwd: event.cwd || terminal.cwd,
          lines: [{ id: `${event.commandId}-start`, stream: 'system', text: 'Command started' }]
        })
        return
      }
      if (event.type === 'data') {
        setLive((current) => {
          if (current.commandId && event.commandId && current.commandId !== event.commandId) return current
          return {
            ...current,
            lines: [...current.lines, {
              id: `${event.commandId}-${current.lines.length}`,
              stream: event.stream === 'stderr' ? 'stderr' : 'stdout',
              text: event.data || ''
            }]
          }
        })
        return
      }
      if (event.type === 'command_end') {
        setLive((current) => {
          if (current.commandId && event.commandId && current.commandId !== event.commandId) return current
          return {
            ...current,
            exitCode: event.exitCode,
            duration: formatMs(event.durationMs),
            lines: [...current.lines, { id: `${event.commandId}-end`, stream: 'system', text: `Finished with exit ${event.exitCode ?? 1}` }]
          }
        })
        return
      }
      if (event.type === 'error') {
        setLive((current) => ({
          ...current,
          lines: [...current.lines, { id: `error-${current.lines.length}`, stream: 'stderr', text: event.message || 'Terminal relay error' }]
        }))
      }
    })
    return () => {
      mounted = false
      cleanup()
    }
  }, [sessionId, terminal.command, terminal.cwd])

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
