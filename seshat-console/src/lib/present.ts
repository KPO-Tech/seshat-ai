export function presentText(value: string | null | undefined, fallback = 'Not set') {
  return value && value.trim().length > 0 ? value : fallback
}

export function presentDateTime(value: string | null | undefined, fallback = 'Not scheduled') {
  return value ? new Date(value).toLocaleString() : fallback
}
