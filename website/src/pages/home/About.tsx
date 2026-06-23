import { useState } from 'react'
import { useInView } from '../../hooks/useInView'
import { useTranslation } from '../../hooks/useTranslation'
import styles from './About.module.css'

export default function About() {
  const [openIndex, setOpenIndex] = useState<number | null>(0)
  const { ref, inView } = useInView(0.1)
  const { t } = useTranslation()

  return (
    <section className={styles.section}>
      <div className="container">
        <p className="section-label">{t.about.label}</p>
        <h2 className={`${styles.title} reveal ${inView ? 'visible' : ''}`}>
          {t.about.title}
        </h2>
        <p className={`${styles.sub} reveal stagger-1 ${inView ? 'visible' : ''}`}>
          {t.about.sub}
        </p>

        <div
          ref={ref as React.RefObject<HTMLDivElement>}
          className={styles.accordion}
        >
          {t.about.items.map((item, i) => {
            const isOpen = openIndex === i
            return (
              <div
                key={item.number}
                className={`${styles.item} reveal stagger-${i + 1} ${inView ? 'visible' : ''} ${isOpen ? styles.itemOpen : ''}`}
              >
                <button
                  className={styles.header}
                  onClick={() => setOpenIndex(isOpen ? null : i)}
                  aria-expanded={isOpen}
                >
                  <span className={styles.number}>{item.number}</span>
                  <div className={styles.headerMeta}>
                    <span className={styles.tag}>{item.tag}</span>
                    <span className={styles.itemTitle}>{item.title}</span>
                  </div>
                  <svg
                    className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ''}`}
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>

                <div className={`${styles.body} ${isOpen ? styles.bodyOpen : ''}`}>
                  <div className={styles.bodyInner}>
                    {item.body.split('\n\n').map((para, j) => (
                      <p key={j} className={styles.para}>{para}</p>
                    ))}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
