import styles from './Why.module.css'
import { useInView } from '../../hooks/useInView'
import { useTranslation } from '../../hooks/useTranslation'

const ICONS = [
  <svg className={styles.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <line x1="2" y1="6" x2="10" y2="6" strokeDasharray="2 2" />
    <line x1="2" y1="12" x2="8" y2="12" />
    <line x1="2" y1="18" x2="12" y2="18" strokeDasharray="3 1" />
    <polygon points="13 2 22 2 22 11 13 11" fill="none" />
    <polyline points="13 6 18 6 18 11" />
    <path d="M17 11 L17 22 M22 17 L13 17" />
    <circle cx="17" cy="17" r="1.5" fill="currentColor" />
  </svg>,
  <svg className={styles.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="5" r="3" />
    <circle cx="5" cy="18" r="3" />
    <circle cx="19" cy="18" r="3" />
    <line x1="10" y1="7.5" x2="7" y2="15.5" />
    <line x1="14" y1="7.5" x2="17" y2="15.5" />
    <line x1="8" y1="18" x2="16" y2="18" strokeDasharray="2 2" />
    <circle cx="12" cy="11.5" r="1.5" fill="currentColor" />
  </svg>,
  <svg className={styles.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="2" width="6" height="4" rx="1" />
    <rect x="2" y="14" width="6" height="4" rx="1" />
    <rect x="16" y="14" width="6" height="4" rx="1" />
    <path d="M12 6 L12 10 M12 10 L5 10 L5 14 M12 10 L19 10 L19 14" />
    <rect x="10" y="9" width="4" height="3" rx="0.5" fill="currentColor" stroke="none" />
  </svg>,
  <svg className={styles.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <polyline points="9 11 11 13 15 9" />
  </svg>,
]

export default function Why() {
  const { ref, inView } = useInView(0.1)
  const { t } = useTranslation()

  return (
    <section className={styles.section}>
      <div className="container">
        <p className="section-label">{t.why.label}</p>
        <h2 className={`${styles.title} reveal ${inView ? 'visible' : ''}`}>
          {t.why.title}
        </h2>
        <p className={`${styles.sub} reveal stagger-1 ${inView ? 'visible' : ''}`}>
          {t.why.sub}
        </p>

        <div ref={ref as React.RefObject<HTMLDivElement>} className={styles.grid}>
          {t.why.cards.map((c, i) => (
            <div key={i} className={`${styles.card} reveal stagger-${i + 1} ${inView ? 'visible' : ''}`}>
              <div className={styles.iconWrap}>{ICONS[i]}</div>
              <h3 className={styles.cardTitle}>{c.title}</h3>
              <p className={styles.cardBody}>{c.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
