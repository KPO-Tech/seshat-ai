import { useState } from 'react'
import { Link } from 'react-router-dom'
import styles from './Install.module.css'

export default function Install() {
  const [copiedShell, setCopiedShell] = useState(false)
  const [copiedGo, setCopiedGo] = useState(false)

  const shellCmd = 'curl -fsSL https://raw.githubusercontent.com/EngineerProjects/seshat/main/scripts/install.sh | bash'
  const goCmd = 'go install github.com/EngineerProjects/seshat/cmd/cli@latest'

  const handleCopyShell = async () => {
    try {
      await navigator.clipboard.writeText(shellCmd)
      setCopiedShell(true)
      setTimeout(() => setCopiedShell(false), 2000)
    } catch (err) {
      console.error(err)
    }
  }

  const handleCopyGo = async () => {
    try {
      await navigator.clipboard.writeText(goCmd)
      setCopiedGo(true)
      setTimeout(() => setCopiedGo(false), 2000)
    } catch (err) {
      console.error(err)
    }
  }

  return (
    <>
      <section className={styles.install}>
        <div className={styles.inner}>
          <p className="section-label">Quick Start</p>
          <h2 className={styles.title}>One command to start</h2>
          <p className={styles.sub}>
            Downloads the binary for your platform, sets up the Python environment
            for document processing, and adds Seshat to your PATH.
          </p>

          <div className={styles.terminalContainer}>
            <div className={styles.terminalHeader}>
              <div className={styles.dots}>
                <div className={`${styles.dot} ${styles.dotRed}`} />
                <div className={`${styles.dot} ${styles.dotYellow}`} />
                <div className={`${styles.dot} ${styles.dotGreen}`} />
              </div>
              <span className={styles.terminalTitle}>bash / zsh</span>
              <div style={{ width: '40px' }} /> {/* Spacing */}
            </div>

            <div className={styles.terminalBody}>
              <div className={styles.codeLine}>
                <div className={styles.codeLineContent}>
                  <span className={styles.comment}># Linux / macOS (batteries included)</span>
                  <span className={styles.codeText}>
                    <span style={{ color: 'var(--brand-engine-start)', marginRight: '0.5rem', userSelect: 'none' }}>$</span>
                    {shellCmd}
                  </span>
                </div>
                <button
                  onClick={handleCopyShell}
                  className={`${styles.copyBtn} ${copiedShell ? styles.copyBtnActive : ''}`}
                  title="Copy command"
                  aria-label="Copy shell installation command"
                >
                  {copiedShell ? (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                  )}
                </button>
              </div>

              <div style={{ height: '1.5rem' }} />

              <div className={styles.codeLine}>
                <div className={styles.codeLineContent}>
                  <span className={styles.comment}># Go developers</span>
                  <span className={styles.codeText}>
                    <span style={{ color: 'var(--brand-engine-start)', marginRight: '0.5rem', userSelect: 'none' }}>$</span>
                    {goCmd}
                  </span>
                </div>
                <button
                  onClick={handleCopyGo}
                  className={`${styles.copyBtn} ${copiedGo ? styles.copyBtnActive : ''}`}
                  title="Copy command"
                  aria-label="Copy Go build command"
                >
                  {copiedGo ? (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </div>

          <a
            className={styles.btn}
            href="https://github.com/EngineerProjects/seshat#installation"
            target="_blank"
            rel="noreferrer"
          >
            Full installation guide →
          </a>
        </div>
      </section>

      <div className={styles.ctaBand}>
        <h2 className={styles.ctaTitle}>Build the future of agent teams</h2>
        <p className={styles.ctaSub}>
          An open research and engineering project. Every idea, issue, and PR is read and valued.
        </p>
        <div className={styles.ctaBtns}>
          <a
            className={styles.btnPrimary}
            href="https://github.com/EngineerProjects/seshat/discussions/72"
            target="_blank"
            rel="noreferrer"
          >
            Join the discussion
          </a>
          <Link className={styles.btnSecondary} to="/services">
            Work with us →
          </Link>
        </div>
      </div>
    </>
  )
}
