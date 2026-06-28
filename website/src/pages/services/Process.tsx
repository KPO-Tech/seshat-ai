import { useInView } from '../../hooks/useInView'
import { useTranslation } from '../../hooks/useTranslation'
import styles from './Process.module.css'

export default function Process() {
  const { ref, inView } = useInView(0.1)
  const { t } = useTranslation()
  const { process: proc } = t

  return (
    <section className={styles.section} id="process-section">
      <div className="container">
        <p className="section-label">{proc.label}</p>
        <h2 className={`${styles.title} reveal ${inView ? 'visible' : ''}`}>{proc.title}</h2>
        <p className={`${styles.sub} reveal stagger-1 ${inView ? 'visible' : ''}`}>{proc.sub}</p>

        <div
          ref={ref as React.RefObject<HTMLDivElement>}
          className={`${styles.steps} ${inView ? styles.stepsVisible : ''}`}
        >
          {proc.steps.map((s, i) => (
            <div
              key={s.n}
              className={`${styles.step} reveal stagger-${i + 1} ${inView ? 'visible' : ''}`}
            >
              <div className={styles.num}>{s.n}</div>
              <div className={styles.stepContent}>
                <h3 className={styles.stepTitle}>{s.title}</h3>
                <p className={styles.stepBody}>{s.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
