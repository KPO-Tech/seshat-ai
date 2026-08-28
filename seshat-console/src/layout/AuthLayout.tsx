import type { ReactNode } from 'react'
import { SafetyCertificateOutlined, AppstoreOutlined, FileSearchOutlined } from '@ant-design/icons'
import { palette } from '@/theme/tokens'

const FEATURES = [
  { icon: <SafetyCertificateOutlined />, title: 'Enterprise Access Control', desc: 'Centralized RBAC and multi-organization policies' },
  { icon: <AppstoreOutlined />, title: 'Unified AI & Automation', desc: 'Model routing, knowledge corpora, and background workers' },
  { icon: <FileSearchOutlined />, title: 'Auditing & Observability', desc: 'End-to-end trace logs and execution telemetry' },
]

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', maxWidth: 1600, margin: '0 auto', background: palette.canvas }}>
      <div
        style={{
          flex: '0 0 48%',
          minWidth: 440,
          position: 'relative',
          overflow: 'hidden',
          background: palette.sidebarBg,
          color: palette.sidebarText,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '64px 80px',
          borderRight: `1px solid ${palette.border}`,
        }}
      >
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `radial-gradient(${palette.border} 1px, transparent 1px)`,
            backgroundSize: '24px 24px',
            maskImage: 'radial-gradient(ellipse 90% 70% at 30% 40%, black 0%, transparent 75%)',
            WebkitMaskImage: 'radial-gradient(ellipse 90% 70% at 30% 40%, black 0%, transparent 75%)',
            opacity: 0.4,
            pointerEvents: 'none',
          }}
        />
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: '-15%',
            left: '-10%',
            width: 650,
            height: 650,
            borderRadius: '50%',
            background: `radial-gradient(circle, rgba(239, 124, 47, 0.16) 0%, transparent 70%)`,
            pointerEvents: 'none',
          }}
        />

        <div style={{ position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 36 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: 'linear-gradient(135deg, #FF8F3D 0%, #EF7C2F 100%)',
                boxShadow: '0 4px 14px rgba(239, 124, 47, 0.4)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 18,
                fontWeight: 800,
                color: '#131217',
              }}
            >
              S
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: palette.ink, letterSpacing: '-0.01em', lineHeight: 1.2 }}>
                Seshat Console
              </div>
              <div style={{ fontSize: 11, color: palette.inkTertiary, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Enterprise Platform
              </div>
            </div>
          </div>

          <div style={{ color: palette.ink, fontSize: 32, fontWeight: 700, lineHeight: 1.25, letterSpacing: '-0.02em' }}>
            {title}
          </div>
          <div style={{ marginTop: 12, fontSize: 15, lineHeight: 1.6, color: palette.inkSecondary, maxWidth: 440 }}>
            {subtitle}
          </div>

          <div style={{ marginTop: 40, display: 'flex', flexDirection: 'column', gap: 20 }}>
            {FEATURES.map((feature) => (
              <div key={feature.title} style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                <span
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 9,
                    background: palette.accentSoft,
                    border: `1px solid ${palette.accentSoftBorder}`,
                    color: palette.accentHover,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 16,
                    flexShrink: 0,
                    marginTop: 2,
                  }}
                >
                  {feature.icon}
                </span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: palette.ink }}>{feature.title}</div>
                  <div style={{ fontSize: 12.5, color: palette.inkTertiary, marginTop: 2 }}>{feature.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ position: 'absolute', left: 80, bottom: 32, fontSize: 12, color: palette.sidebarTextMuted }}>
          © {new Date().getFullYear()} Seshat. All rights reserved.
        </div>
      </div>

      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: palette.canvas,
          padding: 32,
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: 420,
            background: palette.surface,
            border: `1px solid ${palette.border}`,
            borderRadius: 16,
            padding: '36px 36px 32px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.45)',
          }}
        >
          {children}
        </div>
      </div>
    </div>
  )
}

