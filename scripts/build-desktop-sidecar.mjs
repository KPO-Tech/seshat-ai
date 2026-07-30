#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
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

const outDir = resolve(repoRoot, 'seshat-ui', 'resources', 'backend')
const outPath = resolve(outDir, `seshat-backend${selected.ext}`)
mkdirSync(outDir, { recursive: true })

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
