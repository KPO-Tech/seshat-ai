import { useState } from 'react'
import { Outlet, NavLink, useLocation } from 'react-router-dom'
import { DOC_SECTIONS } from './docs-nav'
import styles from './DocsLayout.module.css'

export default function DocsLayout() {
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()

  const isFr = pathname.startsWith('/fr')
  const base = isFr ? '/fr/docs' : '/docs'

  const parts = pathname.replace('/fr', '').split('/').filter(Boolean)
  const currentSection = parts[1] ?? ''
  const currentArticle = parts[2] ?? ''

  return (
    <div className={styles.layout}>
      <button
        className={styles.mobileToggle}
        onClick={() => setOpen(o => !o)}
        aria-label="Toggle sidebar"
        aria-expanded={open}
      >
        {open ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        )}
        <span>Navigation</span>
      </button>

      {open && <div className={styles.overlay} onClick={() => setOpen(false)} />}

      <aside className={`${styles.sidebar} ${open ? styles.sidebarOpen : ''}`}>
        <nav className={styles.nav}>
          <div className={styles.navSection}>
            <NavLink
              to={base}
              end
              className={({ isActive }) => `${styles.welcomeLink} ${isActive ? styles.welcomeLinkActive : ''}`}
              onClick={() => setOpen(false)}
            >
              Welcome
            </NavLink>
          </div>

          {DOC_SECTIONS.map(section => {
            const isActiveSection = currentSection === section.slug
            return (
              <div key={section.slug} className={styles.navSection}>
                <NavLink
                  to={`${base}/${section.slug}`}
                  className={`${styles.sectionLink} ${isActiveSection ? styles.sectionLinkActive : ''}`}
                  onClick={() => setOpen(false)}
                >
                  {section.title}
                </NavLink>
                <ul className={styles.articleList}>
                  {section.articles.map(article => {
                    const isActive = isActiveSection && currentArticle === article.slug
                    return (
                      <li key={article.slug}>
                        {article.available ? (
                          <NavLink
                            to={`${base}/${section.slug}/${article.slug}`}
                            className={`${styles.articleLink} ${isActive ? styles.articleLinkActive : ''}`}
                            onClick={() => setOpen(false)}
                          >
                            {article.title}
                          </NavLink>
                        ) : (
                          <span className={styles.articleSoon}>
                            {article.title}
                            <span className={styles.soonTag}>soon</span>
                          </span>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </div>
            )
          })}
        </nav>
      </aside>

      <div className={styles.content}>
        <div className={styles.contentInner}>
          <Outlet />
        </div>
      </div>
    </div>
  )
}
