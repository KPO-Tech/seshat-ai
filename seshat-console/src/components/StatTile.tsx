import { Card, Skeleton, Typography } from 'antd'
import type { ReactNode } from 'react'
import { palette } from '@/theme/tokens'

export function StatTile({
  label,
  value,
  icon,
  loading,
}: {
  label: string
  value: number | undefined
  icon: ReactNode
  loading?: boolean
}) {
  return (
    <Card styles={{ body: { padding: '18px 20px' } }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            background: palette.accentSoft,
            color: palette.accent,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 18,
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
        <div>
          <Typography.Text
            style={{
              fontSize: 12,
              letterSpacing: 0.04,
              textTransform: 'uppercase',
              color: palette.inkTertiary,
              fontWeight: 600,
            }}
          >
            {label}
          </Typography.Text>
          {loading ? (
            <Skeleton.Input active size="small" style={{ width: 60, marginTop: 4 }} />
          ) : (
            <div
              style={{
                fontSize: 26,
                fontWeight: 700,
                lineHeight: '32px',
                fontVariantNumeric: 'tabular-nums',
                color: palette.ink,
              }}
            >
              {value ?? '—'}
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}
