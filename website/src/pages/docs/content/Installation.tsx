import { Link, useLocation } from 'react-router-dom'
import DocCodeBlock from './DocCodeBlock'
import styles from './DocArticle.module.css'

const INSTALL_SCRIPT = 'curl -fsSL https://raw.githubusercontent.com/EngineerProjects/seshat/main/scripts/install.sh | bash'
const GO_INSTALL = 'go install github.com/EngineerProjects/seshat/cmd/cli@latest'
const VERIFY_CMD = 'seshat --version'

export default function Installation() {
  const { pathname } = useLocation()
  const base = pathname.startsWith('/fr') ? '/fr/docs' : '/docs'

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
        <p className={styles.sub}>
          Install the Seshat binary on Linux, macOS or Windows. The runtime ships as a single binary,
          and you can choose between the one-command installer or the Go toolchain depending on your profile.
        </p>
      </header>

      <section className={styles.section}>
        <h2 className={styles.h2}>Requirements</h2>
        <ul className={styles.list}>
          <li>Linux (x86_64 / arm64), macOS (Intel / Apple Silicon), or Windows (x86_64)</li>
          <li>At least one supported LLM provider or a local Ollama setup</li>
          <li>Go only if you want to install from source as a developer</li>
        </ul>
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>Install via script</h2>
        <p className={styles.p}>
          This is the fastest path for most users and vibecoders. It downloads the right binary for your platform,
          adds it to your PATH, and prepares optional document tooling.
        </p>
        <DocCodeBlock code={INSTALL_SCRIPT} label="Terminal" />
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>Install with Go</h2>
        <p className={styles.p}>
          If you are a developer and already have Go configured, you can install the CLI directly from the Go toolchain.
        </p>
        <DocCodeBlock code={GO_INSTALL} label="Go Toolchain" />
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>Install from releases</h2>
        <p className={styles.p}>
          If you prefer manual installation, download the pre-built binary for your platform directly from GitHub Releases.
        </p>
        <a
          href="https://github.com/EngineerProjects/seshat/releases"
          target="_blank"
          rel="noreferrer"
          className={styles.secondaryLink}
        >
          View releases on GitHub
        </a>
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>Verify the installation</h2>
        <DocCodeBlock code={VERIFY_CMD} label="Terminal" />
        <p className={styles.p}>You should see the installed Seshat version printed in your terminal.</p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>Next step</h2>
        <p className={styles.p}>Once the binary is available, continue to Quick Start for the first working session.</p>
        <div className={styles.actionRow}>
          <Link to={`${base}/getting-started/quick-start`} className={styles.primaryLink}>Quick Start</Link>
          <Link to={`${base}/getting-started/configuration`} className={styles.secondaryLink}>Configuration</Link>
        </div>
      </section>
    </div>
  )
}
