import { useState } from 'react'
import { Link } from 'react-router-dom'
import styles from './Hero.module.css'

export default function Hero() {
  const [copied, setCopied] = useState(false)
  const installCmd = 'curl -fsSL https://raw.githubusercontent.com/EngineerProjects/seshat/main/scripts/install.sh | bash'

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(installCmd)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy text: ', err)
    }
  }

  return (
    <section className={styles.hero}>
      <div className={styles.grid}>
        <div className={styles.content}>
          <span className={styles.badge}>Open Source · Apache 2.0 · Written in Go</span>

          <h1 className={styles.title}>
            The runtime for<br />
            <span className="gradient-text">AI agent teams</span>
          </h1>

          <p className={styles.sub}>
            Most frameworks handle single agents well. Seshat is built for what comes next:
            agents that work together, coordinate responsibilities, and share a mission. Like a real team.
          </p>

          <div className={styles.ctas}>
            <a
              className={styles.btnPrimary}
              href="https://github.com/EngineerProjects/seshat#installation"
              target="_blank"
              rel="noreferrer"
            >
              ↓ Get Started
            </a>
            <a
              className={styles.btnSecondary}
              href="https://github.com/EngineerProjects/seshat"
              target="_blank"
              rel="noreferrer"
            >
              View on GitHub
            </a>
            <Link className={styles.btnSecondary} to="/services">
              Work with us →
            </Link>
          </div>

          <div className={styles.installer}>
            <div className={styles.cmdLine}>
              <span className={styles.prompt}>$</span>
              <span>{installCmd}</span>
            </div>
            <button
              onClick={handleCopy}
              className={`${styles.copyBtn} ${copied ? styles.copyBtnActive : ''}`}
              title="Copy to clipboard"
              aria-label="Copy installation command"
            >
              {copied ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              )}
            </button>
          </div>
        </div>

        <div className={`${styles.visual} animate-float`}>
          <svg className={styles.networkSvg} viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <radialGradient id="orangeGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="var(--brand-engine-start)" stopOpacity="0.25" />
                <stop offset="100%" stopColor="var(--brand-engine-start)" stopOpacity="0" />
              </radialGradient>
              <radialGradient id="indigoGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="var(--brand-platform-start)" stopOpacity="0.25" />
                <stop offset="100%" stopColor="var(--brand-platform-start)" stopOpacity="0" />
              </radialGradient>
            </defs>

            {/* Glowing Backdrops */}
            <circle cx="200" cy="70" r="40" fill="url(#orangeGlow)" />
            <circle cx="320" cy="200" r="40" fill="url(#indigoGlow)" />
            <circle cx="200" cy="330" r="40" fill="url(#orangeGlow)" />
            <circle cx="80" cy="200" r="40" fill="url(#indigoGlow)" />

            {/* Connecting lines */}
            <line x1="200" y1="70" x2="320" y2="200" className={styles.activeLine} />
            <line x1="320" y1="200" x2="200" y2="330" className={styles.linkLine} />
            <line x1="200" y1="330" x2="80" y2="200" className={styles.activeLineIndigo} />
            <line x1="80" y1="200" x2="200" y2="70" className={styles.linkLine} />

            <line x1="200" y1="70" x2="200" y2="330" className={styles.linkLine} />
            <line x1="80" y1="200" x2="320" y2="200" className={styles.linkLine} strokeDasharray="3 3" />

            {/* Glowing active packet travels */}
            <circle cx="200" cy="200" r="100" fill="none" stroke="var(--border-glass)" strokeWidth="0.5" />

            {/* Node 1: Lead Architect */}
            <g transform="translate(200, 70)">
              <circle cx="0" cy="0" r="30" className={`${styles.nodeCircle} ${styles.nodeGlow}`} style={{ '--glow-color': 'var(--brand-engine-start)' } as React.CSSProperties} />
              <text x="0" y="-5" className={styles.nodeText} textAnchor="middle">Lead</text>
              <text x="0" y="8" className={styles.nodeRole} textAnchor="middle">Architect</text>
              <circle cx="0" cy="0" r="30" className={styles.pulseCircle} stroke="var(--brand-engine-start)" style={{ animation: 'pulse 3s infinite ease-out' }} />
            </g>

            {/* Node 2: Developer */}
            <g transform="translate(320, 200)">
              <circle cx="0" cy="0" r="30" className={`${styles.nodeCircle} ${styles.nodeGlow}`} style={{ '--glow-color': 'var(--brand-platform-start)' } as React.CSSProperties} />
              <text x="0" y="-5" className={styles.nodeText} textAnchor="middle">Go Dev</text>
              <text x="0" y="8" className={styles.nodeRole} textAnchor="middle">Builder</text>
            </g>

            {/* Node 3: QA Inspector */}
            <g transform="translate(200, 330)">
              <circle cx="0" cy="0" r="30" className={`${styles.nodeCircle} ${styles.nodeGlow}`} style={{ '--glow-color': 'var(--green)' } as React.CSSProperties} />
              <text x="0" y="-5" className={styles.nodeText} textAnchor="middle">Tester</text>
              <text x="0" y="8" className={styles.nodeRole} textAnchor="middle">QA Audit</text>
            </g>

            {/* Node 4: RAG Builder */}
            <g transform="translate(80, 200)">
              <circle cx="0" cy="0" r="30" className={`${styles.nodeCircle} ${styles.nodeGlow}`} style={{ '--glow-color': 'var(--purple)' } as React.CSSProperties} />
              <text x="0" y="-5" className={styles.nodeText} textAnchor="middle">RAG Ops</text>
              <text x="0" y="8" className={styles.nodeRole} textAnchor="middle">Knowledge</text>
            </g>

            {/* Central Coordinator Hub */}
            <g transform="translate(200, 200)">
              <circle cx="0" cy="0" r="16" fill="var(--bg-surface)" stroke="var(--border-glass-hover)" strokeWidth="1.5" />
              <circle cx="0" cy="0" r="6" fill="var(--brand-engine-start)" style={{ animation: 'pulse-glow 2s infinite ease-in-out' }} />
            </g>
          </svg>
        </div>
      </div>
    </section>
  )
}
