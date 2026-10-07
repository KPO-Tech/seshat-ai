import { Link, useLocation } from 'react-router-dom'
import BashLine from '../../components/code/BashLine'
import { DOC_SECTIONS } from './docs-nav'
import { useDocsMeta } from './useDocsMeta'
import styles from './Welcome.module.css'

type QuickPath = {
  title: string
  desc: string
  href: string
}

const QUICK_PATHS: QuickPath[] = [
  {
    title: 'Install the CLI',
    desc: 'Install the runtime locally, configure a provider, and run your first session.',
    href: '/getting-started/installation',
  },
  {
    title: 'Run your first agent',
    desc: 'Start with the quick start and first-agent flow before exploring deeper architecture.',
    href: '/getting-started/quick-start',
  },
  {
    title: 'Understand the architecture',
    desc: 'Learn how sessions, tools, permissions, memory, MCP, and execution fit together.',
    href: '/concepts/what-is-seshat',
  },
  {
    title: 'Build workflows in Go',
    desc: 'Use the Go SDK to compose workflows, agent teams, and controlled runtime loops.',
    href: '/sdk/go',
  },
  {
    title: 'Read the project direction',
    desc: 'See the broad open-source thesis, the wedge, and where the public runtime is going.',
    href: '/learn/vision',
  },
  {
    title: 'Join the community',
    desc: 'Contribute to the runtime, documentation, skills, examples, and future SDK layers.',
    href: '/contribution',
  },
]

const START_HERE: string[] = [
  'Install the `seshat` binary',
  'Configure one provider and run the quick start',
  'Understand the runtime model before building larger workflows',
  'Move into the Go SDK, concepts, or contribution paths',
] as const

export default function Welcome() {
  const { pathname } = useLocation()
  const base = pathname.startsWith('/fr') ? '/fr/docs' : '/docs'
  useDocsMeta(
    'Seshat Docs | Start Here',
    'Start here for the Seshat documentation: CLI setup, architecture concepts, Go SDK, APIs, workflows, and contribution paths for the open-source agent runtime.',
  )

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
        This page now carries the broader runtime and product story. The homepage is focused on the business wedge.
        The docs are where the open-source runtime, architecture, workflow model, and long-term direction should live.
      </p>

      <div className={styles.heroCard}>
        <div className={styles.heroMeta}>
          <span className={styles.heroLabel}>What these docs cover</span>
          <div className={styles.heroGrid}>
            <div className={styles.heroPanel}>
              <h2 className={styles.heroPanelTitle}>Open runtime</h2>
              <p className={styles.heroPanelDesc}>
                `seshat` is the public Go runtime: sessions, tools, permissions, MCP, memory, RAG, providers,
                CLI, gRPC, and SDK surfaces.
              </p>
            </div>
            <div className={styles.heroPanel}>
              <h2 className={styles.heroPanelTitle}>Workflow architecture</h2>
              <p className={styles.heroPanelDesc}>
                These docs also explain the broader thesis: organized agentic work, multi-agent teams,
                workflow composition, and the layers that can be built above the runtime.
              </p>
            </div>
          </div>
        </div>

        <div className={styles.installBlock}>
          <BashLine
            code="curl -fsSL https://raw.githubusercontent.com/KPO-Tech/seshat/main/scripts/install.sh | bash"
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
          <Link to={`${base}/learn/vision`} className={styles.secondaryLink}>
            Vision and direction
          </Link>
          <a
            href="https://github.com/KPO-Tech/seshat"
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
          Pick the path that matches what you need right now: install, understand the runtime, build workflows,
          or contribute to the open-source layer.
        </p>
        <div className={styles.grid}>
          {QUICK_PATHS.map(path => (
            <Link key={path.title} to={`${base}${path.href}`} className={styles.cardLink}>
              <div className={`${styles.card} ${styles.cardActive}`}>
                <div className={styles.cardHeader}>
                  <span className={styles.cardTitle}>{path.title}</span>
                </div>
                <p className={styles.cardDesc}>{path.desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>How the ecosystem is split</h2>
        <div className={styles.stack}>
          <div className={styles.stackItem}>
            <span className={styles.stackLabel}>Interfaces</span>
            <p className={styles.stackText}>CLI, Go SDK, gRPC clients, and future SDKs consume the same runtime foundation.</p>
          </div>
          <div className={styles.stackArrow}>↓</div>
          <div className={styles.stackItem}>
            <span className={styles.stackLabel}>Runtime core</span>
            <p className={styles.stackText}>`seshat` owns sessions, tools, permissions, memory, MCP, RAG, execution, and agent primitives.</p>
          </div>
          <div className={styles.stackArrow}>↓</div>
          <div className={styles.stackItem}>
            <span className={styles.stackLabel}>Workflow systems above it</span>
            <p className={styles.stackText}>Enterprise workflow products, private delivery layers, and higher-level team systems can sit above the runtime, but these docs stay focused on the public foundation.</p>
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
            <Link to={`${base}/getting-started/quick-start`} className={styles.quickLink}>Quick Start</Link>
            <Link to={`${base}/concepts/what-is-seshat`} className={styles.quickLink}>Concepts</Link>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Documentation status</h2>
        <p className={styles.sectionIntro}>
          The structure is broader than the currently published content. This page reflects the actual state
          instead of pretending every layer is already complete.
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
            href="https://github.com/KPO-Tech/seshat"
            className={styles.repoCard}
            target="_blank"
            rel="noreferrer"
          >
            <span className={styles.repoName}>seshat</span>
            <p className={styles.repoDesc}>Open-source runtime, CLI, SDK, providers, tools, MCP, RAG, and execution engine.</p>
          </a>
          <a
            href="https://github.com/KPO-Tech/seshat-skills"
            className={styles.repoCard}
            target="_blank"
            rel="noreferrer"
          >
            <span className={styles.repoName}>seshat-skills</span>
            <p className={styles.repoDesc}>Reusable skills, examples, and higher-level building blocks for practical workflow systems.</p>
          </a>
        </div>
      </section>
    </div>
  )
}
