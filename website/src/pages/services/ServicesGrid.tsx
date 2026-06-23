import { useInView } from '../../hooks/useInView'
import { useTranslation } from '../../hooks/useTranslation'
import styles from './ServicesGrid.module.css'

const SERVICE_ICONS = [
  <svg className={styles.iconSvg} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="6" r="2.5" />
    <circle cx="6" cy="16" r="2.5" />
    <circle cx="18" cy="16" r="2.5" />
    <path d="M9.5 8.5 L7.5 13.5 M16.5 13.5 L14.5 8.5 M8.5 16.5 L15.5 16.5" strokeDasharray="2 2" />
  </svg>,
  <svg className={styles.iconSvg} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <ellipse cx="12" cy="5" rx="9" ry="3" />
    <path d="M3 5v4c0 1.66 4 3 9 3s9-1.34 9-3V5" />
    <path d="M3 9v4c0 1.66 4 3 9 3s9-1.34 9-3V9" />
    <path d="M3 13v4c0 1.66 4 3 9 3s9-1.34 9-3v-4" />
    <path d="M17 19l3 3M20 19l-3 3" strokeWidth="2.5" />
  </svg>,
  <svg className={styles.iconSvg} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>,
  <svg className={styles.iconSvg} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="16 18 22 12 16 6" />
    <polyline points="8 6 2 12 8 18" />
    <line x1="12" y1="5" x2="12" y2="19" strokeDasharray="3 3" />
  </svg>,
  <svg className={styles.iconSvg} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="8" y="14" width="8" height="7" rx="1" />
    <path d="M6.5 10v2h11v-2 M12 12v2" strokeDasharray="2 2" />
  </svg>,
  <svg className={styles.iconSvg} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <ellipse cx="12" cy="5" rx="9" ry="3" />
    <path d="M3 5v6c0 1.66 4 3 9 3s9-1.34 9-3V5" />
    <path d="M3 11v6c0 1.66 4 3 9 3s9-1.34 9-3v-6" />
    <circle cx="12" cy="12" r="3" fill="none" />
    <line x1="14.2" y1="14.2" x2="19" y2="19" />
  </svg>,
  <svg className={styles.iconSvg} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4.5 16.5c-1.5 1.25-2.5 3.5-2.5 3.5s2.25-1 3.5-2.5M12 2C12 2 15 6 15 9.5c0 1.5-1 2.5-3 2.5s-3-1-3-2.5C9 6 12 2 12 2z" />
    <path d="M12 12v9M9 16l-3 2M15 16l3 2" />
  </svg>,
]

export default function ServicesGrid() {
  const { ref: headerRef, inView: headerVisible } = useInView(0.2)
  const { ref: gridRef, inView: gridVisible } = useInView(0.05)
  const { ref: whoRef, inView: whoVisible } = useInView(0.1)
  const { t } = useTranslation()
  const { servicesGrid: sg } = t

  return (
    <section className="section">
      <div className="container">
        <div ref={headerRef as React.RefObject<HTMLDivElement>}>
          <p className="section-label">{sg.label}</p>
          <h2 className={`${styles.title} reveal ${headerVisible ? 'visible' : ''}`}>{sg.title}</h2>
          <p className={`${styles.sub} reveal stagger-1 ${headerVisible ? 'visible' : ''}`}>{sg.sub}</p>
        </div>

        <div ref={gridRef as React.RefObject<HTMLDivElement>} className={styles.grid}>
          {sg.services.map((s, i) => (
            <div
              key={s.title}
              className={`${styles.card} reveal stagger-${(i % 3) + 1} ${gridVisible ? 'visible' : ''}`}
            >
              <div className={styles.icon}>{SERVICE_ICONS[i]}</div>
              <h3 className={styles.cardTitle}>{s.title}</h3>
              <p className={styles.cardBody}>{s.body}</p>
            </div>
          ))}
        </div>

        <div ref={whoRef as React.RefObject<HTMLDivElement>} className={styles.whoWrap}>
          <p className="section-label" style={{ marginTop: '4rem' }}>{sg.whoLabel}</p>
          <h2 className={`${styles.title} reveal ${whoVisible ? 'visible' : ''}`}>{sg.whoTitle}</h2>
          <div className={styles.whoGrid}>
            {sg.whoFor.map((w, i) => (
              <div
                key={w.label}
                className={`${styles.whoCard} reveal stagger-${i + 1} ${whoVisible ? 'visible' : ''}`}
              >
                <strong>{w.label}</strong>
                <span>{w.desc}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
