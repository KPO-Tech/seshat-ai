import assert from 'node:assert/strict'
import test from 'node:test'
import { join, resolve } from 'node:path'
import {
  assertLocalFilePath,
  assertUploadPayloadShape,
  normalizeAPIPath,
  normalizeSecretKey,
  sanitizeSaveFileInput,
} from './validation.js'

test('normalizeAPIPath accepts relative API paths only', () => {
  assert.equal(normalizeAPIPath('/files/abc/content?preview=1'), '/files/abc/content?preview=1')
  assert.throws(() => normalizeAPIPath('https://example.com/api'), /must start with/)
  assert.throws(() => normalizeAPIPath('//example.com/api'), /must not be absolute/)
  assert.throws(() => normalizeAPIPath('/files\\abc'), /forward slashes/)
  assert.throws(() => normalizeAPIPath('/files/\nabc'), /unsupported characters/)
})

test('assertLocalFilePath rejects URLs, empty values, relative paths, and null bytes', () => {
  const absolute = resolve('sample.png')
  assert.equal(assertLocalFilePath(absolute), absolute)
  assert.equal(assertLocalFilePath(join(process.cwd(), 'sample.png')), join(process.cwd(), 'sample.png'))
  assert.throws(() => assertLocalFilePath('https://example.com/file.png'), /not a URL/)
  assert.throws(() => assertLocalFilePath('relative/file.png'), /must be absolute/)
  assert.throws(() => assertLocalFilePath(`${absolute}\0.png`), /null bytes/)
  assert.throws(() => assertLocalFilePath(''), /non-empty string/)
})

test('sanitizeSaveFileInput keeps save dialogs filename-only and string-only', () => {
  assert.deepEqual(sanitizeSaveFileInput('report.md', '# Report'), { defaultName: 'report.md', content: '# Report' })
  assert.throws(() => sanitizeSaveFileInput('../report.md', 'x'), /path separators/)
  assert.throws(() => sanitizeSaveFileInput('nested/report.md', 'x'), /path separators/)
  assert.throws(() => sanitizeSaveFileInput('report.md', Buffer.from('x')), /must be a string/)
})

test('normalizeSecretKey limits renderer-controlled secure-store keys', () => {
  assert.equal(normalizeSecretKey('auth-session'), 'auth-session')
  assert.equal(normalizeSecretKey('provider:openai.token'), 'provider:openai.token')
  assert.throws(() => normalizeSecretKey('../auth-session'), /unsupported characters/)
  assert.throws(() => normalizeSecretKey('auth session'), /unsupported characters/)
  assert.throws(() => normalizeSecretKey(''), /non-empty string/)
})

test('assertUploadPayloadShape rejects malformed upload envelopes', () => {
  assert.doesNotThrow(() => assertUploadPayloadShape({ path: '/files', fields: [], files: [] }))
  assert.doesNotThrow(() => assertUploadPayloadShape({ path: '/files' }))
  assert.throws(() => assertUploadPayloadShape(null), /must be an object/)
  assert.throws(() => assertUploadPayloadShape({ fields: 'bad' }), /fields must be an array/)
  assert.throws(() => assertUploadPayloadShape({ files: 'bad' }), /files must be an array/)
})
