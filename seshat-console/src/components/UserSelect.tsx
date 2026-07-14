import { AutoComplete, Select } from 'antd'
import { useUsersList } from '@/api/users'

/**
 * Picks one or more user IDs. `GET /users` is platform-admin only
 * (requireAdmin server-side) — a non-admin org owner/manager can't resolve
 * emails for arbitrary users, so this always still accepts a raw pasted
 * user_id (AutoComplete/tags mode), just without a searchable directory.
 */
function useUserOptions() {
  const { data, isError } = useUsersList({ limit: 200, sort: 'email', order: 'asc' }, { enabled: true })
  const users = data?.users ?? []
  return {
    hasDirectory: !isError && users.length > 0,
    options: users.map((user) => ({ value: user.id!, label: `${user.email} (${user.display_name})` })),
  }
}

export function UserSelect({
  value,
  onChange,
  placeholder,
  disabled,
}: {
  value?: string
  onChange?: (value: string) => void
  placeholder?: string
  disabled?: boolean
}) {
  const { hasDirectory, options } = useUserOptions()

  // With a directory, force picking a real option — an AutoComplete would
  // otherwise submit whatever the user typed (e.g. the displayed email) as
  // the value, not the id, silently failing with "user not found" server-side.
  // Without one (403 for non-admins), fall back to free-text id entry.
  if (hasDirectory) {
    return (
      <Select
        value={value}
        onChange={onChange}
        disabled={disabled}
        showSearch
        allowClear
        optionFilterProp="label"
        options={options}
        placeholder={placeholder ?? 'Search by email'}
      />
    )
  }
  return (
    <AutoComplete
      value={value}
      onChange={onChange}
      options={options}
      disabled={disabled}
      placeholder={placeholder ?? 'Paste a user ID'}
    />
  )
}

export function UserMultiSelect({
  value,
  onChange,
  placeholder,
}: {
  value?: string[]
  onChange?: (value: string[]) => void
  placeholder?: string
}) {
  const { hasDirectory, options } = useUserOptions()
  return (
    <Select
      mode={hasDirectory ? 'multiple' : 'tags'}
      value={value}
      onChange={onChange}
      showSearch
      optionFilterProp="label"
      options={options}
      placeholder={placeholder ?? (hasDirectory ? 'Search by email' : 'Paste user IDs')}
    />
  )
}
