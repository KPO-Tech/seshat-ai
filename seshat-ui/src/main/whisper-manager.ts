import { spawn, type ChildProcess } from 'child_process'
import { createWriteStream, existsSync } from 'fs'
import { mkdir, chmod, readdir, stat, readFile, writeFile, unlink } from 'fs/promises'
import { join } from 'path'
import { createServer } from 'net'
import { resolveRuntimeRoot } from './runtime'
import { callBackendAsCurrentUser } from './ipc/backend'

// Whisper.cpp has no prebuilt CLI/server binary in its GitHub releases for
// macOS today (only an xcframework meant for Xcode/Swift embedding) - local
// transcription is Windows/Linux only until that changes.
const WHISPER_RELEASE_TAG = 'v1.9.1'
const WHISPER_RELEASE_BASE = `https://github.com/ggml-org/whisper.cpp/releases/download/${WHISPER_RELEASE_TAG}`
const MODEL_BASE_URL = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main'
const READY_POLL_INTERVAL_MS = 500
const READY_TIMEOUT_MS = 30_000
const SELECTED_MODEL_FILE = 'selected-model.json'

// Multilingual, non-quantized tiers only for now - quantized (q5/q8) variants
// exist too but would clutter this first pass of the picker. Sizes are the
// real download sizes as of whisper.cpp's ggerganov/whisper.cpp HF repo.
export type WhisperModelId = 'tiny' | 'base' | 'small' | 'medium' | 'large-v3-turbo' | 'large-v3'

export type WhisperModelInfo = {
  id: WhisperModelId
  filename: string
  label: string
  approxSizeBytes: number
  description: string
}

export const MODEL_CATALOG: WhisperModelInfo[] = [
  { id: 'tiny', filename: 'ggml-tiny.bin', label: 'Tiny', approxSizeBytes: 77_700_000, description: 'Fastest, least accurate - good for quick drafts.' },
  { id: 'base', filename: 'ggml-base.bin', label: 'Base', approxSizeBytes: 148_000_000, description: 'Fast, modest accuracy.' },
  { id: 'small', filename: 'ggml-small.bin', label: 'Small', approxSizeBytes: 487_600_000, description: 'Good balance of speed and accuracy - recommended default.' },
  { id: 'medium', filename: 'ggml-medium.bin', label: 'Medium', approxSizeBytes: 1_533_800_000, description: 'High accuracy, noticeably slower.' },
  { id: 'large-v3-turbo', filename: 'ggml-large-v3-turbo.bin', label: 'Large v3 Turbo', approxSizeBytes: 1_624_600_000, description: 'Near large-v3 accuracy at roughly half the compute cost.' },
  { id: 'large-v3', filename: 'ggml-large-v3.bin', label: 'Large v3', approxSizeBytes: 3_095_000_000, description: 'Best accuracy; largest download and slowest to run.' },
]

const DEFAULT_MODEL_ID: WhisperModelId = 'small'

function modelInfo(id: WhisperModelId): WhisperModelInfo {
  return MODEL_CATALOG.find((m) => m.id === id) ?? MODEL_CATALOG.find((m) => m.id === DEFAULT_MODEL_ID)!
}

export type WhisperPhase = 'binary' | 'model'

export type WhisperProgress = {
  phase: WhisperPhase
  receivedBytes: number
  totalBytes: number
}

export type WhisperStatus = {
  supported: boolean
  downloaded: boolean
  running: boolean
  port?: number
  modelId: WhisperModelId
}

let serverProcess: ChildProcess | null = null
let serverPort: number | null = null

function whisperDir() {
  return join(resolveRuntimeRoot(), 'whisper')
}

async function readSelectedModelId(): Promise<WhisperModelId> {
  try {
    const raw = await readFile(join(whisperDir(), SELECTED_MODEL_FILE), 'utf-8')
    const parsed = JSON.parse(raw) as { modelId?: string }
    if (MODEL_CATALOG.some((m) => m.id === parsed.modelId)) {
      return parsed.modelId as WhisperModelId
    }
  } catch {
    // no selection saved yet - fall through to the default
  }
  return DEFAULT_MODEL_ID
}

async function writeSelectedModelId(id: WhisperModelId): Promise<void> {
  await mkdir(whisperDir(), { recursive: true })
  await writeFile(join(whisperDir(), SELECTED_MODEL_FILE), JSON.stringify({ modelId: id }), 'utf-8')
}

