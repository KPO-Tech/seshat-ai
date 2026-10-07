import { Link } from 'react-router-dom'
import { useTranslation } from '../hooks/useTranslation'
import styles from './Footer.module.css'

export default function Footer() {
  const { lang, linkTo } = useTranslation()
  const servicesLabel = lang === 'fr' ? 'Services' : 'Services'
  const docsLabel = lang === 'fr' ? 'Docs' : 'Docs'

  return (
    <footer className={styles.footer}>
      <div className={styles.links}>
        <Link to={linkTo('/open-source')}>Open Source</Link>
        <Link to={linkTo('/docs')}>{docsLabel}</Link>
        <a href="https://github.com/KPO-Tech/seshat" target="_blank" rel="noreferrer">GitHub</a>
        <a href="https://github.com/KPO-Tech/seshat/discussions" target="_blank" rel="noreferrer">Discussions</a>
        <Link to={linkTo('/services')}>{servicesLabel}</Link>
      </div>
      <p className={styles.copy}>
        © 2026 Seshat ·{' '}
        <a href="https://github.com/KPO-Tech/seshat" target="_blank" rel="noreferrer">
          Open runtime on GitHub
        </a>
      </p>
    </footer>
  )
}
