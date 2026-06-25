import { Link, useLocation } from 'react-router-dom'
import BashLine from '../../components/code/BashLine'
import { DOC_SECTIONS } from './docs-nav'
import styles from './Welcome.module.css'

type QuickPath = {
  title: string
  desc: string
  href?: string
  soon?: boolean
}

const QUICK_PATHS: QuickPath[] = [
  {
    title: 'Try the CLI',
    desc: 'Install the binary, configure a provider, and run your first autonomous agent locally.',
    href: '/getting-started/installation',
  },
  {
    title: 'Embed the SDK',
    desc: 'Use the Go runtime inside your own application once the SDK reference lands.',
    soon: true,
  },
  {
    title: 'Understand the Architecture',
    desc: 'Learn how the runtime, tools, MCP, memory, and platform layers fit together.',
    href: '/concepts',
    soon: true,
  },
  {
    title: 'Self-Host the Platform',
    desc: 'Navigate from the runtime docs toward SeshatOS, the multi-user API and desktop layer built on top.',
    href: '/guides/desktop',
    soon: true,
  },
  {
    title: 'Join the Community',
    desc: 'Understand the project vision, the two repositories, and where to contribute across the runtime, CLI app, desktop app, and future SDKs.',
    href: '/contribution',
  },
]

const START_HERE: string[] = [
  'Install the `seshat` binary',
  'Configure at least one provider',
  'Run your first CLI session',
  'Move into concepts, guides, or SDK integration',
] as const

