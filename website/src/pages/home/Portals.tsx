import React from 'react'
import { useInView } from '../../hooks/useInView'
import { useTranslation } from '../../hooks/useTranslation'
import styles from './Portals.module.css'

const PORTAL_ICONS = [
  /* CLI */
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="4 17 10 11 4 5" />
    <line x1="12" y1="19" x2="20" y2="19" />
  </svg>,
  /* REST API */
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </svg>,
  /* gRPC */
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="18" cy="5" r="3" />
    <circle cx="6" cy="12" r="3" />
    <circle cx="18" cy="19" r="3" />
    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
  </svg>,
  /* Desktop */
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="3" width="20" height="14" rx="2" />
    <line x1="8" y1="21" x2="16" y2="21" />
    <line x1="12" y1="17" x2="12" y2="21" />
  </svg>,
]

const COLOR_CLASSES = [styles.colorEngine, styles.colorGreen, styles.colorBlue, styles.colorPlatform]
const TAG_COLOR_CLASSES = [styles.tagEngine, styles.tagGreen, styles.tagBlue, styles.tagPlatform]

export default function Portals() {
  const { ref, inView } = useInView(0.1)
  const { t } = useTranslation()
  const { portals: p } = t

  return (
    <section className={styles.section}>
      <div className="container" ref={ref as React.RefObject<HTMLDivElement>}>
        <p className="section-label">{p.label}</p>
        <h2 className={`${styles.title} reveal ${inView ? 'visible' : ''}`}>{p.title}</h2>
        <p className={`${styles.sub} reveal stagger-1 ${inView ? 'visible' : ''}`}>{p.sub}</p>

        <div className={styles.grid}>
          {p.items.map((item, i) => (
            <div
              key={item.tag}
              className={`${styles.card} reveal stagger-${i + 1} ${inView ? 'visible' : ''}`}
            >
              <div className={`${styles.iconBox} ${COLOR_CLASSES[i]}`}>
                {PORTAL_ICONS[i]}
              </div>
              <span className={`${styles.tag} ${TAG_COLOR_CLASSES[i]}`}>{item.tag}</span>
              <h3 className={styles.cardTitle}>{item.title}</h3>
              <p className={styles.cardBody}>{item.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