function modelPath(id: WhisperModelId) {
  return join(whisperDir(), modelInfo(id).filename)
}

type PlatformAsset = {
  archiveName: string
  binaryRelPath: string
}

function platformAsset(): PlatformAsset | null {
  if (process.platform === 'win32') {
    return { archiveName: 'whisper-bin-x64.zip', binaryRelPath: 'Release/whisper-server.exe' }
  }
  if (process.platform === 'linux') {
    if (process.arch === 'arm64') {
      return { archiveName: 'whisper-bin-ubuntu-arm64.tar.gz', binaryRelPath: 'whisper-bin-ubuntu-arm64/whisper-server' }
    }
    return { archiveName: 'whisper-bin-ubuntu-x64.tar.gz', binaryRelPath: 'whisper-bin-ubuntu-x64/whisper-server' }
  }
  return null
}

function serverBinaryPath(): string | null {
  const asset = platformAsset()
  if (!asset) return null
  return join(whisperDir(), 'bin', asset.binaryRelPath)
}

export function isWhisperSupported(): boolean {
  return platformAsset() !== null
}

export async function getWhisperStatus(): Promise<WhisperStatus> {
  const binaryPath = serverBinaryPath()
  const modelId = await readSelectedModelId()
  const downloaded = !!binaryPath && existsSync(binaryPath) && existsSync(modelPath(modelId))
  return {
    supported: isWhisperSupported(),
    downloaded,
    running: serverProcess != null,
    port: serverPort ?? undefined,
    modelId,
  }
}

async function downloadToFile(url: string, destPath: string, phase: WhisperPhase, onProgress?: (p: WhisperProgress) => void) {
  const res = await fetch(url)
  if (!res.ok || !res.body) {
    throw new Error(`download failed (${res.status}): ${url}`)
  }
  const totalBytes = Number(res.headers.get('content-length') ?? 0)
  let receivedBytes = 0

  await mkdir(join(destPath, '..'), { recursive: true })
  const fileStream = createWriteStream(destPath)
  const reader = res.body.getReader()
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      receivedBytes += value.byteLength
      await new Promise<void>((resolve, reject) => {
        fileStream.write(value, (err) => (err ? reject(err) : resolve()))
      })
      onProgress?.({ phase, receivedBytes, totalBytes })
    }
  } finally {
    reader.releaseLock()
    await new Promise<void>((resolve) => fileStream.end(resolve))
  }
}

function extractArchive(archivePath: string, destDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('tar', ['-xf', archivePath, '-C', destDir])
    let stderr = ''
    child.stderr?.on('data', (chunk) => { stderr += chunk.toString() })
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`tar extraction failed (code ${code}): ${stderr}`))
    })
  })
}

async function ensureBinaryDownloaded(onProgress?: (p: WhisperProgress) => void): Promise<void> {
  const asset = platformAsset()
  if (!asset) {
    throw new Error('Local transcription is not available on this platform yet.')
  }
  const binaryPath = serverBinaryPath()
  if (binaryPath && existsSync(binaryPath)) return

  const dir = whisperDir()
  const binDir = join(dir, 'bin')
  await mkdir(binDir, { recursive: true })

  const archivePath = join(dir, asset.archiveName)
  await downloadToFile(`${WHISPER_RELEASE_BASE}/${asset.archiveName}`, archivePath, 'binary', onProgress)
  await extractArchive(archivePath, binDir)
  await unlink(archivePath).catch(() => {})

  const resolvedBinaryPath = join(binDir, asset.binaryRelPath)
  if (!existsSync(resolvedBinaryPath)) {
    throw new Error(`whisper-server binary not found after extraction (expected at ${resolvedBinaryPath})`)
  }
  if (process.platform !== 'win32') {
    await chmod(resolvedBinaryPath, 0o755)
    // Shared libraries in the same folder also need to stay executable/readable;
    // tar preserves their original perms, but be defensive on stricter umasks.
    const siblingDir = join(resolvedBinaryPath, '..')
    const entries = await readdir(siblingDir).catch(() => [])
    for (const entry of entries) {
      const full = join(siblingDir, entry)
      const info = await stat(full).catch(() => null)
      if (info?.isFile()) await chmod(full, 0o755).catch(() => {})
    }
  }
}

