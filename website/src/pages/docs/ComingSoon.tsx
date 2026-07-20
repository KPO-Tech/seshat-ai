import { Link, useParams, useLocation } from 'react-router-dom'
import { findSection, findArticle } from './docs-nav'
import styles from './ComingSoon.module.css'

export default function ComingSoon() {
  const { section: sectionSlug = '', article: articleSlug = '' } = useParams()
  const { pathname } = useLocation()
  const isFr = pathname.startsWith('/fr')
  const base = isFr ? '/fr/docs' : '/docs'

  const section = findSection(sectionSlug)
  const article = articleSlug ? findArticle(sectionSlug, articleSlug) : undefined

  const title = article?.title ?? section?.title ?? 'Documentation'
  const desc = article?.desc ?? section?.desc ?? 'This page is being written.'

  return (
    <div className={styles.page}>
      <div className={styles.breadcrumb}>
        <Link to={base} className={styles.breadLink}>Docs</Link>
        {section && (
          <>
            <span className={styles.breadSep}>/</span>
            <Link to={`${base}/${section.slug}`} className={styles.breadLink}>{section.title}</Link>
          </>
        )}
        {article && (
          <>
            <span className={styles.breadSep}>/</span>
            <span className={styles.breadCurrent}>{article.title}</span>
          </>
        )}
      </div>

      <div className={styles.inner}>
        <div className={styles.icon}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
          </svg>
        </div>

        <span className={styles.badge}>Coming soon</span>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.desc}>{desc}</p>

        <p className={styles.note}>
          This page is actively being written. Check back soon or{' '}
          <a
            href="https://github.com/KPO-Tech/seshat/discussions"
            target="_blank"
            rel="noreferrer"
            className={styles.link}
          >
            follow progress on GitHub Discussions.
          </a>
        </p>

        {section && (
          <div className={styles.sectionLinks}>
            <p className={styles.sectionLinksTitle}>Other pages in {section.title}</p>
            <ul className={styles.list}>
              {section.articles.filter(a => a.slug !== articleSlug).map(a => (
                <li key={a.slug}>
                  {a.available ? (
                    <Link to={`${base}/${section.slug}/${a.slug}`} className={styles.availableLink}>
                      {a.title}
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
                      </svg>
                    </Link>
                  ) : (
                    <span className={styles.soonLink}>
                      {a.title}
                      <span className={styles.soonTag}>soon</span>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
