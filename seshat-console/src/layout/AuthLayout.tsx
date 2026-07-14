import type { ReactNode } from 'react'
import { palette } from '@/theme/tokens'

const FEATURES = ['Centralized identity & access', 'Cross-organization automation', 'Full audit trail']

/** Shared split layout for the login and bootstrap pages: a branded panel
 * beside the form, rather than a bare card floating on an empty background. */
export function AuthLayout({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex' }}>
      <div
        style={{
          flex: '0 0 42%',
          minWidth: 340,
          maxWidth: 520,
          position: 'relative',
          overflow: 'hidden',
          background: palette.sidebarBg,
          color: palette.sidebarText,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '40px 48px',
        }}
      >
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: '-20%',
            left: '-10%',
            width: 480,
            height: 480,
            borderRadius: '50%',
            background: `radial-gradient(circle, ${palette.accentSoft} 0%, transparent 70%)`,
            pointerEvents: 'none',
          }}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, position: 'relative' }}>
          <img src="/seshat.png" alt="Seshat" width={28} height={28} style={{ objectFit: 'contain' }} />
          <span style={{ color: '#fff', fontWeight: 600, fontSize: 15 }}>Seshat Console</span>
        </div>

        <div style={{ position: 'relative' }}>
          <img src="/seshat.png" alt="" width={64} height={64} style={{ objectFit: 'contain', marginBottom: 28 }} />
          <div style={{ color: '#fff', fontSize: 28, fontWeight: 600, lineHeight: 1.3, maxWidth: 380 }}>{title}</div>
          <div style={{ marginTop: 12, fontSize: 14, lineHeight: 1.6, maxWidth: 360 }}>{subtitle}</div>

          <div style={{ marginTop: 32, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {FEATURES.map((feature) => (
              <div key={feature} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: '50%',
                    background: palette.accent,
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontSize: 13, color: palette.sidebarText }}>{feature}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ fontSize: 12, color: palette.sidebarTextMuted, position: 'relative' }}>Seshat admin console</div>
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
        <div style={{ width: 360 }}>{children}</div>
      </div>
    </div>
  )
}
