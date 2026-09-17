const SECRET_KEY_PATTERN = /^[a-zA-Z0-9:_-]{1,120}$/
const SESSION_UPLOAD_PATH_PATTERN = /^\/sessions\/[a-zA-Z0-9%._~-]+\/files$/
const FILE_CONTENT_PATH_PATTERN = /^\/files\/[a-zA-Z0-9%._~-]+\/(content|markdown)$/

export function normalizeSecretKey(key: string): string {
  const trimmed = key.trim()
  if (!SECRET_KEY_PATTERN.test(trimmed)) {
    throw new Error('Invalid secret key')
  }
  return trimmed
}

export function normalizeSessionUploadPath(path: string): string {
  const trimmed = path.trim()
  if (!SESSION_UPLOAD_PATH_PATTERN.test(trimmed)) throw new Error('Invalid session upload path')
  return trimmed
}

export function normalizeFileContentPath(path: string): string {
  const trimmed = path.trim()
  if (!FILE_CONTENT_PATH_PATTERN.test(trimmed)) throw new Error('Invalid file content path')
  return trimmed
}
