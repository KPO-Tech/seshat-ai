import { useState, useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useTranslation } from '../hooks/useTranslation'
import styles from './Nav.module.css'

export default function Nav() {
  const [menuOpen, setMenuOpen] = useState(false)
  const { t, lang, linkTo } = useTranslation()
  const { pathname } = useLocation()

  const altLang = lang === 'fr' ? 'en' : 'fr'
  const altPath = lang === 'fr'
    ? pathname.replace(/^\/fr/, '') || '/'
    : '/fr' + (pathname === '/' ? '' : pathname)

  useEffect(() => setMenuOpen(false), [pathname])

  const handleLangSwitch = () => {
    localStorage.setItem('seshat-lang', altLang)
  }

  const closeMenu = () => setMenuOpen(false)

  return (
    <>
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
          <NavLink to={altPath} className={styles.langSwitch} onClick={handleLangSwitch}>
            {altLang.toUpperCase()}
          </NavLink>
        </div>

        <button
          className={styles.burger}
          onClick={() => setMenuOpen((o) => !o)}
          aria-label="Toggle navigation menu"
          aria-expanded={menuOpen}
        >
          {menuOpen ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="4" y1="8" x2="20" y2="8" />
              <line x1="4" y1="16" x2="20" y2="16" />
            </svg>
          )}
        </button>
      </nav>

      {menuOpen && (
        <div className={styles.mobileMenu}>
          <NavLink to={linkTo('/')} className={styles.mobileLink} end onClick={closeMenu}>
            {t.nav.home}
          </NavLink>
          <NavLink to={linkTo('/services')} className={styles.mobileLink} onClick={closeMenu}>
            {t.nav.services}
          </NavLink>
          <a
            href="https://github.com/EngineerProjects/seshat"
            className={styles.mobileLink}
            target="_blank"
            rel="noreferrer"
            onClick={closeMenu}
          >
            {t.nav.github}
          </a>
          <a
            href="https://github.com/EngineerProjects/seshat/discussions"
            className={`${styles.mobileLink} ${styles.mobileCta}`}
            target="_blank"
            rel="noreferrer"
            onClick={closeMenu}
          >
            {t.nav.discussions}
          </a>
          <NavLink
            to={altPath}
            className={styles.mobileLang}
            onClick={() => { handleLangSwitch(); closeMenu() }}
          >
            {altLang === 'fr' ? 'Passer en Français' : 'Switch to English'}
          </NavLink>
        </div>
      )}
    </>
  )
}
