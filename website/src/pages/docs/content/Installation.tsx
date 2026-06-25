import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import styles from './Installation.module.css'

const INSTALL_CMD = 'curl -fsSL https://raw.githubusercontent.com/EngineerProjects/seshat/main/scripts/install.sh | bash'
const VERIFY_CMD = 'seshat --version'

function CopyBlock({ cmd, label }: { cmd: string; label?: string }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    await navigator.clipboard.writeText(cmd)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className={styles.codeBlock}>
      {label && <span className={styles.codeLabel}>{label}</span>}
      <div className={styles.codeLine}>
        <span className={styles.prompt}>$</span>
        <code className={styles.code}>{cmd}</code>
        <button
          onClick={copy}
          className={`${styles.copyBtn} ${copied ? styles.copyBtnActive : ''}`}
          title="Copy"
          aria-label="Copy to clipboard"
        >
          {copied ? (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
          ) : (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
          )}
        </button>
      </div>
    </div>
  )
}

export default function Installation() {
  const { pathname } = useLocation()
  const isFr = pathname.startsWith('/fr')
  const base = isFr ? '/fr/docs' : '/docs'

  return (
    <div className={styles.page}>
      <div className={styles.breadcrumb}>
        <Link to={base} className={styles.breadLink}>Docs</Link>
        <span className={styles.breadSep}>/</span>
        <Link to={`${base}/getting-started`} className={styles.breadLink}>Getting Started</Link>
        <span className={styles.breadSep}>/</span>
        <span className={styles.breadCurrent}>Installation</span>
      </div>

      <header className={styles.header}>
        <h1 className={styles.title}>Installation</h1>
        <p className={styles.sub}>Install the Seshat binary on Linux, macOS or Windows. The entire runtime ships as a single binary with no runtime dependencies.</p>
      </header>

      <section className={styles.section}>
        <h2 className={styles.h2}>Requirements</h2>
        <ul className={styles.list}>
          <li>Linux (x86_64 / arm64), macOS (Intel / Apple Silicon) or Windows (x86_64)</li>
          <li>An API key for at least one supported LLM provider (OpenAI, Anthropic, OpenRouter, Mistral, etc.)</li>
        </ul>
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>Install via script (Linux and macOS)</h2>
        <p className={styles.p}>The install script downloads the correct binary for your platform, makes it executable and adds it to your PATH.</p>
        <CopyBlock cmd={INSTALL_CMD} label="Terminal" />
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>Install from releases</h2>
        <p className={styles.p}>Download the pre-built binary for your platform directly from GitHub Releases.</p>
        <a
          href="https://github.com/EngineerProjects/seshat/releases"
          target="_blank"
          rel="noreferrer"
          className={styles.ghLink}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
          </svg>
          View releases on GitHub
        </a>
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>Verify the installation</h2>
        <CopyBlock cmd={VERIFY_CMD} label="Terminal" />
        <p className={styles.p}>You should see the current Seshat version printed in your terminal.</p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>Next step</h2>
        <p className={styles.p}>Once installed, head to Quick Start to run your first agent.</p>
        <Link to={`${base}/getting-started/quick-start`} className={styles.nextLink}>
          Quick Start
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
          </svg>
        </Link>
      </section>
    </div>
  )
}
