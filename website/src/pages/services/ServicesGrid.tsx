import React, { useState } from 'react'
import { useInView } from '../../hooks/useInView'
import { useTranslation } from '../../hooks/useTranslation'
import styles from './ServicesGrid.module.css'

const CATEGORY_META: Record<string, { color: string; dot: string }> = {
  automation:  { color: styles.catOrange,  dot: 'var(--brand-engine-start)' },
  agents:      { color: styles.catPurple,  dot: 'var(--brand-platform-start)' },
  data:        { color: styles.catGreen,   dot: 'var(--green)' },
  engineering: { color: styles.catBlue,    dot: 'var(--blue)' },
}

const SERVICE_ICONS: Record<string, React.ReactElement> = {
  automation_0: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </svg>
  ),
  automation_1: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  ),
  automation_2: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
      <path d="M8 11h6M11 8v6" strokeDasharray="2 1" />
    </svg>
  ),
  agents_0: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
      <path d="M16 12l2 2 4-4" strokeWidth="2" />
    </svg>
  ),
  agents_1: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M3 5v6c0 1.66 4 3 9 3s9-1.34 9-3V5" />
      <path d="M3 11v6c0 1.66 4 3 9 3s9-1.34 9-3v-6" />
      <circle cx="17" cy="17" r="3" fill="none" />
      <line x1="19.1" y1="19.1" x2="22" y2="22" />
    </svg>
  ),
  data_0: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
      <polyline points="2 20 22 20" />
    </svg>
  ),
  data_1: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  ),
  engineering_0: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  ),
  engineering_1: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 11 12 14 22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  ),
}

export default function ServicesGrid() {
  const [activeFilter, setActiveFilter] = useState('all')
  const { ref: headerRef, inView: headerVisible } = useInView(0.2)
  const { ref: gridRef, inView: gridVisible } = useInView(0.05)
  const { ref: whoRef, inView: whoVisible } = useInView(0.1)
  const { t } = useTranslation()
  const { servicesGrid: sg } = t

  const categoryIndexMap: Record<string, number> = {}
  const services = sg.services.map(s => {
    const cat = s.category
    const idx = categoryIndexMap[cat] ?? 0
    categoryIndexMap[cat] = idx + 1
    return { ...s, iconKey: `${cat}_${idx}` }
  })

  const filtered = activeFilter === 'all'
    ? services
    : services.filter(s => s.category === activeFilter)

  return (
    <section className="section">
      <div className="container">
        <div ref={headerRef as React.RefObject<HTMLDivElement>}>
          <p className="section-label">{sg.label}</p>
          <h2 className={`${styles.title} reveal ${headerVisible ? 'visible' : ''}`}>
            {sg.title}
          </h2>
          <p className={`${styles.sub} reveal stagger-1 ${headerVisible ? 'visible' : ''}`}>
            {sg.sub}
          </p>
        </div>

        <div className={`${styles.filterBar} reveal stagger-2 ${headerVisible ? 'visible' : ''}`}>
          <button
            className={`${styles.filterBtn} ${activeFilter === 'all' ? styles.filterBtnActive : ''}`}
            onClick={() => setActiveFilter('all')}
          >
            {sg.filterAll}
            <span className={styles.filterCount}>{services.length}</span>
          </button>
          {sg.categories.map(cat => (
            <button
              key={cat.id}
              className={`${styles.filterBtn} ${activeFilter === cat.id ? styles.filterBtnActive : ''} ${CATEGORY_META[cat.id]?.color}`}
              onClick={() => setActiveFilter(cat.id)}
            >
              {cat.label}
              <span className={styles.filterCount}>
                {services.filter(s => s.category === cat.id).length}
              </span>
            </button>
          ))}
        </div>

        <div ref={gridRef as React.RefObject<HTMLDivElement>} className={styles.grid}>
          {filtered.map((s, i) => {
            const meta = CATEGORY_META[s.category]
            const icon = SERVICE_ICONS[s.iconKey]
            const catLabel = sg.categories.find(c => c.id === s.category)?.label ?? s.category
            return (
              <div
                key={s.title}
                className={`${styles.card} reveal stagger-${(i % 3) + 1} ${gridVisible ? 'visible' : ''}`}
                style={{ '--cat-dot': meta?.dot } as React.CSSProperties}
              >
                <div className={styles.cardTop}>
                  <div className={`${styles.iconWrap} ${meta?.color}`}>
                    {icon}
                  </div>
                  <span className={`${styles.catBadge} ${meta?.color}`}>
                    <span className={styles.catDot} />
                    {catLabel}
                  </span>
                </div>
                <h3 className={styles.cardTitle}>{s.title}</h3>
                <p className={styles.tagline}>{s.tagline}</p>
                <p className={styles.cardBody}>{s.body}</p>
                <ul className={styles.bullets}>
                  {s.bullets.map(b => (
                    <li key={b} className={styles.bullet}>
                      <span className={styles.bulletDot} />
                      {b}
                    </li>
                  ))}
                </ul>
                <div className={styles.cardFooter}>
                  <span className={styles.pricingBadge}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M12 6v6l4 2" />
                    </svg>
                    Tarif sur devis
                  </span>
                  <a href="mailto:oastephaneamiche@gmail.com" className={styles.cardCta}>
                    Nous contacter
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="7" y1="17" x2="17" y2="7" />
                      <polyline points="7 7 17 7 17 17" />
                    </svg>
                  </a>
                </div>
              </div>
            )
          })}
        </div>

        <div className={`${styles.pricingNote} reveal ${gridVisible ? 'visible' : ''}`}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          {sg.pricingNote}
        </div>
<div className={`${styles.customCard} reveal stagger-1 ${gridVisible ? 'visible' : ''}`}>
  <div className={styles.customCardTop}>
    <span className={styles.customPill}>{sg.customCard.label}</span>
    <a href="mailto:oastephaneamiche@gmail.com" className={styles.customCta}>
      {sg.customCard.cta}
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <line x1="7" y1="17" x2="17" y2="7" />
        <polyline points="7 7 17 7 17 17" />
      </svg>
    </a>
  </div>
  <h3 className={styles.customTitle}>{sg.customCard.title}</h3>
  <p className={styles.customBody}>{sg.customCard.body}</p>
  <ul className={styles.customBullets}>
    {sg.customCard.bullets.map(b => (
      <li key={b} className={styles.customBullet}>
        <span className={styles.customBulletDot} />
        {b}
      </li>
    ))}
  </ul>
</div>


        <div ref={whoRef as React.RefObject<HTMLDivElement>} className={styles.whoWrap}>
          <p className="section-label" style={{ marginTop: '5rem' }}>{sg.whoLabel}</p>
          <h2 className={`${styles.title} reveal ${whoVisible ? 'visible' : ''}`}>{sg.whoTitle}</h2>
          <div className={styles.whoGrid}>
            {sg.whoFor.map((w, i) => (
              <div
                key={w.label}
                className={`${styles.whoCard} reveal stagger-${i + 1} ${whoVisible ? 'visible' : ''}`}
              >
                <strong className={styles.whoLabel}>{w.label}</strong>
                <span className={styles.whoDesc}>{w.desc}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
