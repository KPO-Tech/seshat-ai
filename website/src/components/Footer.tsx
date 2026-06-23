import { Link } from 'react-router-dom'
import { useTranslation } from '../hooks/useTranslation'
import styles from './Footer.module.css'

export default function Footer() {
  const { t, linkTo } = useTranslation()

  return (
    <footer className={styles.footer}>
      <div className={styles.links}>
        <a href="https://github.com/EngineerProjects/seshat" target="_blank" rel="noreferrer">{t.footer.engine}</a>
        <a href="https://github.com/EngineerProjects/seshat-ai" target="_blank" rel="noreferrer">{t.footer.platform}</a>
        <a href="https://github.com/EngineerProjects/seshat/discussions" target="_blank" rel="noreferrer">{t.footer.discussions}</a>
        <a href="https://github.com/EngineerProjects/seshat/issues" target="_blank" rel="noreferrer">{t.footer.issues}</a>
        <Link to={linkTo('/services')}>{t.footer.services}</Link>
      </div>
      <p className={styles.copy}>
        {t.footer.copy.split(' · ')[0]} ·{' '}
        <a href="https://github.com/EngineerProjects/seshat" target="_blank" rel="noreferrer">
          {t.footer.copy.split(' · ').slice(1).join(' · ')}
        </a>
      </p>
    </footer>
  )
}
