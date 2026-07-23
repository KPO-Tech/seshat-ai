import { Select } from 'antd'
import { useGroupsList } from '@/api/groups'

/**
 * Picks zero or more group (team) IDs within one organization - the inverse
 * of UserMultiSelect (which picks people for a group; this picks groups for
 * a person). Used by the "create member" flow to attach a brand-new member
 * to one or more teams in the same step.
 */
export function GroupMultiSelect({
  organizationId,
  value,
  onChange,
  placeholder,
}: {
  organizationId: string | undefined
  value?: string[]
  onChange?: (value: string[]) => void
  placeholder?: string
}) {
  const { data } = useGroupsList(organizationId, { limit: 200, sort: 'name', order: 'asc' })
  const groups = data?.groups ?? []
  const options = groups.map((group) => ({ value: group.id!, label: group.name }))

  return (
    <Select
      mode="multiple"
      value={value}
      onChange={onChange}
      showSearch
      allowClear
      optionFilterProp="label"
      options={options}
      placeholder={placeholder ?? 'No teams (optional)'}
      disabled={!organizationId}
    />
  )
}
