import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from '../../hooks/useTranslation'
import BashLine from '../../components/code/BashLine'
import styles from './Hero.module.css'

export default function Hero() {
  const [copied, setCopied] = useState(false)
  const { t, linkTo } = useTranslation()
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
      <div className={styles.content}>
        <span className={styles.badge}>{t.hero.badge}</span>

        <h1 className={styles.title}>
          {t.hero.title1}{' '}
          <span className="gradient-text">{t.hero.title2}</span>
        </h1>

        <p className={styles.sub}>{t.hero.sub}</p>

        <div className={styles.ctas}>
          <a
            className={styles.btnPrimary}
            href="https://github.com/EngineerProjects/seshat#installation"
            target="_blank"
            rel="noreferrer"
          >
            {t.hero.getStarted}
          </a>
          <a
            className={styles.btnSecondary}
            href="https://github.com/EngineerProjects/seshat"
            target="_blank"
            rel="noreferrer"
          >
            {t.hero.viewGithub}
          </a>
          <Link className={styles.btnSecondary} to={linkTo('/services')}>
            {t.hero.workWithUs}
          </Link>
        </div>

        <div className={styles.installer}>
          <BashLine code={installCmd} className={styles.cmdLine} />
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
    </section>
  )
}
