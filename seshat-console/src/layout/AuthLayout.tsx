import type { ReactNode } from 'react'
import { palette } from '@/theme/tokens'

const FEATURES = ['Centralized identity & access', 'Cross-organization automation', 'Full audit trail']

/** Shared split layout for the login and bootstrap pages: a branded panel
 * beside the form, rather than a bare card floating on an empty background.
 * Both columns are vertically centered so neither reads as top-heavy next
 * to the other. */
export function AuthLayout({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex' }}>
      <div
        style={{
          flex: '0 0 44%',
          minWidth: 360,
          maxWidth: 560,
          position: 'relative',
          overflow: 'hidden',
          background: palette.sidebarBg,
          color: palette.sidebarText,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '56px 64px',
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
            top: '-15%',
            left: '-15%',
            width: 560,
            height: 560,
            borderRadius: '50%',
            background: `radial-gradient(circle, ${palette.accentSoft} 0%, transparent 70%)`,
            pointerEvents: 'none',
          }}
        />

        <div style={{ position: 'relative', maxWidth: 420 }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              borderRadius: 999,
              background: palette.accentSoft,
              color: palette.accent,
              padding: '5px 12px',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              marginBottom: 24,
            }}
          >
            Admin Control Plane
          </span>

          <img src="/seshat.png" alt="Seshat" width={88} height={88} style={{ objectFit: 'contain', marginBottom: 28 }} />

          <div style={{ color: '#fff', fontSize: 30, fontWeight: 700, lineHeight: 1.25, letterSpacing: '-0.01em' }}>
            {title}
          </div>
          <div style={{ marginTop: 12, fontSize: 14.5, lineHeight: 1.6 }}>{subtitle}</div>

          <div style={{ marginTop: 32, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {FEATURES.map((feature) => (
              <div key={feature} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: palette.accent, flexShrink: 0 }} />
                <span style={{ fontSize: 13, color: palette.sidebarText }}>{feature}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ position: 'absolute', left: 64, bottom: 32, fontSize: 12, color: palette.sidebarTextMuted }}>
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
        <div style={{ width: 400 }}>{children}</div>
      </div>
    </div>
  )
}
