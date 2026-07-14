import type { ReactNode } from 'react'
import { SafetyCertificateOutlined, ClusterOutlined, FileSearchOutlined } from '@ant-design/icons'
import { palette } from '@/theme/tokens'

const FEATURES = [
  { icon: <SafetyCertificateOutlined />, label: 'Centralized identity & access' },
  { icon: <ClusterOutlined />, label: 'Cross-organization automation' },
  { icon: <FileSearchOutlined />, label: 'Full audit trail' },
]

/** Shared split layout for the login and bootstrap pages: a branded panel
 * beside a bordered form card. Both columns are vertically centered and the
 * whole layout is width-capped so it doesn't stretch into a mostly-empty
 * strip on very wide screens. */
export function AuthLayout({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', maxWidth: 1560, margin: '0 auto' }}>
      <div
        style={{
          flex: '0 0 47%',
          minWidth: 420,
          position: 'relative',
          overflow: 'hidden',
          background: palette.sidebarBg,
          color: palette.sidebarText,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '56px 72px',
        }}
      >
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `radial-gradient(${palette.border} 1px, transparent 1px)`,
            backgroundSize: '26px 26px',
            maskImage: 'radial-gradient(ellipse 90% 70% at 30% 40%, black 0%, transparent 75%)',
            WebkitMaskImage: 'radial-gradient(ellipse 90% 70% at 30% 40%, black 0%, transparent 75%)',
            opacity: 0.5,
            pointerEvents: 'none',
          }}
        />
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: '-18%',
            left: '-12%',
            width: 620,
            height: 620,
            borderRadius: '50%',
            background: `radial-gradient(circle, ${palette.accentSoft} 0%, transparent 70%)`,
            pointerEvents: 'none',
          }}
        />

        <div style={{ position: 'relative' }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              borderRadius: 999,
              background: palette.accentSoft,
              color: palette.accent,
              padding: '6px 14px',
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              marginBottom: 28,
            }}
          >
            Admin Control Plane
          </span>

          <img src="/seshat.png" alt="Seshat" width={120} height={120} style={{ objectFit: 'contain', marginBottom: 32 }} />

          <div style={{ color: '#fff', fontSize: 36, fontWeight: 700, lineHeight: 1.2, letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>
            {title}
          </div>
          <div style={{ marginTop: 14, fontSize: 16, lineHeight: 1.65, maxWidth: 400 }}>{subtitle}</div>

          <div style={{ marginTop: 36, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {FEATURES.map((feature) => (
              <div key={feature.label} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <span
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 9,
                    background: palette.accentSoft,
                    color: palette.accent,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 15,
                    flexShrink: 0,
                  }}
                >
                  {feature.icon}
                </span>
                <span style={{ fontSize: 14.5, color: palette.sidebarText }}>{feature.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ position: 'absolute', left: 72, bottom: 32, fontSize: 12, color: palette.sidebarTextMuted }}>
          Seshat admin console
        </div>
      </div>
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: palette.canvas,
          padding: 24,
        }}
      >
        <div
          style={{
            width: 440,
            background: palette.surface,
            border: `1px solid ${palette.border}`,
            borderRadius: 16,
            padding: '40px 40px 36px',
            boxShadow: '0 1px 2px rgba(0, 0, 0, 0.16), 0 8px 24px -8px rgba(0, 0, 0, 0.3)',
          }}
        >
          {children}
        </div>
      </div>
    </div>
  )
}