async function ensureModelDownloaded(id: WhisperModelId, onProgress?: (p: WhisperProgress) => void): Promise<void> {
  const path = modelPath(id)
  if (existsSync(path)) return
  await downloadToFile(`${MODEL_BASE_URL}/${modelInfo(id).filename}`, path, 'model', onProgress)
}

/**
 * Downloads the platform's whisper-server binary (if not already present)
 * plus the given model (if not already present), and records it as the
 * selected model. Only one model is kept on disk at a time - see
 * switchModel for changing the selection later.
 */
export async function downloadWhisper(modelId: WhisperModelId = DEFAULT_MODEL_ID, onProgress?: (p: WhisperProgress) => void): Promise<void> {
  await ensureBinaryDownloaded(onProgress)
  await ensureModelDownloaded(modelId, onProgress)
  await writeSelectedModelId(modelId)
}

/**
 * Switches to a different model: stops the server if it's running, removes
 * the previously selected model file (single-model-at-a-time storage - the
 * large tiers are multiple GB, not worth keeping several around), downloads
 * the new one if needed, and restarts the server if it had been running.
 */
export async function switchModel(modelId: WhisperModelId, onProgress?: (p: WhisperProgress) => void): Promise<void> {
  const previous = await readSelectedModelId()
  const wasRunning = serverProcess != null
  if (wasRunning) {
    stopWhisperServerProcess()
  }

  await ensureModelDownloaded(modelId, onProgress)
  await writeSelectedModelId(modelId)

  if (previous !== modelId) {
    const previousPath = modelPath(previous)
    if (existsSync(previousPath)) {
      await unlink(previousPath).catch(() => {})
    }
  }

  if (wasRunning) {
    await enableLocalWhisper()
  }
}

function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.unref()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : null
      server.close(() => {
        if (port) resolve(port)
        else reject(new Error('could not determine a free port'))
      })
    })
  })
}

async function waitUntilReady(port: number): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/`, { method: 'GET' })
      // whisper-server answers on any route (even 404s for GET /) once it's
      // actually listening; a thrown fetch error means "not up yet".
      if (res) return
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, READY_POLL_INTERVAL_MS))
  }
  throw new Error('whisper-server did not become ready in time')
}

/** Spawns whisper-server (if not already running) and tells seshat-backend where it is. */
export async function enableLocalWhisper(): Promise<void> {
  if (serverProcess) return

  const binaryPath = serverBinaryPath()
  const status = await getWhisperStatus()
  if (!status.supported || !binaryPath || !status.downloaded) {
    throw new Error('whisper.cpp is not downloaded yet.')
  }

  const port = await findFreePort()
  const logPath = join(whisperDir(), 'whisper-server.log')
  const logStream = createWriteStream(logPath, { flags: 'a' })

  const child = spawn(binaryPath, [
    '--model', modelPath(status.modelId),
    '--host', '127.0.0.1',
    '--port', String(port),
  ], {
    stdio: ['ignore', 'pipe', 'pipe'],
    cwd: join(binaryPath, '..'),
  })
  child.stdout?.pipe(logStream)
  child.stderr?.pipe(logStream)
  child.on('exit', (code, signal) => {
    logStream.write(`[whisper-manager] whisper-server exited (code=${code}, signal=${signal})\n`)
    if (serverProcess === child) {
      serverProcess = null
      serverPort = null
    }
  })

  serverProcess = child
  serverPort = port

  try {
    await waitUntilReady(port)
  } catch (error) {
    child.kill('SIGTERM')
    serverProcess = null
    serverPort = null
    throw error
  }

  await callBackendAsCurrentUser('/settings/local-stt', 'PUT', {
    enabled: true,
    base_url: `http://127.0.0.1:${port}`,
  })
}

/** Stops whisper-server (if running) and tells seshat-backend to fall back to cloud. */
export async function disableLocalWhisper(): Promise<void> {
  stopWhisperServerProcess()
  await callBackendAsCurrentUser('/settings/local-stt', 'PUT', { enabled: false, base_url: '' }).catch(() => {})
}

/** Best-effort kill with no backend call - used on app quit and before switching models. */
export function stopWhisperServerProcess(): void {
  if (!serverProcess) return
  const child = serverProcess
  serverProcess = null
  serverPort = null
  child.kill('SIGTERM')
  const forceKillTimer = setTimeout(() => {
    if (!child.killed) child.kill('SIGKILL')
  }, 5_000)
  child.once('exit', () => clearTimeout(forceKillTimer))
}
