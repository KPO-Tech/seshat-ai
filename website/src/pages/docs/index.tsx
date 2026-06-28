import { Link, useLocation } from 'react-router-dom'
import BashLine from '../../components/code/BashLine'
import { useInView } from '../../hooks/useInView'
import styles from './Docs.module.css'

type Section = {
  slug: string
  icon: React.ReactNode
  title: string
  desc: string
  items: string[]
  available: boolean
  href?: string
}

const sections: Section[] = [
  {
    slug: 'getting-started',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="5 3 19 12 5 21 5 3" />
      </svg>
    ),
    title: 'Getting Started',
    desc: 'Install Seshat and run your first autonomous agent in minutes.',
    items: ['Installation', 'Quick Start', 'Configuration', 'First Agent'],
    available: true,
  },
  {
    slug: 'concepts',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
      </svg>
    ),
    title: 'Concepts',
    desc: 'Understand the ideas that make Seshat different from a framework.',
    items: ['Agent Runtime vs Framework', 'Agent Teams & Mailboxes', 'Memory & RAG', 'Skills & MCP'],
    available: true,
  },
  {
    slug: 'learn',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
      </svg>
    ),
    title: 'Learn',
    desc: 'Deep-dives into agentic AI concepts, patterns and architecture.',
    items: ['Vision & Direction', 'What is an Agent Runtime?', 'Why Go for AI Agents?', 'Technical Hypotheses'],
    available: true,
  },
  {
    slug: 'comparisons',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    ),
    title: 'Comparisons',
    desc: 'Honest side-by-side comparisons with popular agent frameworks.',
    items: ['Seshat vs LangGraph', 'Seshat vs CrewAI', 'Seshat vs AutoGen', 'Seshat vs OpenAI Agents SDK'],
    available: false,
  },
  {
    slug: 'use-cases',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
        <line x1="8" y1="21" x2="16" y2="21" />
        <line x1="12" y1="17" x2="12" y2="21" />
      </svg>
    ),
    title: 'Use Cases',
    desc: 'Real-world deployments across industries built with Seshat.',
    items: ['Government & Public Sector', 'Finance & Compliance', 'Customer Support', 'Research & Analysis'],
    available: false,
  },
  {
    slug: 'api-reference',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="16 18 22 12 16 6" />
        <polyline points="8 6 2 12 8 18" />
      </svg>
    ),
    title: 'API Reference',
    desc: 'Complete reference for the REST API, gRPC and Go SDK.',
    items: ['REST API', 'gRPC API', 'Go SDK', 'MCP Protocol'],
    available: false,
  },
]

export default function Docs() {
  const { ref, inView } = useInView(0.05)

  return (
    <div className={styles.page}>
      <style>{`
        .docs-search-icon { color: var(--text-muted); }
      `}</style>

      {/* ── Hero ── */}
      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <p className="section-label">Documentation</p>
          <h1 className={styles.heroTitle}>
            Build with{' '}
            <span className="gradient-text">Seshat.</span>
          </h1>
          <p className={styles.heroSub}>
            Everything you need to understand, integrate and extend the Go agent runtime. From first install to production multi-agent architecture.
          </p>

          <div className={styles.searchWrap}>
            <svg className="docs-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              className={styles.searchInput}
              type="search"
              placeholder="Search documentation… (coming soon)"
              disabled
            />
          </div>
        </div>
      </section>

      {/* ── Quick Start Banner ── */}
      <div className={styles.quickBanner} ref={ref as React.RefObject<HTMLDivElement>}>
        <div className={`${styles.quickInner} reveal ${inView ? 'visible' : ''}`}>
          <div className={styles.quickLeft}>
            <span className={styles.quickLabel}>Quick Start</span>
            <p className={styles.quickTitle}>Up and running in 60 seconds</p>
            <p className={styles.quickSub}>Install the binary, point to your LLM provider and run your first agent.</p>
          </div>
          <div className={styles.quickCode}>
            <BashLine
              code="curl -fsSL https://raw.githubusercontent.com/EngineerProjects/seshat/main/scripts/install.sh | bash"
              className={styles.quickCommand}
            />
          </div>
          <a
            href="https://github.com/EngineerProjects/seshat#installation"
            className={styles.quickCta}
            target="_blank"
            rel="noreferrer"
          >
            View on GitHub
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </a>
        </div>
      </div>

      {/* ── Sections Grid ── */}
      <section className={styles.sections}>
        <div className={styles.sectionsInner}>
          <div className={styles.grid}>
            {sections.map((s, i) => (
              <SectionCard key={s.slug} section={s} delay={i} />
            ))}
          </div>
        </div>
      </section>

      {/* ── Blog teaser ── */}
      <section className={styles.blogTeaser}>
        <div className={styles.blogInner}>
          <div className={styles.blogLeft}>
            <p className="section-label">Blog</p>
            <h2 className={styles.blogTitle}>Engineering notes</h2>
            <p className={styles.blogSub}>
              Architecture decisions, Go patterns for AI systems, and lessons from building an agent runtime from scratch.
            </p>
            <span className={styles.comingSoonPill}>Coming soon</span>
          </div>
          <div className={styles.blogPosts}>
            {[
              'How we built an AI Runtime in Go',
              'Why Go instead of Python for agents',
              'Designing Agent Mailboxes',
              'Memory Architecture for Long-Running Agents',
            ].map((title) => (
              <div key={title} className={styles.blogPost}>
                <span className={styles.blogDot} />
                <span className={styles.blogPostTitle}>{title}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}

function SectionCard({ section, delay }: { section: Section; delay: number }) {
  const { ref, inView } = useInView(0.1)
  const { pathname } = useLocation()
  const base = pathname.startsWith('/fr') ? '/fr/docs' : '/docs'

  const inner = (
    <div
      className={`${styles.card} ${section.available ? styles.cardAvailable : styles.cardSoon} reveal stagger-${Math.min(delay + 1, 6)} ${inView ? 'visible' : ''}`}
      ref={ref as React.RefObject<HTMLDivElement>}
    >
      <div className={styles.cardHead}>
        <div className={`${styles.cardIcon} ${section.available ? styles.cardIconAvailable : ''}`}>
          {section.icon}
        </div>
        {section.available ? (
          <span className={styles.availableBadge}>Available</span>
        ) : (
          <span className={styles.soonBadge}>Coming soon</span>
        )}
      </div>
      <h3 className={styles.cardTitle}>{section.title}</h3>
      <p className={styles.cardDesc}>{section.desc}</p>
      <ul className={styles.cardItems}>
        {section.items.map((item) => (
          <li key={item} className={styles.cardItem}>
            <span className={styles.cardItemDot} />
            {item}
          </li>
        ))}
      </ul>
      {section.available && (
        <span className={styles.cardArrow}>
          Read →
        </span>
      )}
    </div>
  )

  if (section.available) {
    return (
      <Link to={`${base}/${section.slug}`} className={styles.cardLink}>
        {inner}
      </Link>
    )
  }

  return <div className={styles.cardLink}>{inner}</div>
}
