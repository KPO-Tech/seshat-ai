import { Checkbox, Typography } from 'antd'
import { usePermissionsList, groupPermissionsByCategory } from '@/api/permissions'
import { palette } from '@/theme/tokens'

/** Grouped-by-category permission checklist, shared by Roles and Policy Bindings. */
export function PermissionChecklist({
  value,
  onChange,
}: {
  value?: string[]
  onChange?: (value: string[]) => void
}) {
  const { data, isLoading } = usePermissionsList()
  const permissions = data?.permissions ?? []
  const grouped = groupPermissionsByCategory(permissions)
  const selected = value ?? []

  if (isLoading) return <Typography.Text type="secondary">Loading permissions…</Typography.Text>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {Array.from(grouped.entries()).map(([category, items]) => (
        <div key={category}>
          <Typography.Text
            style={{
              fontSize: 11,
              letterSpacing: 0.04,
              textTransform: 'uppercase',
              color: palette.inkTertiary,
              fontWeight: 600,
            }}
          >
            {category}
          </Typography.Text>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
            {items.map((permission) => (
              <Checkbox
                key={permission.code}
                checked={selected.includes(permission.code!)}
                onChange={(e) => {
                  if (!onChange) return
                  onChange(
                    e.target.checked
                      ? [...selected, permission.code!]
                      : selected.filter((code) => code !== permission.code),
                  )
                }}
              >
                <span style={{ fontWeight: 500 }}>{permission.name}</span>
                {permission.description && (
                  <Typography.Text style={{ fontSize: 12, color: palette.inkTertiary, marginLeft: 6 }}>
                    {permission.description}
                  </Typography.Text>
                )}
              </Checkbox>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
