import { useInView } from '../../hooks/useInView'
import styles from './ServicesGrid.module.css'

const SERVICES = [
  {
    icon: (
      <svg className={styles.iconSvg} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="6" r="2.5" />
        <circle cx="6" cy="16" r="2.5" />
        <circle cx="18" cy="16" r="2.5" />
        <path d="M9.5 8.5 L7.5 13.5 M16.5 13.5 L14.5 8.5 M8.5 16.5 L15.5 16.5" strokeDasharray="2 2" />
      </svg>
    ),
    title: 'Custom agent team deployment',
    body: 'Design and deploy a team of AI agents tailored to your workflows: document processing, research, ops, customer support, and more.',
  },
  {
    icon: (
      <svg className={styles.iconSvg} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <ellipse cx="12" cy="5" rx="9" ry="3" />
        <path d="M3 5v4c0 1.66 4 3 9 3s9-1.34 9-3V5" />
        <path d="M3 9v4c0 1.66 4 3 9 3s9-1.34 9-3V9" />
        <path d="M3 13v4c0 1.66 4 3 9 3s9-1.34 9-3v-4" />
        <path d="M17 19l3 3M20 19l-3 3" strokeWidth="2.5" />
      </svg>
    ),
    title: 'Data pipelines & automation',
    body: 'Build ETL pipelines, data ingestion flows and knowledge bases that feed your agents in real time. Structured extraction, transformation and vector indexing.',
  },
  {
    icon: (
      <svg className={styles.iconSvg} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
    title: 'Automation workflows',
    body: 'Build autonomous pipelines triggered by schedules, events, or voice. Data extraction, report generation, monitoring and alerting, all automated.',
  },
  {
    icon: (
      <svg className={styles.iconSvg} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="16 18 22 12 16 6" />
        <polyline points="8 6 2 12 8 18" />
        <line x1="12" y1="5" x2="12" y2="19" strokeDasharray="3 3" />
      </svg>
    ),
    title: 'Seshat integration',
    body: 'Embed the Seshat runtime into your existing Go application. SDK integration, custom tool development, provider config, gRPC API setup.',
  },
  {
    icon: (
      <svg className={styles.iconSvg} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="8" y="14" width="8" height="7" rx="1" />
        <path d="M6.5 10v2h11v-2 M12 12v2" strokeDasharray="2 2" />
      </svg>
    ),
    title: 'Multi-agent architecture',
    body: 'Advisory and design for organizations looking to understand how agent teams can augment their existing processes and human teams.',
  },
  {
    icon: (
      <svg className={styles.iconSvg} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <ellipse cx="12" cy="5" rx="9" ry="3" />
        <path d="M3 5v6c0 1.66 4 3 9 3s9-1.34 9-3V5" />
        <path d="M3 11v6c0 1.66 4 3 9 3s9-1.34 9-3v-6" />
        <circle cx="12" cy="12" r="3" fill="none" />
        <line x1="14.2" y1="14.2" x2="19" y2="19" />
      </svg>
    ),
    title: 'Knowledge base + RAG',
    body: 'Set up a hybrid BM25 + vector search knowledge base with document ingestion (PDF, web, Notion…) accessible to your agents in real time.',
  },
  {
    icon: (
      <svg className={styles.iconSvg} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4.5 16.5c-1.5 1.25-2.5 3.5-2.5 3.5s2.25-1 3.5-2.5M12 2C12 2 15 6 15 9.5c0 1.5-1 2.5-3 2.5s-3-1-3-2.5C9 6 12 2 12 2z" />
        <path d="M12 12v9M9 16l-3 2M15 16l3 2" />
      </svg>
    ),
    title: 'Production deployment',
    body: 'From local setup to Kubernetes or a bare VPS. Monitoring, logging, secure API key management, and a stable runtime for long-horizon missions.',
  },
]

const WHO_FOR = [
  { label: 'Enterprises', desc: 'Deploying enterprise AI at scale with governed, auditable multi-agent systems integrated into existing infrastructure.' },
  { label: 'Startups', desc: 'Moving fast and wanting to automate repetitive work without hiring a full AI team.' },
  { label: 'Scale-ups', desc: 'Integrating agents into an existing Go or multi-language backend at production scale.' },
  { label: 'Agencies', desc: 'Adding AI automation as a service to their clients with a maintainable open-source stack.' },
]

export default function ServicesGrid() {
  const { ref: headerRef, inView: headerVisible } = useInView(0.2)
  const { ref: gridRef, inView: gridVisible } = useInView(0.05)
  const { ref: whoRef, inView: whoVisible } = useInView(0.1)

  return (
    <section className="section">
      <div className="container">
        <div ref={headerRef as React.RefObject<HTMLDivElement>}>
          <p className="section-label">What I offer</p>
          <h2 className={`${styles.title} reveal ${headerVisible ? 'visible' : ''}`}>Services</h2>
          <p className={`${styles.sub} reveal stagger-1 ${headerVisible ? 'visible' : ''}`}>
            Whether you need a custom agent deployment, an automation pipeline,
            or architectural advice. I can help.
          </p>
        </div>

        <div ref={gridRef as React.RefObject<HTMLDivElement>} className={styles.grid}>
          {SERVICES.map((s, i) => (
            <div
              key={s.title}
              className={`${styles.card} reveal stagger-${(i % 3) + 1} ${gridVisible ? 'visible' : ''}`}
            >
              <div className={styles.icon}>{s.icon}</div>
              <h3 className={styles.cardTitle}>{s.title}</h3>
              <p className={styles.cardBody}>{s.body}</p>
            </div>
          ))}
        </div>

        <div
          ref={whoRef as React.RefObject<HTMLDivElement>}
          className={styles.whoWrap}
        >
          <p className="section-label" style={{ marginTop: '4rem' }}>Who this is for</p>
          <h2 className={`${styles.title} reveal ${whoVisible ? 'visible' : ''}`}>Good fit for</h2>
          <div className={styles.whoGrid}>
            {WHO_FOR.map((w, i) => (
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
