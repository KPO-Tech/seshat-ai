import { Link, useParams, useLocation } from 'react-router-dom'
import { findSection } from './docs-nav'
import { useDocsMeta } from './useDocsMeta'
import styles from './SectionPage.module.css'

export default function SectionPage() {
  const { section: sectionSlug = '' } = useParams()
  const { pathname } = useLocation()
  const isFr = pathname.startsWith('/fr')
  const base = isFr ? '/fr/docs' : '/docs'

  const section = findSection(sectionSlug)
  if (!section) return null

  useDocsMeta(
    `${section.title} | Seshat Docs`,
    section.desc,
  )

  const topLevelArticles = section.articles.filter(article => !article.parentSlug)
  const getChildren = (parentSlug: string) => section.articles.filter(article => article.parentSlug === parentSlug)

  return (
    <div className={styles.page}>
      <div className={styles.breadcrumb}>
        <Link to={base} className={styles.breadLink}>Docs</Link>
        <span className={styles.breadSep}>/</span>
        <span className={styles.breadCurrent}>{section.title}</span>
      </div>

      <header className={styles.header}>
        <p className="section-label">{section.title}</p>
        <h1 className={styles.title}>{section.title}</h1>
        <p className={styles.desc}>{section.desc}</p>
      </header>

      <div className={styles.grid}>
        {topLevelArticles.map((article, i) => {
          const children = getChildren(article.slug)
          return (
            <div
              key={article.slug}
              className={`${styles.card} ${article.available ? styles.cardAvailable : styles.cardSoon}`}
            >
              <div className={styles.cardTop}>
                <span className={styles.cardNum}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                {article.available ? (
                  <span className={styles.availBadge}>Available</span>
                ) : (
                  <span className={styles.soonBadge}>Coming soon</span>
                )}
              </div>
              <h3 className={styles.cardTitle}>{article.navTitle ?? article.title}</h3>
              {article.desc && <p className={styles.cardDesc}>{article.desc}</p>}
              {article.available && (
                <Link
                  to={`${base}/${section.slug}/${article.slug}`}
                  className={styles.cardLink}
                >
                  Read
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
                  </svg>
                </Link>
              )}

              {children.length > 0 ? (
                <div className={styles.childGroup}>
                  <p className={styles.childLabel}>Subpages</p>
                  <ul className={styles.childList}>
                    {children.map(child => (
                      <li key={child.slug}>
                        {child.available ? (
                          <Link to={`${base}/${section.slug}/${child.slug}`} className={styles.childLink}>
                            {child.navTitle ?? child.title}
                          </Link>
                        ) : (
                          <span className={styles.childSoon}>
                            {child.navTitle ?? child.title}
                            <span className={styles.soonBadge}>Coming soon</span>
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}
