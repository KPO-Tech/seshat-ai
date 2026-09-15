const SECRET_KEY_PATTERN = /^[a-zA-Z0-9:_-]{1,120}$/

export function normalizeSecretKey(key: string): string {
  const trimmed = key.trim()
  if (!SECRET_KEY_PATTERN.test(trimmed)) {
    throw new Error('Invalid secret key')
  }
  return trimmed
}
