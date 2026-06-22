import { useInView } from '../../hooks/useInView'
import styles from './Process.module.css'

const STEPS = [
  {
    n: '1',
    title: 'Discovery call (30 min)',
    body: 'Tell me about your use case, stack, and constraints. I will tell you what is realistic and how I would approach it.',
  },
  {
    n: '2',
    title: 'Architecture proposal',
    body: 'A short written proposal with the agent design, tool stack, integration points, and a delivery timeline. No fluff.',
  },
  {
    n: '3',
    title: 'Build + iterate',
    body: 'I build the system, you test and give feedback. Iterative: you see progress early, not just a final deliverable.',
  },
  {
    n: '4',
    title: 'Handoff + support',
    body: 'Clean code, documented deployment, and a handoff session. Optional ongoing support for adjustments and extensions.',
  },
]

export default function Process() {
  const { ref, inView } = useInView(0.1)

  return (
    <section className={styles.section}>
      <div className="container">
        <p className="section-label">How it works</p>
        <h2 className={`${styles.title} reveal ${inView ? 'visible' : ''}`}>Simple process</h2>
        <p className={`${styles.sub} reveal stagger-1 ${inView ? 'visible' : ''}`}>
          No long discovery phases. I move fast and focus on what actually ships.
        </p>

        <div
          ref={ref as React.RefObject<HTMLDivElement>}
          className={`${styles.steps} ${inView ? styles.stepsVisible : ''}`}
        >
          {STEPS.map((s, i) => (
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
