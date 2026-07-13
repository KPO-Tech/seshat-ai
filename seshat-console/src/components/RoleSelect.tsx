import { Select } from 'antd'
import { useRolesList } from '@/api/roles'

/** Picks a role code (system or custom) for the given organization. */
export function RoleSelect({
  organizationId,
  value,
  onChange,
  placeholder,
}: {
  organizationId: string | undefined
  value?: string
  onChange?: (value: string) => void
  placeholder?: string
}) {
  const { data } = useRolesList(organizationId)
  const roles = data?.roles ?? []
  return (
    <Select
      value={value}
      onChange={onChange}
      placeholder={placeholder ?? 'Select a role'}
      options={roles.map((role) => ({
        value: role.code,
        label: role.system ? `${role.name} (system)` : role.name,
      }))}
    />
  )
}
