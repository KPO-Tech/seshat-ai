import styles from './Why.module.css'
import { useInView } from '../../hooks/useInView'

const CARDS = [
  {
    title: 'Go, not Python',
    body: 'Single statically linked binary. No venv, no dependency hell. Low latency, predictable memory, deploys anywhere: Raspberry Pi, VPS, Kubernetes.',
    icon: (
      <svg className={styles.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {/* Speed / Compilation lines */}
        <line x1="2" y1="6" x2="10" y2="6" strokeDasharray="2 2" />
        <line x1="2" y1="12" x2="8" y2="12" />
        <line x1="2" y1="18" x2="12" y2="18" strokeDasharray="3 1" />
        {/* Go/Gopher binary representation */}
        <polygon points="13 2 22 2 22 11 13 11" fill="none" />
        <polyline points="13 6 18 6 18 11" />
        <path d="M17 11 L17 22 M22 17 L13 17" />
        <circle cx="17" cy="17" r="1.5" fill="currentColor" />
      </svg>
    )
  },
  {
    title: 'Teams, not pipelines',
    body: 'Agent A → B is orchestration. Seshat is building the next layer: roles, inboxes, shared mission memory, and structured inter-agent coordination.',
    icon: (
      <svg className={styles.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {/* Network Nodes */}
        <circle cx="12" cy="5" r="3" />
        <circle cx="5" cy="18" r="3" />
        <circle cx="19" cy="18" r="3" />
        {/* Team connections */}
        <line x1="10" y1="7.5" x2="7" y2="15.5" />
        <line x1="14" y1="7.5" x2="17" y2="15.5" />
        <line x1="8" y1="18" x2="16" y2="18" strokeDasharray="2 2" />
        {/* Communication loop packet */}
        <circle cx="12" cy="11.5" r="1.5" fill="currentColor" />
      </svg>
    )
  },
  {
    title: 'Human orgs as the model',
    body: 'Real teams have roles, inboxes, meetings, status reports, and shared decisions. We reproduce those coordination patterns with autonomous agents.',
    icon: (
      <svg className={styles.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {/* Org chart tree */}
        <rect x="9" y="2" width="6" height="4" rx="1" />
        <rect x="2" y="14" width="6" height="4" rx="1" />
        <rect x="16" y="14" width="6" height="4" rx="1" />
        {/* Hierarchy lines */}
        <path d="M12 6 L12 10 M12 10 L5 10 L5 14 M12 10 L19 10 L19 14" />
        {/* Shared inbox envelope in the middle */}
        <rect x="10" y="9" width="4" height="3" rx="0.5" fill="currentColor" stroke="none" />
      </svg>
    )
  },
  {
    title: 'Production-grade today',
    body: 'Persistent sessions, sandboxed execution, encrypted config, RAG, skills, 15+ providers. Useful as a CLI, SDK, or gRPC engine. Right now.',
    icon: (
      <svg className={styles.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {/* Shield with check */}
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <polyline points="9 11 11 13 15 9" />
      </svg>
    )
  }
]

export default function Why() {
  const { ref, inView } = useInView(0.1)

  return (
    <section className={styles.section}>
      <div className="container">
        <p className="section-label">Why Seshat</p>
        <h2 className={`${styles.title} reveal ${inView ? 'visible' : ''}`}>
          The gap no one is filling
        </h2>
        <p className={`${styles.sub} reveal stagger-1 ${inView ? 'visible' : ''}`}>
          Individual agents are impressive. The hard, unsolved problem is how multiple agents
          work together in a coherent, observable, economically useful way.
        </p>

        <div
          ref={ref as React.RefObject<HTMLDivElement>}
          className={styles.grid}
        >
          {CARDS.map((c, i) => (
            <div
              key={c.title}
              className={`${styles.card} reveal stagger-${i + 1} ${inView ? 'visible' : ''}`}
            >
              <div className={styles.iconWrap}>{c.icon}</div>
              <h3 className={styles.cardTitle}>{c.title}</h3>
              <p className={styles.cardBody}>{c.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
