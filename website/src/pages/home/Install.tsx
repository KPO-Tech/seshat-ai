import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from '../../hooks/useTranslation'
import BashLine from '../../components/code/BashLine'
import styles from './Install.module.css'

export default function Install() {
  const [copiedShell, setCopiedShell] = useState(false)
  const [copiedGo, setCopiedGo] = useState(false)
  const { t, linkTo } = useTranslation()

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

  const CopyIcon = () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )

  const CheckIcon = () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )

  return (
    <>
      <section className={styles.install}>
        <div className={styles.inner}>
          <p className="section-label">{t.install.label}</p>
          <h2 className={styles.title}>{t.install.title}</h2>
          <p className={styles.sub}>{t.install.sub}</p>

          <div className={styles.terminalContainer}>
            <div className={styles.terminalHeader}>
              <div className={styles.dots}>
                <div className={`${styles.dot} ${styles.dotRed}`} />
                <div className={`${styles.dot} ${styles.dotYellow}`} />
                <div className={`${styles.dot} ${styles.dotGreen}`} />
              </div>
              <span className={styles.terminalTitle}>bash / zsh</span>
              <div style={{ width: '40px' }} />
            </div>

            <div className={styles.terminalBody}>
              <div className={styles.codeLine}>
                <div className={styles.codeLineContent}>
                  <span className={styles.comment}>{t.install.linuxComment}</span>
                  <BashLine code={shellCmd} className={styles.codeText} />
                </div>
                <button
                  onClick={handleCopyShell}
                  className={`${styles.copyBtn} ${copiedShell ? styles.copyBtnActive : ''}`}
                  title="Copy command"
                  aria-label="Copy shell installation command"
                >
                  {copiedShell ? <CheckIcon /> : <CopyIcon />}
                </button>
              </div>

              <div style={{ height: '1.5rem' }} />

              <div className={styles.codeLine}>
                <div className={styles.codeLineContent}>
                  <span className={styles.comment}>{t.install.goComment}</span>
                  <BashLine code={goCmd} className={styles.codeText} />
                </div>
                <button
                  onClick={handleCopyGo}
                  className={`${styles.copyBtn} ${copiedGo ? styles.copyBtnActive : ''}`}
                  title="Copy command"
                  aria-label="Copy Go build command"
                >
                  {copiedGo ? <CheckIcon /> : <CopyIcon />}
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
            {t.install.guide}
          </a>
        </div>
      </section>

      <div className={styles.ctaBand}>
        <h2 className={styles.ctaTitle}>{t.install.ctaTitle}</h2>
        <p className={styles.ctaSub}>{t.install.ctaSub}</p>
        <div className={styles.ctaBtns}>
          <a
            className={styles.btnPrimary}
            href="https://github.com/EngineerProjects/seshat/discussions/72"
            target="_blank"
            rel="noreferrer"
          >
            {t.install.joinDiscussion}
          </a>
          <Link className={styles.btnSecondary} to={linkTo('/services')}>
            {t.install.workWithUs}
          </Link>
        </div>
      </div>
    </>
  )
}
