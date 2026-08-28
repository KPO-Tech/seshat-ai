import { Card, Skeleton, Typography } from 'antd'
import type { ReactNode } from 'react'
import { palette } from '@/theme/tokens'

export function StatTile({
  label,
  value,
  icon,
  loading,
  sublabel,
}: {
  label: string
  value: number | string | undefined
  icon: ReactNode
  loading?: boolean
  sublabel?: string
}) {
  return (
    <Card className="stat-card" styles={{ body: { padding: '18px 20px' } }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <Typography.Text
            style={{
              fontSize: 11.5,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: palette.inkTertiary,
              fontWeight: 600,
              display: 'block',
              marginBottom: 4,
            }}
          >
            {label}
          </Typography.Text>
          {loading ? (
            <Skeleton.Input active size="small" style={{ width: 60, marginTop: 4 }} />
          ) : (
            <div
              style={{
                fontSize: 28,
                fontWeight: 700,
                lineHeight: 1.15,
                letterSpacing: '-0.02em',
                fontVariantNumeric: 'tabular-nums',
                color: palette.ink,
              }}
            >
              {value ?? 0}
            </div>
          )}
          {sublabel && (
            <div style={{ fontSize: 12, color: palette.inkSecondary, marginTop: 6 }}>
              {sublabel}
            </div>
          )}
        </div>

        <div
          style={{
            width: 42,
            height: 42,
            borderRadius: 10,
            background: palette.accentSoft,
            border: `1px solid ${palette.accentSoftBorder}`,
            color: palette.accentHover,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 19,
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
      </div>
    </Card>
  )
}

