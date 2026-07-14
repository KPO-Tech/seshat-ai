import type { CSSProperties } from 'react'
import { Empty, Select } from 'antd'
import { useOrganizationsList } from '@/api/organizations'

export function OrganizationSelect({
  value,
  onChange,
  placeholder = 'Select an organization',
  style,
  allowClear = false,
  disabled = false,
}: {
  value?: string
  onChange?: (value: string | undefined) => void
  placeholder?: string
  style?: CSSProperties
  allowClear?: boolean
  disabled?: boolean
}) {
  const { data } = useOrganizationsList({ sort: 'name', order: 'asc', limit: 200 })
  const organizations = data?.organizations ?? []

  return (
    <Select
      placeholder={placeholder}
      style={{ minWidth: 260, ...style }}
      value={value}
      onChange={(next) => onChange?.(next)}
      allowClear={allowClear}
      disabled={disabled}
      showSearch
      optionFilterProp="label"
      notFoundContent={<Empty description="No organizations" image={Empty.PRESENTED_IMAGE_SIMPLE} />}
      options={organizations.map((org) => ({ value: org.id, label: org.name }))}
    />
  )
}
