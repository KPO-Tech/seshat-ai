import type { ReactNode } from 'react'
import { NexusLogo } from '@/components/NexusLogo'

type Props = {
  children: ReactNode
  title: string
  subtitle: string
}

export function AuthLayout({ children, title, subtitle }: Props) {
  return (
    <>
      <style>{`
        .auth-root {
          display: flex;
          height: 100vh;
          overflow: hidden;
          background-color: var(--color-bg);
        }

        /* ── Left panel ── */
        .auth-left {
          width: 42%;
          min-width: 320px;
          max-width: 560px;
          flex-shrink: 0;
          background-color: var(--color-surface);
          border-right: 1px solid var(--color-border);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 64px 56px;
        }

        .auth-left-inner {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 28px;
          text-align: center;
          width: 100%;
          max-width: 340px;
        }

        .auth-brand-name {
          font-size: 22px;
          font-weight: 700;
          letter-spacing: 0.18em;
          color: var(--color-text);
          margin-bottom: 10px;
        }

        .auth-brand-sub {
          font-size: 11px;
          font-weight: 600;
          color: var(--color-primary);
          letter-spacing: 0.14em;
          text-transform: uppercase;
        }

        .auth-divider {
          width: 28px;
          height: 1px;
          background-color: var(--color-border);
        }

        .auth-tagline {
          font-size: 14px;
          color: var(--color-text-secondary);
          line-height: 1.8;
          max-width: 260px;
          margin: 0;
        }

        .auth-features {
          display: flex;
          flex-direction: column;
          gap: 13px;
          align-self: stretch;
          max-width: 260px;
          margin: 0 auto;
        }

        .auth-feature-row {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .auth-feature-dot {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background-color: var(--color-accent);
          flex-shrink: 0;
        }

        .auth-feature-label {
          font-size: 13px;
          color: var(--color-text-muted);
          letter-spacing: 0.01em;
        }

        /* ── Right panel ── */
        .auth-right {
          flex: 1;
          overflow-y: auto;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 48px 32px;
          background-color: var(--color-bg);
        }

        .auth-form-wrapper {
          width: 100%;
          max-width: 440px;
          animation: fade-in 0.2s ease-out;
        }

        .auth-form-header {
          margin-bottom: 32px;
          text-align: center;
        }

        .auth-form-title {
          margin: 0 0 8px;
          font-size: 24px;
          font-weight: 700;
          color: var(--color-primary);
          letter-spacing: -0.3px;
        }

        .auth-form-subtitle {
          margin: 0;
          font-size: 14px;
          color: var(--color-text-secondary);
          line-height: 1.5;
        }

        /* Responsive — narrow window */
        @media (max-width: 720px) {
          .auth-left {
            display: none;
          }
          .auth-right {
            padding: 32px 20px;
          }
        }

        /* Responsive — wide screen equalisation */
        @media (min-width: 1400px) {
          .auth-left {
            width: 44%;
            max-width: 680px;
          }
        }
      `}</style>

      <div className="auth-root">

        {/* ─── LEFT PANEL ─── */}
        <div className="auth-left">
          <div className="auth-left-inner">

            <NexusLogo size={80} />

            <div>
              <div className="auth-brand-name">NEXUS</div>
              <div className="auth-brand-sub">AI Operating System</div>
            </div>

            <div className="auth-divider" />

            <p className="auth-tagline">
              Orchestrate teams of AI agents to plan, delegate and execute complex missions.
            </p>

            <div className="auth-features">
              {[
                'Multi-agent orchestration',
                'Persistent workspaces',
                'Autonomous execution',
              ].map((feat) => (
                <div key={feat} className="auth-feature-row">
                  <div className="auth-feature-dot" />
                  <span className="auth-feature-label">{feat}</span>
                </div>
              ))}
            </div>

          </div>
        </div>

        {/* ─── RIGHT PANEL ─── */}
        <div className="auth-right">
          <div className="auth-form-wrapper">

            <div className="auth-form-header">
              <h1 className="auth-form-title">{title}</h1>
              <p className="auth-form-subtitle">{subtitle}</p>
            </div>

            {children}

          </div>
        </div>

      </div>
    </>
  )
}
