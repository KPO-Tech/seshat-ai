import { NavLink, useLocation } from 'react-router-dom'
import { useTranslation } from '../hooks/useTranslation'
import styles from './Nav.module.css'

export default function Nav() {
  const { t, lang, linkTo } = useTranslation()
  const { pathname } = useLocation()

  const altLang = lang === 'fr' ? 'en' : 'fr'
  const altPath = lang === 'fr'
    ? pathname.replace(/^\/fr/, '') || '/'
    : '/fr' + (pathname === '/' ? '' : pathname)

  return (
    <nav className={styles.nav}>
      <NavLink to={linkTo('/')} className={styles.logo}>
        <img src="/seshat.png" alt="Seshat" className={styles.logoImg} />
        <span className={styles.logoText}>Seshat</span>
      </NavLink>

      <div className={styles.links}>
        <NavLink
          to={linkTo('/')}
          className={({ isActive }) => isActive ? `${styles.link} ${styles.active}` : styles.link}
          end
        >
          {t.nav.home}
        </NavLink>
        <NavLink
          to={linkTo('/services')}
          className={({ isActive }) => isActive ? `${styles.link} ${styles.active}` : styles.link}
        >
          {t.nav.services}
        </NavLink>
        <a href="https://github.com/EngineerProjects/seshat" className={styles.link} target="_blank" rel="noreferrer">
          {t.nav.github}
        </a>
        <a
          href="https://github.com/EngineerProjects/seshat/discussions"
          className={styles.cta}
          target="_blank"
          rel="noreferrer"
        >
          {t.nav.discussions}
        </a>
        <NavLink to={altPath} className={styles.langSwitch}>
          {altLang.toUpperCase()}
        </NavLink>
      </div>
    </nav>
  )
}
