import { spawn, type ChildProcess } from 'child_process'
import { createWriteStream } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { setDynamicBackendOrigin } from './runtime'

const READY_LINE = /^SESHAT_BACKEND_READY port=(\d+)/
const READY_TIMEOUT_MS = 15_000
const CDP_DISCOVERY_TIMEOUT_MS = 1500

let backendProcess: ChildProcess | null = null

function backendBinaryName() {
  return process.platform === 'win32' ? 'seshat-backend.exe' : 'seshat-backend'
}

function resolveBackendBinaryPath() {
  return join(process.resourcesPath, 'backend', backendBinaryName())
}

/**
 * Starts the bundled seshat-backend sidecar and waits for it to report the
 * port it actually bound to (it falls back to an OS-assigned free port if
 * its preferred one is taken — see cmd/api/main.go's `listen()`).
 *
 * In dev mode (unpackaged, running via electron-vite), this is a no-op:
 * the developer runs seshat-backend manually, exactly as before, and
 * resolveBackendOrigin() falls through to its existing default/env-var
 * behavior since setDynamicBackendOrigin is never called.
 */
export async function startBackendSidecar(): Promise<void> {
  if (!app.isPackaged) {
    return
  }

  const binaryPath = resolveBackendBinaryPath()
  const logPath = join(app.getPath('logs'), 'backend-sidecar.log')
  const logStream = createWriteStream(logPath, { flags: 'a' })
  const env = { ...process.env }
  if (!env.SESHAT_BROWSER_REMOTE_CONTROL_URL) {
    const browserControlURL = await resolveElectronBrowserControlURL()
    if (browserControlURL) {
      env.SESHAT_BROWSER_REMOTE_CONTROL_URL = browserControlURL
    }
  }

  const child = spawn(binaryPath, [], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env,
  })
  backendProcess = child

  child.stderr.pipe(logStream)
  child.on('error', (err) => {
    logStream.write(`[backend-process] spawn error: ${err.message}\n`)
  })
  child.on('exit', (code, signal) => {
    logStream.write(`[backend-process] exited (code=${code}, signal=${signal})\n`)
  })

  const port = await waitForReadyPort(child, logStream)
  setDynamicBackendOrigin(`http://127.0.0.1:${port}`)
}

async function resolveElectronBrowserControlURL(): Promise<string | null> {
  const port = Number.parseInt(process.env.SESHAT_ELECTRON_REMOTE_DEBUG_PORT || '', 10)
  if (!Number.isFinite(port) || port <= 0) return null
  try {
    const response = await fetch(`http://127.0.0.1:${port}/json/version`, {
      signal: AbortSignal.timeout(CDP_DISCOVERY_TIMEOUT_MS),
    })
    if (!response.ok) return null
    const payload = await response.json() as { webSocketDebuggerUrl?: unknown }
    return typeof payload.webSocketDebuggerUrl === 'string' ? payload.webSocketDebuggerUrl : null
  } catch {
    return null
  }
}

function waitForReadyPort(child: ChildProcess, logStream: NodeJS.WritableStream): Promise<number> {
  return new Promise((resolve, reject) => {
    let buffer = ''
    let settled = false

    const timeout = setTimeout(() => {
      if (settled) return
      settled = true
      cleanup()
      reject(new Error(`seshat-backend did not report a ready port within ${READY_TIMEOUT_MS}ms`))
    }, READY_TIMEOUT_MS)

    function onData(chunk: Buffer) {
      buffer += chunk.toString('utf-8')
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        logStream.write(line + '\n')
        const match = READY_LINE.exec(line.trim())
        if (match && !settled) {
          settled = true
          cleanup()
          resolve(Number(match[1]))
          return
        }
      }
    }

    function onExit(code: number | null, signal: NodeJS.Signals | null) {
      if (settled) return
      settled = true
      cleanup()
      reject(new Error(`seshat-backend exited before becoming ready (code=${code}, signal=${signal})`))
    }

    function cleanup() {
      clearTimeout(timeout)
      child.stdout?.off('data', onData)
      child.off('exit', onExit)
    }

    child.stdout?.on('data', onData)
    child.on('exit', onExit)
  })
}

/** Kills the sidecar, if running. Called on app quit to avoid orphaning it. */
export function stopBackendSidecar(): void {
  if (!backendProcess) return
  const child = backendProcess
  backendProcess = null
  child.kill('SIGTERM')
  const forceKillTimer = setTimeout(() => {
    if (!child.killed) child.kill('SIGKILL')
  }, 5_000)
  child.once('exit', () => clearTimeout(forceKillTimer))
}
