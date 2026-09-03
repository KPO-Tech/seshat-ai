import type { CSSProperties } from 'react'
import { Select } from 'antd'
import { useRolesList } from '@/api/roles'

/** Picks a role code (system or custom) for the given organization. */
export function RoleSelect({
  organizationId,
  value,
  onChange,
  placeholder,
  style,
  size,
}: {
  organizationId: string | undefined
  value?: string
  onChange?: (value: string) => void
  placeholder?: string
  style?: CSSProperties
  size?: 'small' | 'middle' | 'large'
}) {
  const { data } = useRolesList(organizationId)
  const roles = data?.roles ?? []
  return (
    <Select
      value={value}
      onChange={onChange}
      placeholder={placeholder ?? 'Select a role'}
      style={style}
      size={size}
      options={roles.map((role) => ({
        value: role.code,
        label: role.system ? `${role.name} (system)` : role.name,
      }))}
    />
  )
}
