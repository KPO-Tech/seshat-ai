import React from 'react'
import { useInView } from '../../hooks/useInView'
import { useTranslation } from '../../hooks/useTranslation'
import styles from './Domains.module.css'

const DOMAIN_ICONS = [
  /* Code */
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="16 18 22 12 16 6" />
    <polyline points="8 6 2 12 8 18" />
  </svg>,
  /* Data */
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="20" x2="18" y2="10" />
    <line x1="12" y1="20" x2="12" y2="4" />
    <line x1="6" y1="20" x2="6" y2="14" />
    <polyline points="2 20 22 20" />
  </svg>,
  /* Research */
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
    <line x1="11" y1="8" x2="11" y2="14" />
    <line x1="8" y1="11" x2="14" y2="11" />
  </svg>,
  /* Marketing / Visual */
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <polyline points="21 15 16 10 5 21" />
  </svg>,
  /* Communication */
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>,
  /* 3D */
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
    <line x1="12" y1="22.08" x2="12" y2="12" />
  </svg>,
]

const STATUS_STYLE: Record<string, string> = {
  'Today':       styles.tagToday,
  "Aujourd'hui": styles.tagToday,
  'In progress': styles.tagInProgress,
  'En cours':    styles.tagInProgress,
  'Roadmap':     styles.tagRoadmap,
}

export default function Domains() {
  const { ref, inView } = useInView(0.08)
  const { t } = useTranslation()
  const { domains: d } = t

  return (
    <section className={styles.section}>
      <div className="container" ref={ref as React.RefObject<HTMLDivElement>}>
        <p className="section-label">{d.label}</p>
        <h2 className={`${styles.title} reveal ${inView ? 'visible' : ''}`}>{d.title}</h2>
        <p className={`${styles.sub} reveal stagger-1 ${inView ? 'visible' : ''}`}>{d.sub}</p>

        <div className={styles.grid}>
          {d.items.map((item, i) => {
            const tagCls = STATUS_STYLE[item.tag] ?? styles.tagRoadmap
            return (
              <div
                key={item.title}
                className={`${styles.card} reveal stagger-${(i % 3) + 1} ${inView ? 'visible' : ''}`}
              >
                <div className={styles.cardIcon}>
                  {DOMAIN_ICONS[i]}
                </div>
                <span className={`${styles.tag} ${tagCls}`}>{item.tag}</span>
                <h3 className={styles.cardTitle}>{item.title}</h3>
                <p className={styles.cardBody}>{item.body}</p>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
