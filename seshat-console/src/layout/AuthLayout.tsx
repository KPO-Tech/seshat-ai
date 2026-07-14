import type { ReactNode } from 'react'
import { palette } from '@/theme/tokens'

/** Shared split layout for the login and bootstrap pages: a dark brand panel
 * beside the form, rather than a bare card floating on an empty background. */
export function AuthLayout({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex' }}>
      <div
        style={{
          flex: '0 0 40%',
          minWidth: 320,
          background: palette.sidebarBg,
          color: palette.sidebarText,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '40px 44px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            style={{
              width: 26,
              height: 26,
              borderRadius: 7,
              background: palette.accent,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 13,
              fontWeight: 700,
              color: '#fff',
            }}
          >
            S
          </span>
          <span style={{ color: '#fff', fontWeight: 600, fontSize: 15 }}>Seshat Console</span>
        </div>
        <div>
          <div style={{ color: '#fff', fontSize: 26, fontWeight: 600, lineHeight: 1.3, maxWidth: 360 }}>{title}</div>
          <div style={{ marginTop: 10, fontSize: 14, lineHeight: 1.6, maxWidth: 360 }}>{subtitle}</div>
        </div>
        <div style={{ fontSize: 12, color: palette.sidebarTextMuted }}>Seshat admin console</div>
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
