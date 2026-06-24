import { useState, useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useTranslation } from '../hooks/useTranslation'
import { useTheme } from '../hooks/useTheme'
import styles from './Nav.module.css'

export default function Nav() {
  const [menuOpen, setMenuOpen] = useState(false)
  const { t, lang, linkTo } = useTranslation()
  const { theme, toggleTheme } = useTheme()
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
          <button
            onClick={toggleTheme}
            className={styles.themeBtn}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
          >
            {theme === 'dark' ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" />
                <line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" />
                <line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </button>
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
          <div className={styles.mobileBottom}>
            <NavLink
              to={altPath}
              className={styles.mobileLang}
              onClick={() => { handleLangSwitch(); closeMenu() }}
            >
              {altLang === 'fr' ? 'Passer en Français' : 'Switch to English'}
            </NavLink>
            <button
              onClick={() => { toggleTheme(); closeMenu() }}
              className={styles.mobileThemeBtn}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? 'Light mode' : 'Dark mode'}
            </button>
          </div>
        </div>
      )}
    </>
  )
}
