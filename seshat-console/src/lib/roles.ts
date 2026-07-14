export const ROLE_COLORS: Record<string, string> = {
  owner: 'gold',
  admin: 'orange',
  member: 'blue',
  viewer: 'default',
}

export function formatRoleLabel(value: string | undefined) {
  if (!value) return 'Unknown role'
  return value
    .split(/[_-]/g)
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join(' ')
}
