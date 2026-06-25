import { Link, useLocation } from 'react-router-dom'
import styles from './Welcome.module.css'

const SECTIONS = [
  {
    slug: 'getting-started',
    title: 'Getting Started',
    desc: 'Install Seshat and run your first autonomous agent in minutes.',
    available: true,
  },
  {
    slug: 'concepts',
    title: 'Concepts',
    desc: 'Understand the ideas that make Seshat different from a framework.',
    available: false,
  },
  {
    slug: 'guides',
    title: 'Guides',
    desc: 'Step-by-step guides for real-world agent workflows.',
    available: false,
  },
  {
    slug: 'api-reference',
    title: 'API Reference',
    desc: 'Complete reference for the REST API, gRPC and Go SDK.',
    available: false,
  },
  {
    slug: 'learn',
    title: 'Learn',
    desc: 'Deep-dives into agentic AI patterns and architecture.',
    available: false,
  },
  {
    slug: 'comparisons',
    title: 'Comparisons',
    desc: 'Honest side-by-side comparisons with popular agent frameworks.',
    available: false,
  },
]

export default function Welcome() {
  const { pathname } = useLocation()
  const base = pathname.startsWith('/fr') ? '/fr/docs' : '/docs'

  return (
    <div className={styles.page}>
      <div className={styles.eyebrow}>Documentation</div>
      <h1 className={styles.title}>
        Build with <span className="gradient-text">Seshat.</span>
      </h1>
      <p className={styles.sub}>
        Everything you need to understand, integrate and extend the Go agent runtime.
        From first install to production multi-agent architecture.
      </p>

      <div className={styles.installBlock}>
        <span className={styles.prompt}>$</span>
        <code className={styles.cmd}>
          curl -fsSL https://raw.githubusercontent.com/EngineerProjects/seshat/main/scripts/install.sh | bash
        </code>
      </div>

      <Link to={`${base}/getting-started/installation`} className={styles.ctaLink}>
        Get started
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <line x1="5" y1="12" x2="19" y2="12" />
          <polyline points="12 5 19 12 12 19" />
        </svg>
      </Link>

      <hr className={styles.divider} />

      <h2 className={styles.sectionTitle}>What's in the docs</h2>
      <div className={styles.grid}>
        {SECTIONS.map(s => {
          const inner = (
            <div key={s.slug} className={`${styles.card} ${s.available ? styles.cardActive : ''}`}>
              <div className={styles.cardHeader}>
                <span className={styles.cardTitle}>{s.title}</span>
                {!s.available && <span className={styles.soon}>soon</span>}
              </div>
              <p className={styles.cardDesc}>{s.desc}</p>
            </div>
          )
          return s.available ? (
            <Link key={s.slug} to={`${base}/${s.slug}`} className={styles.cardLink}>{inner}</Link>
          ) : (
            <div key={s.slug} className={styles.cardLink}>{inner}</div>
          )
        })}
      </div>

      <div className={styles.blogTeaser}>
        <div className={styles.blogHeader}>
          <span className={styles.blogLabel}>Blog</span>
          <span className={styles.soon}>coming soon</span>
        </div>
        <p className={styles.blogDesc}>
          Architecture decisions, Go patterns for AI systems, and lessons from building an agent runtime from scratch.
        </p>
        <ul className={styles.blogList}>
          {[
            'How we built an AI Runtime in Go',
            'Why Go instead of Python for agents',
            'Designing Agent Mailboxes',
            'Memory Architecture for Long-Running Agents',
          ].map(t => (
            <li key={t} className={styles.blogItem}>
              <span className={styles.dot} />
              {t}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