export default function Welcome() {
  const { pathname } = useLocation()
  const base = pathname.startsWith('/fr') ? '/fr/docs' : '/docs'
  const sections = DOC_SECTIONS.map(section => ({
    ...section,
    availableCount: section.articles.filter(article => article.available).length,
  }))
  const availableSections = sections.filter(section => section.availableCount > 0)
  const plannedSections = sections.filter(section => section.availableCount === 0)

  return (
    <div className={styles.page}>
      <div className={styles.eyebrow}>Documentation</div>
      <h1 className={styles.title}>
        Start here for <span className="gradient-text">Seshat.</span>
      </h1>
      <p className={styles.sub}>
        This documentation is the entry point for the open-source `seshat` runtime:
        CLI, Go SDK, core concepts, and the platform layers built on top of it.
        Use this page to choose the right path before diving into articles.
      </p>

      <div className={styles.heroCard}>
        <div className={styles.heroMeta}>
          <span className={styles.heroLabel}>What these docs cover</span>
          <div className={styles.heroGrid}>
            <div className={styles.heroPanel}>
              <h2 className={styles.heroPanelTitle}>seshat</h2>
              <p className={styles.heroPanelDesc}>
                The open-source Go runtime: agent loop, tools, permissions, MCP, RAG,
                sessions, CLI, gRPC, and SDK.
              </p>
            </div>
            <div className={styles.heroPanel}>
              <h2 className={styles.heroPanelTitle}>SeshatOS / seshat-ai</h2>
              <p className={styles.heroPanelDesc}>
                The product platform built on top: multi-user API, organizations,
                workspaces, audit, scheduler, desktop application, and governance.
              </p>
            </div>
          </div>
        </div>

        <div className={styles.installBlock}>
          <BashLine
            code="curl -fsSL https://raw.githubusercontent.com/EngineerProjects/seshat/main/scripts/install.sh | bash"
            className={styles.installCommand}
          />
        </div>

        <div className={styles.heroActions}>
          <Link to={`${base}/getting-started/installation`} className={styles.ctaLink}>
            Go to installation
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </Link>
          <Link to={`${base}/contribution`} className={styles.secondaryLink}>
            Contribution guide
          </Link>
          <a
            href="https://github.com/EngineerProjects/seshat"
            className={styles.secondaryLink}
            target="_blank"
            rel="noreferrer"
          >
            View runtime repository
          </a>
        </div>
      </div>

      <hr className={styles.divider} />

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Choose your path</h2>
        <p className={styles.sectionIntro}>
          Pick the entry point that matches what you are trying to do. This page is meant to orient, not to act like a landing page.
        </p>
        <div className={styles.grid}>
          {QUICK_PATHS.map(path => {
            const content = (
              <div className={`${styles.card} ${path.soon ? '' : styles.cardActive}`}>
                <div className={styles.cardHeader}>
                  <span className={styles.cardTitle}>{path.title}</span>
                  {path.soon && <span className={styles.soon}>soon</span>}
                </div>
                <p className={styles.cardDesc}>{path.desc}</p>
              </div>
            )

            if (path.href && !path.soon) {
              return (
                <Link key={path.title} to={`${base}${path.href}`} className={styles.cardLink}>
                  {content}
                </Link>
              )
            }

            return (
              <div key={path.title} className={styles.cardLink}>
                {content}
              </div>
            )
          })}
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>How the ecosystem is split</h2>
        <div className={styles.stack}>
          <div className={styles.stackItem}>
            <span className={styles.stackLabel}>Interfaces</span>
            <p className={styles.stackText}>CLI, Go SDK, gRPC clients, and later platform UIs consume the same runtime foundation.</p>
          </div>
          <div className={styles.stackArrow}>↓</div>
          <div className={styles.stackItem}>
            <span className={styles.stackLabel}>Runtime Core</span>
            <p className={styles.stackText}>`seshat` provides tools, permissions, memory, MCP, RAG, sessions, execution, and agent primitives.</p>
          </div>
          <div className={styles.stackArrow}>↓</div>
          <div className={styles.stackItem}>
            <span className={styles.stackLabel}>Platform Layer</span>
            <p className={styles.stackText}>`seshat-ai` / SeshatOS adds multi-user APIs, workspaces, quotas, audit, scheduled jobs, and desktop UX.</p>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Start here</h2>
        <div className={styles.startCard}>
          <ol className={styles.startList}>
            {START_HERE.map(step => (
              <li key={step} className={styles.startItem}>{step}</li>
            ))}
          </ol>

          <div className={styles.quickLinks}>
            <Link to={`${base}/getting-started/installation`} className={styles.quickLink}>Installation</Link>
            <Link to={`${base}/getting-started`} className={styles.quickLink}>Getting Started</Link>
            <Link to={`${base}/concepts`} className={styles.quickLink}>Concepts</Link>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Documentation status</h2>
        <p className={styles.sectionIntro}>
          The structure is broader than the currently published content. This page reflects the real state instead of pretending every section is already complete.
        </p>

        <div className={styles.statusGrid}>
          <div className={styles.statusCard}>
            <div className={styles.statusHeader}>
              <span className={styles.statusTitle}>Available now</span>
              <span className={styles.statusCount}>{availableSections.length}</span>
            </div>
            <ul className={styles.statusList}>
              {availableSections.map(section => (
                <li key={section.slug} className={styles.statusItem}>
                  <Link to={`${base}/${section.slug}`} className={styles.statusLink}>
                    {section.title}
                  </Link>
                  <span className={styles.statusMeta}>
                    {section.availableCount} article{section.availableCount > 1 ? 's' : ''}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className={styles.statusCard}>
            <div className={styles.statusHeader}>
              <span className={styles.statusTitle}>Planned next</span>
              <span className={styles.statusCount}>{plannedSections.length}</span>
            </div>
            <ul className={styles.statusList}>
              {plannedSections.map(section => (
                <li key={section.slug} className={styles.statusItem}>
                  <span className={styles.statusText}>{section.title}</span>
                  <span className={styles.soon}>planned</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>What is in the docs</h2>
        <div className={styles.grid}>
          {sections.map(section => {
            const content = (
              <div className={`${styles.card} ${section.availableCount > 0 ? styles.cardActive : ''}`}>
                <div className={styles.cardHeader}>
                  <span className={styles.cardTitle}>{section.title}</span>
                  {section.availableCount > 0 ? (
                    <span className={styles.availablePill}>
                      {section.availableCount} live
                    </span>
                  ) : (
                    <span className={styles.soon}>soon</span>
                  )}
                </div>
                <p className={styles.cardDesc}>{section.desc}</p>
              </div>
            )

            return section.availableCount > 0 ? (
              <Link key={section.slug} to={`${base}/${section.slug}`} className={styles.cardLink}>
                {content}
              </Link>
            ) : (
              <div key={section.slug} className={styles.cardLink}>
                {content}
              </div>
            )
          })}
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Reference repositories</h2>
        <div className={styles.repoGrid}>
          <a
            href="https://github.com/EngineerProjects/seshat"
            className={styles.repoCard}
            target="_blank"
            rel="noreferrer"
          >
            <span className={styles.repoName}>seshat</span>
            <p className={styles.repoDesc}>Open-source runtime, CLI, SDK, providers, tools, MCP, RAG, and execution engine.</p>
          </a>
          <a
            href="https://github.com/EngineerProjects/seshat-ai"
            className={styles.repoCard}
            target="_blank"
            rel="noreferrer"
          >
            <span className={styles.repoName}>seshat-ai</span>
            <p className={styles.repoDesc}>Platform layer with multi-user API, workspaces, scheduler, governance, and desktop application.</p>
          </a>
        </div>
      </section>
    </div>
  )
}
