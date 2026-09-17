#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const target = process.argv[2]
const arch = process.argv[3] || 'amd64'

const targets = {
  windows: { goos: 'windows', ext: '.exe' },
  win: { goos: 'windows', ext: '.exe' },
  linux: { goos: 'linux', ext: '' },
  darwin: { goos: 'darwin', ext: '' },
  mac: { goos: 'darwin', ext: '' },
}

const selected = targets[target]
if (!selected) {
  console.error('Usage: node scripts/build-desktop-sidecar.mjs <windows|linux|darwin> [amd64|arm64]')
  process.exit(2)
}

const outDir = resolve(repoRoot, 'seshat-desktop', 'resources', 'backend')
const outPath = resolve(outDir, `seshat-backend${selected.ext}`)
mkdirSync(outDir, { recursive: true })

// electron-builder's extraResources bundles every file in outDir as-is, and
// Linux/macOS binaries share the exact same filename ("seshat-backend", no
// extension) — see resources/backend/README.md. Without this cleanup, a
// stray binary from a previous build for a different platform can either
// silently overwrite the wrong content (linux <-> darwin, same filename) or
// linger alongside the new one and get bundled into an installer that will
// never run it (e.g. a leftover Linux ELF shipped inside the Windows NSIS
// package). Remove every other-platform output before building this one, so
// outDir always contains exactly one binary: the one just built.
for (const other of Object.values(targets)) {
  if (other === selected) continue
  const otherPath = resolve(outDir, `seshat-backend${other.ext}`)
  if (otherPath !== outPath) {
    rmSync(otherPath, { force: true })
  }
}

const result = spawnSync('go', ['build', '-o', outPath, './cmd/api'], {
  cwd: resolve(repoRoot, 'seshat-backend'),
  stdio: 'inherit',
  env: {
    ...process.env,
    CGO_ENABLED: process.env.CGO_ENABLED || '0',
    GOOS: selected.goos,
    GOARCH: arch,
  },
})

if (result.status !== 0) {
  process.exit(result.status ?? 1)
}

console.log(`Built ${selected.goos}/${arch} sidecar: ${outPath}`)
